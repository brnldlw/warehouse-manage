// Shared helpers for the database scripts (backup, clone, migrate).
// Plain Node, no dependencies. Requires Node 20.12+ and the PostgreSQL client tools.

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';

export const ROOT = path.resolve(import.meta.dirname, '..');
export const BACKUPS_DIR = path.join(ROOT, 'backups');
export const MIGRATIONS_DIR = path.join(ROOT, 'supabase', 'migrations');
export const PROD_REF = 'actgfkpgwcfwxaecplhi';

// Schemas owned and managed by Supabase. Their structure already exists in
// every project, so they are never dumped as schema.
export const SUPABASE_SCHEMAS = [
  'information_schema', 'pg_*', '_analytics', '_realtime', '_supavisor', 'auth',
  'extensions', 'pgbouncer', 'realtime', 'storage', 'supabase_functions',
  'supabase_migrations', 'cron', 'dbdev', 'graphql', 'graphql_public', 'net',
  'pgmq', 'pgsodium', 'pgsodium_masks', 'pgtle', 'repack', 'tiger', 'tiger_data',
  'timescaledb_*', '_timescaledb_*', 'topology', 'vault',
];
// Managed schemas whose *data* we do copy: logins and file metadata.
export const DATA_SCHEMAS_FROM_SUPABASE = ['auth', 'storage'];
// Per-project bookkeeping tables inside auth/storage that must not be copied.
export const DATA_EXCLUDED_TABLES = ['auth.schema_migrations', 'storage.migrations'];

// ---------- output ----------

const tty = process.stdout.isTTY;
const paint = (code) => (s) => (tty ? `\x1b[${code}m${s}\x1b[0m` : String(s));
export const c = { red: paint('31;1'), green: paint('32'), yellow: paint('33;1'), cyan: paint('36'), dim: paint('2'), bold: paint('1') };

export class Fatal extends Error {}
export function die(msg) { throw new Fatal(msg); }

/** Wrap a script's main() so failures print cleanly and exit non-zero. */
export async function main(fn) {
  try {
    await fn();
  } catch (err) {
    if (err instanceof Fatal) console.error('\n' + c.red('ERROR: ') + err.message);
    else console.error('\n' + c.red('UNEXPECTED ERROR:'), err);
    process.exit(1);
  }
}

export function step(msg) { console.log('\n' + c.cyan('==> ') + c.bold(msg)); }

// ---------- env ----------

export function loadEnv() {
  const file = path.join(ROOT, '.env.local');
  if (!fs.existsSync(file)) die(`.env.local not found at ${file}. Copy .env.example to .env.local and fill it in.`);
  if (typeof process.loadEnvFile !== 'function') die(`Node ${process.version} is too old. Install Node 20.12 or newer.`);
  process.loadEnvFile(file);
}

export function requireEnv(name) {
  const v = (process.env[name] ?? '').trim();
  if (!v) die(`${name} is not set in .env.local. See .env.example.`);
  return v;
}

/** Extract the Supabase project ref from a Postgres connection string, or null. */
export function projectRefFromDbUrl(dbUrl) {
  let u;
  try { u = new URL(dbUrl); } catch { die('A database URL in .env.local is not a valid postgresql:// URL. URL-encode special characters in the password (@ -> %40, # -> %23, / -> %2F).'); }
  if (!/^postgres(ql)?:$/.test(u.protocol)) die(`Database URL must start with postgresql:// (got ${u.protocol}).`);
  const user = decodeURIComponent(u.username);
  const m = user.match(/^[^.]+\.([a-z0-9]{20})$/); // pooler: postgres.<ref>
  if (m) return m[1];
  const h = u.hostname.match(/^db\.([a-z0-9]{20})\.supabase\.co$/); // direct: db.<ref>.supabase.co
  return h ? h[1] : null;
}

/** Hide the password when echoing a connection string. */
export function redact(dbUrl) {
  try { const u = new URL(dbUrl); if (u.password) u.password = '*****'; return u.toString(); } catch { return '<unparseable url>'; }
}

export function checkPort(dbUrl, label) {
  const u = new URL(dbUrl);
  if (u.port === '6543') {
    die(`${label} uses port 6543 (Transaction pooler). pg_dump/psql need the Session pooler (port 5432) or the direct connection. In the dashboard: Connect > "Session pooler".`);
  }
}

// ---------- PostgreSQL client tools ----------

const exe = (name) => (process.platform === 'win32' ? `${name}.exe` : name);

function versionOf(binDir) {
  const m = binDir.match(/PostgreSQL[\\/](\d+)/i);
  return m ? Number(m[1]) : 0;
}

