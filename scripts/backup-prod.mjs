// npm run backup:prod
// Dumps roles, schema and data from PROD_DB_URL into backups/<timestamp>/ and
// prints exact row counts per table. Read-only against production.
//
// Files (restored in this order by clone-staging.mjs):
//   roles.sql       custom roles (Supabase-managed roles filtered out, no passwords)
//   extensions.sql  CREATE EXTENSION for every extension enabled in prod
//   schema.sql      structure of your own schemas (public, ...): tables, functions, RLS, grants
//   extras.sql      your triggers + RLS policies attached to Supabase's auth/storage tables,
//                   which pg_dump skips because those schemas are excluded above
//   data.sql        all rows of your schemas + auth (logins) + storage (file metadata)
//   manifest.json   written last; marks the backup complete, holds row counts

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  BACKUPS_DIR, DATA_EXCLUDED_TABLES, DATA_SCHEMAS_FROM_SUPABASE, PROD_REF, SUPABASE_SCHEMAS,
  c, checkPort, die, findPgTool, loadEnv, main, printTable, projectRefFromDbUrl, query, redact,
  requireEnv, rowCountsFromDataDump, run, serverMajorVersion, step, timestamp, toolMajorVersion,
} from './lib.mjs';

const exactInternal = SUPABASE_SCHEMAS.filter((s) => !s.includes('*'));
const sqlList = (xs) => xs.map((x) => `'${x}'`).join(',');

const isReservedRole = (r) =>
  ['postgres', 'anon', 'authenticated', 'authenticator', 'service_role', 'dashboard_user', 'pgbouncer'].includes(r) ||
  /^(pg_|supabase_|pgsodium_|cli_login_)/.test(r);

/** Drop Supabase-managed roles from pg_dumpall output; they already exist in every project. */
export function filterRoles(sql) {
  let commented = 0;
  const out = sql.split(/\r?\n/).map((line) => {
    const ids = [...line.matchAll(/"((?:[^"]|"")+)"/g)].map((m) => m[1]);
    if (/^(CREATE|ALTER|GRANT|REVOKE|COMMENT)\b/.test(line) && ids.some(isReservedRole)) { commented++; return `-- [supabase-managed] ${line}`; }
    // Non-superusers cannot grant these attributes; keep the role, drop the attribute.
    if (/^ALTER ROLE\b/.test(line)) return line.replace(/\s(SUPERUSER|REPLICATION|BYPASSRLS)\b/g, '');
    return line;
  });
  return { sql: out.join('\n'), commented };
}

/** Make a pg_dump schema file restorable into a fresh Supabase project as the postgres user. */
export function transformSchema(sql) {
  const lines = sql.split(/\r?\n/);
  const out = [];
  let skipping = false;
  for (const line of lines) {
    const startSkip =
      /^CREATE EVENT TRIGGER\b/.test(line) ||           // Supabase's own event triggers; superuser-only
      /^CREATE PUBLICATION "supabase_realtime/.test(line); // exists in every project
    if (skipping || startSkip) {
      out.push(`-- [supabase-managed] ${line}`);
      skipping = !/;\s*$/.test(line);
      continue;
    }
    if (
      /^SET transaction_timeout\b/.test(line) ||
      /^ALTER EVENT TRIGGER\b/.test(line) ||
      /^ALTER PUBLICATION "supabase_realtime[^"]*" OWNER TO\b/.test(line) ||
      /^COMMENT ON EXTENSION\b/.test(line) ||
      (/^ALTER DEFAULT PRIVILEGES FOR ROLE "([^"]+)"/.test(line) && line.match(/^ALTER DEFAULT PRIVILEGES FOR ROLE "([^"]+)"/)[1] !== 'postgres')
    ) {
      out.push(`-- [supabase-managed] ${line}`);
      continue;
    }
    out.push(line.replace(/^CREATE SCHEMA (?!IF NOT EXISTS)/, 'CREATE SCHEMA IF NOT EXISTS '));
  }
  return out.join('\n');
}

/** Things in the schema that could make staging talk to production or send real emails. */
function scanForProdReferences(schemaSql) {
  const warnings = [];
  if (schemaSql.includes(PROD_REF)) warnings.push(`schema.sql mentions the production ref (${PROD_REF}) â€” e.g. a trigger/function calling a prod URL.`);
  if (/\bnet\.http_(post|get)\b/.test(schemaSql)) warnings.push('schema.sql calls net.http_post/http_get (database webhooks). These will fire from staging too.');
  return warnings;
}

