// Supabase connection settings, read from Vite env vars at build time.
// See .env.example. Missing or unsafe values stop the app from starting.

export const PRODUCTION_PROJECT_REF = 'actgfkpgwcfwxaecplhi';

function fail(message: string): never {
  const full = `[config] ${message} See .env.example.`;
  if (typeof document !== 'undefined') {
    document.body.innerHTML =
      '<pre style="margin:0;padding:24px;background:#b91c1c;color:#fff;font:16px/1.5 monospace;white-space:pre-wrap">' +
      full.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!)) +
      '</pre>';
  }
  throw new Error(full);
}

const url = (import.meta.env.VITE_SUPABASE_URL ?? '').trim();
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim();

const missing = [
  !url && 'VITE_SUPABASE_URL',
  !anonKey && 'VITE_SUPABASE_ANON_KEY',
].filter(Boolean);
if (missing.length) fail(`Missing environment variable(s): ${missing.join(', ')}.`);

let host: string;
try {
  host = new URL(url).hostname;
} catch {
  fail(`VITE_SUPABASE_URL is not a valid URL: "${url}".`);
}

// A secret/service_role key must never ship to the browser.
function isServiceRoleKey(key: string): boolean {
  if (key.startsWith('sb_secret_')) return true;
  const parts = key.split('.');
  if (parts.length !== 3) return false;
  try {
    return JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'))).role === 'service_role';
  } catch {
    return false;
  }
}
if (isServiceRoleKey(anonKey)) {
  fail('VITE_SUPABASE_ANON_KEY is a secret/service_role key. Use the anon or publishable key.');
}

export const SUPABASE_URL = url;
export const SUPABASE_ANON_KEY = anonKey;

// "<ref>.supabase.co" -> "<ref>". Unknown hosts (custom domains) yield null
// and are treated as non-production so the staging banner shows.
export const PROJECT_REF: string | null = host.endsWith('.supabase.co') ? host.split('.')[0] : null;
export const IS_PRODUCTION = PROJECT_REF === PRODUCTION_PROJECT_REF;