/** Locate a PostgreSQL client binary: PG_BIN, then PATH, then C:\Program Files\PostgreSQL\<ver>\bin (newest). */
export function findPgTool(name) {
  const candidates = [];
  if (process.env.PG_BIN) candidates.push(path.join(process.env.PG_BIN.trim(), exe(name)));
  for (const dir of (process.env.PATH ?? '').split(path.delimiter)) if (dir) candidates.push(path.join(dir, exe(name)));
  if (process.platform === 'win32') {
    for (const base of [process.env.ProgramFiles, process.env['ProgramFiles(x86)']].filter(Boolean)) {
      const root = path.join(base, 'PostgreSQL');
      if (!fs.existsSync(root)) continue;
      const dirs = fs.readdirSync(root).map((d) => path.join(root, d, 'bin')).sort((a, b) => versionOf(b) - versionOf(a));
      for (const d of dirs) candidates.push(path.join(d, exe(name)));
    }
  }
  const found = candidates.find((p) => fs.existsSync(p));
  if (!found) {
    die(`${name} not found. Install the PostgreSQL client tools (run: npm run db:check-tools for instructions), or set PG_BIN in .env.local to the folder containing ${exe(name)}.`);
  }
  return found;
}

export async function toolMajorVersion(bin) {
  const { stdout } = await run(bin, ['--version'], { capture: true });
  const m = stdout.match(/(\d+)(?:\.\d+)?/);
  return { major: m ? Number(m[1]) : 0, text: stdout.trim() };
}

// ---------- processes ----------

/**
 * Run a program without a shell. Rejects on non-zero exit.
 * opts.capture: collect stdout (stderr still streams). opts.env: extra env vars.
 */
export function run(bin, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, {
      stdio: ['inherit', opts.capture ? 'pipe' : 'inherit', 'inherit'],
      env: { ...process.env, PGCONNECT_TIMEOUT: '20', ...(opts.env ?? {}) },
      windowsHide: true,
    });
    let stdout = '';
    if (opts.capture) child.stdout.on('data', (d) => (stdout += d));
    child.on('error', (err) => reject(new Fatal(`Could not start ${bin}: ${err.message}`)));
    child.on('close', (code) => {
      if (code === 0) resolve({ stdout });
      else reject(new Fatal(`${path.basename(bin)} exited with code ${code}. See the error above.`));
    });
  });
}

/** Run a single SQL query and return rows as arrays of strings (tab-separated, unaligned). */
export async function query(psql, dbUrl, sql) {
  const { stdout } = await run(psql, ['--no-psqlrc', '-X', '-q', '-A', '-t', '-F', '\t', '-v', 'ON_ERROR_STOP=1', '-c', sql, '--dbname', dbUrl], { capture: true });
  return stdout.split(/\r?\n/).filter((l) => l.length).map((l) => l.split('\t'));
}

export async function serverMajorVersion(psql, dbUrl) {
  const [[num]] = await query(psql, dbUrl, 'show server_version_num');
  return Math.floor(Number(num) / 10000);
}

// ---------- prompts ----------

export function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (a) => { rl.close(); resolve(a.trim()); }));
}

// ---------- backups ----------

export function timestamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/** Newest complete backup folder (one with manifest.json, which is written last). */
export function latestBackup() {
  if (!fs.existsSync(BACKUPS_DIR)) return null;
  const dirs = fs.readdirSync(BACKUPS_DIR)
    .filter((d) => fs.existsSync(path.join(BACKUPS_DIR, d, 'manifest.json')))
    .sort();
  return dirs.length ? path.join(BACKUPS_DIR, dirs[dirs.length - 1]) : null;
}

/**
 * Exact per-table row counts, read from the COPY blocks of a pg_dump data file.
 * This reflects exactly what was backed up (one line per row in COPY text format).
 */
export async function rowCountsFromDataDump(file) {
  const counts = new Map();
  const rl = readline.createInterface({ input: fs.createReadStream(file, 'utf8'), crlfDelay: Infinity });
  let current = null;
  for await (const line of rl) {
    if (current) {
      if (line === '\\.') current = null;
      else counts.set(current, counts.get(current) + 1);
    } else if (line.startsWith('COPY ')) {
      const m = line.match(/^COPY ((?:"(?:[^"]|"")+"|\w+)\.(?:"(?:[^"]|"")+"|\w+))/);
      if (m) { current = m[1].replace(/"((?:[^"]|"")+)"/g, (_, id) => id.replace(/""/g, '"')); counts.set(current, 0); }
    }
  }
  return counts;
}

/** Exact live row counts for the given "schema.table" names. Missing tables report null. */
export async function liveRowCounts(psql, dbUrl, tables) {
  if (!tables.length) return new Map();
  const list = tables.map((t) => `'${t.replace(/'/g, "''")}'`).join(',');
  const sql = `
    select t, case when to_regclass(format('%I.%I', split_part(t, '.', 1), split_part(t, '.', 2))) is null then null
      else (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', split_part(t, '.', 1), split_part(t, '.', 2)), false, true, '')))[1]::text::bigint end
    from unnest(array[${list}]) t`;
  const rows = await query(psql, dbUrl, sql);
  return new Map(rows.map(([t, n]) => [t, n === '' || n === undefined ? null : Number(n)]));
}

export function printTable(headers, rows) {
  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => String(r[i]).length)));
  const fmt = (r) => r.map((v, i) => (i === 0 ? String(v).padEnd(widths[i]) : String(v).padStart(widths[i]))).join('   ');
  console.log(c.bold(fmt(headers)));
  console.log(c.dim(widths.map((w) => '-'.repeat(w)).join('   ')));
  for (const r of rows) console.log(r.__color ? r.__color(fmt(r)) : fmt(r));
}
