// npm run migrate -- staging            apply pending supabase/migrations/*.sql to staging
// npm run migrate -- prod               same for production (backs up first, asks you to type the project name)
// npm run migrate -- <env> --dry-run    show what would run, change nothing
// npm run migrate -- <env> --baseline <file|none>
//     First-time setup on a database: create the history table and record every migration
//     up to and including <file> as already applied WITHOUT running it (use this for
//     migrations that were applied by hand before this script existed). "none" records nothing.
//
// Each migration runs in its own transaction together with its history row, so a file is
// either fully applied and recorded, or not at all. The run stops at the first failure.
// History lives in _ops.schema_migrations (a schema the Data API does not expose).

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { backupProd } from './backup-prod.mjs';
import {
  MIGRATIONS_DIR, PROD_REF, ask, c, checkPort, die, findPgTool, loadEnv, main, projectRefFromDbUrl,
  query, redact, requireEnv, run, step,
} from './lib.mjs';

const HISTORY = '_ops.schema_migrations';
const CREATE_HISTORY = `
CREATE SCHEMA IF NOT EXISTS _ops;
REVOKE ALL ON SCHEMA _ops FROM PUBLIC;
CREATE TABLE IF NOT EXISTS ${HISTORY} (
  filename   text PRIMARY KEY,
  checksum   text NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now(),
  applied_by text NOT NULL DEFAULT current_user,
  baseline   boolean NOT NULL DEFAULT false
);`;

const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;

function parseArgs(argv) {
  const args = { env: null, dryRun: false, baseline: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === 'staging' || a === 'prod') args.env = a;
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--baseline') args.baseline = argv[++i] ?? die('--baseline needs a filename or "none".');
    else if (a.startsWith('--baseline=')) args.baseline = a.slice('--baseline='.length);
    else die(`Unknown argument "${a}". Usage: npm run migrate -- staging|prod [--dry-run] [--baseline <file|none>]`);
  }
  if (!args.env) die('Say which database: npm run migrate -- staging   or   npm run migrate -- prod');
  return args;
}

function readMigrations() {
  if (!fs.existsSync(MIGRATIONS_DIR)) return [];
  return fs.readdirSync(MIGRATIONS_DIR)
    .filter((n) => n.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))
    .map((name) => {
      const file = path.join(MIGRATIONS_DIR, name);
      const sql = fs.readFileSync(file, 'utf8');
      // Normalize line endings so a git CRLF checkout doesn't look like an edit.
      const checksum = crypto.createHash('sha256').update(sql.replace(/\r\n/g, '\n')).digest('hex');
      return { name, file, sql, checksum };
    });
}

/** Statements that cannot run inside the transaction this script wraps each file in. */
function transactionProblems(sql) {
  const problems = [];
  // Bare "BEGIN;" only — a plpgsql "BEGIN" (no semicolon) / "END;" is a function body, not a transaction.
  if (/^\s*(BEGIN|START\s+TRANSACTION)\s*;/im.test(sql)) problems.push('BEGIN;');
  if (/^\s*(COMMIT|ROLLBACK)\s*;/im.test(sql)) problems.push('COMMIT;/ROLLBACK;');
  if (/\bCONCURRENTLY\b/i.test(sql)) problems.push('CONCURRENTLY');
  if (/^\s*VACUUM\b/im.test(sql)) problems.push('VACUUM');
  return problems;
}

function resolveTarget(env) {
  loadEnv();
  if (env === 'staging') {
    const url = requireEnv('STAGING_DB_URL');
    if (url.toLowerCase().includes(PROD_REF)) die(`STAGING_DB_URL contains the PRODUCTION ref (${PROD_REF}). Refusing to run.`);
    const ref = projectRefFromDbUrl(url);
    if (!ref) die('Cannot tell which Supabase project STAGING_DB_URL points to.');
    checkPort(url, 'STAGING_DB_URL');
    return { url, ref };
  }
  const url = requireEnv('PROD_DB_URL');
  const ref = projectRefFromDbUrl(url);
  if (ref !== PROD_REF) die(`PROD_DB_URL points to "${ref ?? 'unknown'}", not production (${PROD_REF}).`);
  checkPort(url, 'PROD_DB_URL');
  return { url, ref, projectName: requireEnv('PROD_PROJECT_NAME') };
}

