// npm run clone:staging            restore the latest backup into an EMPTY staging database
// npm run clone:staging -- --reset wipe staging's copy first (your schemas + auth/storage rows), then restore
//
// Everything runs in ONE transaction with ON_ERROR_STOP: on any error, staging is left
// exactly as it was. Data is loaded with session_replication_role=replica so triggers
// and FK checks don't fire while rows arrive in arbitrary order.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  DATA_EXCLUDED_TABLES, PROD_REF, ask, c, checkPort, die, findPgTool, latestBackup, liveRowCounts,
  loadEnv, main, printTable, projectRefFromDbUrl, query, redact, requireEnv, run,
  serverMajorVersion, step, toolMajorVersion,
} from './lib.mjs';

const sqlArray = (xs) => `array[${xs.map((x) => `'${x.replace(/'/g, "''")}'`).join(',')}]::text[]`;

function resetSql(userSchemas) {
  return `
-- Wipe the previous clone. Runs inside the same transaction as the restore.
SET session_replication_role = replica;
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT nspname FROM pg_namespace WHERE nspname = ANY(${sqlArray(userSchemas)}) LOOP
    EXECUTE format('DROP SCHEMA %I CASCADE', r.nspname);
  END LOOP;
  FOR r IN SELECT schemaname, tablename FROM pg_tables
           WHERE schemaname IN ('auth', 'storage')
             AND schemaname || '.' || tablename <> ALL(${sqlArray(DATA_EXCLUDED_TABLES)}) LOOP
    EXECUTE format('DELETE FROM %I.%I', r.schemaname, r.tablename);
  END LOOP;
  FOR r IN SELECT schemaname, tablename, policyname FROM pg_policies WHERE schemaname IN ('auth', 'storage') LOOP
    EXECUTE format('DROP POLICY %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
  END LOOP;
END $$;
-- Recreate public with Supabase's default grants (schema.sql then applies prod's own grants).
CREATE SCHEMA IF NOT EXISTS public;
GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres, anon, authenticated, service_role;
SET session_replication_role = origin;
`;
}