export async function backupProd() {
  loadEnv();
  const dbUrl = requireEnv('PROD_DB_URL');
  const ref = projectRefFromDbUrl(dbUrl);
  if (ref !== PROD_REF) die(`PROD_DB_URL points to project "${ref ?? 'unknown'}", not production (${PROD_REF}). Refusing so a backup is never mislabeled.`);
  checkPort(dbUrl, 'PROD_DB_URL');

  const pgDump = findPgTool('pg_dump');
  const pgDumpAll = findPgTool('pg_dumpall');
  const psql = findPgTool('psql');

  step(`Connecting to production ${c.dim(redact(dbUrl))}`);
  const serverMajor = await serverMajorVersion(psql, dbUrl);
  const tool = await toolMajorVersion(pgDump);
  console.log(`Server: PostgreSQL ${serverMajor}   Client: ${tool.text}`);
  if (tool.major < serverMajor) die(`pg_dump ${tool.major} cannot dump a PostgreSQL ${serverMajor} server. Install PostgreSQL ${serverMajor}+ client tools.`);

  const dir = path.join(BACKUPS_DIR, timestamp());
  fs.mkdirSync(dir, { recursive: true });
  const f = (name) => path.join(dir, name);
  console.log(`Backup folder: ${dir}`);

  step('Dumping roles');
  await run(pgDumpAll, ['--roles-only', '--no-role-passwords', '--quote-all-identifiers', '--no-comments', '--file', f('roles.sql'), '--dbname', dbUrl]);
  const roles = filterRoles(fs.readFileSync(f('roles.sql'), 'utf8'));
  fs.writeFileSync(f('roles.sql'), roles.sql);

  step('Recording enabled extensions');
  const ext = await query(psql, dbUrl, `
    select format('CREATE EXTENSION IF NOT EXISTS %I WITH SCHEMA %I CASCADE;', e.extname, n.nspname)
    from pg_extension e join pg_namespace n on n.oid = e.extnamespace
    where e.extname <> 'plpgsql' order by e.extname`);
  fs.writeFileSync(f('extensions.sql'), ext.map((r) => r[0]).join('\n') + '\n');
  console.log(`${ext.length} extensions`);

  step('Dumping schema');
  const excludeSchemas = SUPABASE_SCHEMAS.flatMap((s) => ['--exclude-schema', s]);
  await run(pgDump, ['--schema-only', '--quote-all-identifiers', '--no-owner', ...excludeSchemas, '--file', f('schema.sql'), '--dbname', dbUrl]);
  const schemaSql = transformSchema(fs.readFileSync(f('schema.sql'), 'utf8'));
  fs.writeFileSync(f('schema.sql'), schemaSql);

  step('Dumping your triggers and policies on auth/storage tables');
  const triggers = await query(psql, dbUrl, `
    select regexp_replace(pg_get_triggerdef(t.oid), '^CREATE TRIGGER', 'CREATE OR REPLACE TRIGGER') || ';'
    from pg_trigger t
    join pg_class cl on cl.oid = t.tgrelid join pg_namespace n on n.oid = cl.relnamespace
    join pg_proc p on p.oid = t.tgfoid join pg_namespace pn on pn.oid = p.pronamespace
    where not t.tgisinternal and n.nspname in ('auth', 'storage')
      and pn.nspname not in (${sqlList(exactInternal)}) and pn.nspname !~ '^pg_'
    order by 1`);
  const policies = await query(psql, dbUrl, `
    select format(E'DROP POLICY IF EXISTS %I ON %I.%I;\\nCREATE POLICY %I ON %I.%I AS %s FOR %s TO %s%s%s;',
      policyname, schemaname, tablename, policyname, schemaname, tablename, permissive, cmd,
      (select string_agg(quote_ident(r), ', ') from unnest(roles) r),
      coalesce(' USING (' || qual || ')', ''), coalesce(' WITH CHECK (' || with_check || ')', ''))
    from pg_policies where schemaname in ('auth', 'storage') order by schemaname, tablename, policyname`);
  // psql -A prints the embedded newline literally, which splits the row; rejoin.
  const policySql = policies.map((r) => r.join('\t')).join('\n');
  fs.writeFileSync(f('extras.sql'),
    `-- Triggers on auth/storage tables that call your functions\n${triggers.map((r) => r[0]).join('\n')}\n\n` +
    `-- RLS policies on auth/storage tables (storage bucket access rules)\n${policySql}\n`);
  console.log(`${triggers.length} triggers, ${(policySql.match(/^CREATE POLICY/gm) ?? []).length} policies`);

  step('Dumping data (your schemas + auth + storage metadata)');
  const excludeForData = SUPABASE_SCHEMAS.filter((s) => !DATA_SCHEMAS_FROM_SUPABASE.includes(s)).flatMap((s) => ['--exclude-schema', s]);
  const excludeTables = DATA_EXCLUDED_TABLES.flatMap((t) => ['--exclude-table', t]);
  await run(pgDump, ['--data-only', '--quote-all-identifiers', ...excludeForData, ...excludeTables, '--file', f('data.sql'), '--dbname', dbUrl]);

  const userSchemas = (await query(psql, dbUrl, `
    select nspname from pg_namespace
    where nspname !~ '^pg_' and nspname !~ '^_?timescaledb_' and nspname not in (${sqlList(exactInternal)})
    order by 1`)).map((r) => r[0]);

  const counts = await rowCountsFromDataDump(f('data.sql'));
  const warnings = scanForProdReferences(schemaSql);
  const sizes = Object.fromEntries(fs.readdirSync(dir).map((n) => [n, fs.statSync(f(n)).size]));

  fs.writeFileSync(f('manifest.json'), JSON.stringify({
    createdAt: new Date().toISOString(),
    projectRef: ref,
    serverMajor,
    pgDump: tool.text,
    userSchemas,
    rolesCommented: roles.commented,
    files: sizes,
    warnings,
    rowCounts: Object.fromEntries([...counts].sort()),
  }, null, 2));

  step('Row counts (exactly what is in data.sql)');
  const rows = [...counts].sort(([a], [b]) => a.localeCompare(b)).map(([t, n]) => [t, n.toLocaleString('en-US')]);
  printTable(['table', 'rows'], rows);
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  console.log(c.dim(`${counts.size} tables, ${total.toLocaleString('en-US')} rows total`));
  for (const w of warnings) console.log(c.yellow('WARNING: ') + w);
  console.log('\n' + c.green('Backup complete: ') + dir);
  return dir;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main(backupProd);