main(async () => {
  const args = parseArgs(process.argv.slice(2));
  const target = resolveTarget(args.env);
  const psql = findPgTool('psql');
  const migrations = readMigrations();
  const label = args.env === 'prod' ? c.red('PRODUCTION') : c.yellow('staging');

  step(`Checking migration history on ${label} ${c.dim(`${target.ref}  ${redact(target.url)}`)}`);
  const [[exists]] = await query(psql, target.url, `select to_regclass('${HISTORY}') is not null`);
  const hasHistory = exists === 't';

  let toBaseline = [];
  if (args.baseline) {
    if (hasHistory) die(`${HISTORY} already exists on this database; --baseline is only for first-time setup.`);
    if (args.baseline !== 'none') {
      const idx = migrations.findIndex((m) => m.name === args.baseline);
      if (idx < 0) die(`--baseline "${args.baseline}" is not a file in supabase/migrations. Files:\n  ${migrations.map((m) => m.name).join('\n  ')}`);
      toBaseline = migrations.slice(0, idx + 1);
    }
  } else if (!hasHistory) {
    die(`No migration history on this database yet (${HISTORY} does not exist).\n` +
        `If some migrations were already applied by hand, record them without running them:\n` +
        `  npm run migrate -- ${args.env} --baseline <last-applied-file>\n` +
        `If none were applied, start from scratch:\n` +
        `  npm run migrate -- ${args.env} --baseline none\n` +
        `Files: ${migrations.map((m) => m.name).join(', ') || '(none)'}`);
  }

  const applied = new Map();
  if (hasHistory) {
    for (const [name, checksum] of await query(psql, target.url, `select filename, checksum from ${HISTORY}`)) applied.set(name, checksum);
  }
  for (const m of toBaseline) applied.set(m.name, m.checksum);

  for (const m of migrations) {
    const prev = applied.get(m.name);
    if (prev && prev !== m.checksum) console.log(c.yellow('WARNING: ') + `${m.name} was edited after it was applied here. Edits are NOT re-run; put changes in a new migration.`);
  }
  for (const name of applied.keys()) {
    if (!migrations.some((m) => m.name === name)) console.log(c.yellow('WARNING: ') + `${name} is recorded as applied but the file no longer exists.`);
  }

  const pending = migrations.filter((m) => !applied.has(m.name));
  for (const m of pending) {
    const problems = transactionProblems(m.sql);
    if (problems.length) die(`${m.name} contains ${problems.join(', ')}. Migrations run inside a transaction; remove explicit transaction control / CONCURRENTLY.`);
  }

  if (toBaseline.length || args.baseline === 'none') {
    console.log(`Will create ${HISTORY} and record as already applied (NOT run):`);
    for (const m of toBaseline) console.log(`  ${c.dim('baseline')}  ${m.name}`);
    if (!toBaseline.length) console.log(c.dim('  (nothing)'));
  }
  console.log(pending.length ? 'Will apply, in order:' : c.green('Nothing to apply — database is up to date.'));
  for (const m of pending) console.log(`  ${c.bold('apply')}     ${m.name}`);

  const hasWork = pending.length || args.baseline;
  if (!hasWork || args.dryRun) {
    if (args.dryRun && hasWork) console.log(c.dim('\n--dry-run: nothing was changed.'));
    return;
  }

  // ---- confirmation ----
  let backupDir = null;
  if (args.env === 'prod') {
    step('Backing up production first');
    backupDir = await backupProd();
    console.log(c.red(`\nYou are about to change the PRODUCTION database (${target.ref}).`));
    const answer = await ask(`Type the production project name (${c.bold(target.projectName)}) to continue: `);
    if (answer !== target.projectName) die('Confirmation did not match. Nothing was changed.');
  } else {
    const answer = await ask(`Proceed on staging ${target.ref}? [y/N] `);
    if (!/^y(es)?$/i.test(answer)) die('Cancelled. Nothing was changed.');
  }

  const base = ['--no-psqlrc', '-X', '-q', '--single-transaction', '-v', 'ON_ERROR_STOP=1', '-c', 'SET statement_timeout = 0'];

  if (args.baseline) {
    step('Recording baseline');
    const inserts = toBaseline.map((m) => `INSERT INTO ${HISTORY} (filename, checksum, baseline) VALUES (${lit(m.name)}, ${lit(m.checksum)}, true);`).join('\n');
    await run(psql, [...base, '-c', CREATE_HISTORY + '\n' + inserts, '--dbname', target.url]);
    console.log(c.green(`Recorded ${toBaseline.length} baseline migration(s).`));
  }

  for (const m of pending) {
    step(`Applying ${m.name}`);
    try {
      await run(psql, [...base, '-f', m.file,
        '-c', `INSERT INTO ${HISTORY} (filename, checksum) VALUES (${lit(m.name)}, ${lit(m.checksum)})`,
        '--dbname', target.url]);
    } catch (err) {
      die(`${m.name} failed and was rolled back; later migrations were not run.` +
          (backupDir ? `\nPre-migration backup: ${backupDir}` : '') + `\n${err.message}`);
    }
    console.log(c.green(`Applied ${m.name}`));
  }
  console.log('\n' + c.green(`Done. ${pending.length} migration(s) applied to ${args.env}.`));
});