main(async () => {
  const reset = process.argv.includes('--reset');
  loadEnv();
  const dbUrl = requireEnv('STAGING_DB_URL');

  // ---- safety: never touch production ----
  if (dbUrl.toLowerCase().includes(PROD_REF)) die(`STAGING_DB_URL contains the PRODUCTION ref (${PROD_REF}). Refusing to run.`);
  const ref = projectRefFromDbUrl(dbUrl);
  if (!ref) die('Cannot tell which Supabase project STAGING_DB_URL points to. Use the Session pooler or direct connection string from the staging project dashboard.');
  if (ref === PROD_REF) die('STAGING_DB_URL points to production. Refusing to run.');
  const prodUrl = (process.env.PROD_DB_URL ?? '').trim();
  if (prodUrl && prodUrl === dbUrl) die('STAGING_DB_URL is identical to PROD_DB_URL. Refusing to run.');
  checkPort(dbUrl, 'STAGING_DB_URL');

  const dir = latestBackup();
  if (!dir) die('No complete backup found in backups/. Run: npm run backup:prod');
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  const ageMin = Math.round((Date.now() - Date.parse(manifest.createdAt)) / 60000);
  step(`Restoring backup ${path.basename(dir)} ${c.dim(`(${ageMin} min old, from ${manifest.projectRef})`)}`);
  console.log(`Target: staging project ${c.bold(ref)} ${c.dim(redact(dbUrl))}`);

  const psql = findPgTool('psql');
  const client = await toolMajorVersion(psql);
  const dumpMajor = Number((manifest.pgDump.match(/(\d+)/) ?? [])[1] ?? 0);
  if (client.major < dumpMajor) die(`psql ${client.major} is older than the pg_dump ${dumpMajor} that made this backup. Use the same PostgreSQL client version.`);
  const stagingMajor = await serverMajorVersion(psql, dbUrl);
  if (stagingMajor < manifest.serverMajor) die(`Staging runs PostgreSQL ${stagingMajor} but production runs ${manifest.serverMajor}. Upgrade the staging project first (Settings > Infrastructure).`);

  // ---- is staging empty? ----
  const [[objects, users]] = await query(psql, dbUrl, `
    select (select count(*) from pg_class cl join pg_namespace n on n.oid = cl.relnamespace
            where cl.relkind in ('r','p','v','m','S','f') and n.nspname = any(${sqlArray(manifest.userSchemas)})),
           (select count(*) from auth.users)`);
  const empty = Number(objects) === 0 && Number(users) === 0;
  if (!empty && !reset) {
    die(`Staging is not empty (${objects} tables/views/sequences in ${manifest.userSchemas.join(', ')}; ${users} auth users).\n` +
        `To wipe it and re-clone, run: npm run clone:staging -- --reset`);
  }
  if (!empty && reset) {
    console.log(c.yellow(`\n--reset will DELETE staging's ${manifest.userSchemas.join(', ')} schemas, all ${users} staging logins and storage metadata, then restore.`));
    const answer = await ask(`Type the staging project ref (${ref}) to continue: `);
    if (answer !== ref) die('Confirmation did not match. Nothing was changed.');
  }

  for (const w of manifest.warnings ?? []) console.log(c.yellow('WARNING: ') + w);

  // ---- restore in one transaction ----
  const f = (name) => path.join(dir, name);
  const args = ['--no-psqlrc', '-X', '-q', '--single-transaction', '-v', 'ON_ERROR_STOP=1',
    '-c', 'SET statement_timeout = 0', '-c', 'SET client_min_messages = warning'];
  if (!empty && reset) {
    const resetFile = path.join(os.tmpdir(), `clone-reset-${Date.now()}.sql`);
    fs.writeFileSync(resetFile, resetSql(manifest.userSchemas));
    args.push('-f', resetFile);
  }
  args.push(
    '-f', f('roles.sql'),
    '-f', f('extensions.sql'),
    '-f', f('schema.sql'),
    '-f', f('extras.sql'),
    '-c', 'SET session_replication_role = replica',
    '-f', f('data.sql'),
    '-c', 'SET session_replication_role = origin',
    '--dbname', dbUrl,
  );
  step('Restoring (single transaction, stops on first error)');
  const t0 = Date.now();
  try {
    await run(psql, args);
  } catch (err) {
    die(`Restore failed and was rolled back — staging is unchanged. ${err.message}`);
  }
  console.log(c.green(`Restored in ${Math.round((Date.now() - t0) / 1000)}s`));

  // ---- compare row counts ----
  step('Row counts: staging vs production');
  const tables = Object.keys(manifest.rowCounts);
  const staging = await liveRowCounts(psql, dbUrl, tables);
  let prodNow = null;
  if (prodUrl && projectRefFromDbUrl(prodUrl) === PROD_REF) {
    try { prodNow = await liveRowCounts(psql, prodUrl, tables); } catch { console.log(c.dim('(could not read live production counts; showing backup counts only)')); }
  }
  const fmt = (n) => (n === null || n === undefined ? 'missing' : n.toLocaleString('en-US'));
  let mismatches = 0;
  const rows = tables.map((t) => {
    const backup = manifest.rowCounts[t];
    const s = staging.get(t);
    const ok = s === backup;
    if (!ok) mismatches++;
    const row = [t, fmt(s), fmt(backup)];
    if (prodNow) row.push(fmt(prodNow.get(t)));
    row.push(ok ? 'ok' : 'MISMATCH');
    row.__color = ok ? undefined : c.red;
    return row;
  });
  const headers = ['table', 'staging', 'prod (backup)'];
  if (prodNow) headers.push('prod (now)');
  headers.push('');
  printTable(headers, rows);
  if (mismatches) console.log(c.red(`\n${mismatches} table(s) differ from the backup.`));
  else console.log(c.green(`\nAll ${tables.length} tables match the backup.`));
  if (prodNow) console.log(c.dim('"prod (now)" can differ from the backup if people used the app since the backup ran.'));

  // ---- logins ----
  const [[userCount, withPassword]] = await query(psql, dbUrl,
    `select count(*), count(*) filter (where coalesce(encrypted_password, '') <> '') from auth.users`);
  step('Logins');
  console.log(`${userCount} auth users on staging; ${withPassword} have a password hash and can sign in with their production password.`);
  console.log(c.dim('Existing browser sessions do not carry over (staging has its own JWT secret) — users just sign in again.'));
});
