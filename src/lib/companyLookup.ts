import { supabase } from '@/lib/supabase';
import { explainAuthError, isNetworkError } from '@/lib/authErrors';

export type CompanyLookup =
  | { ok: true; id: string; name: string }
  | { ok: false; reason: string };

/** "  Caplinger   HVAC " -> "caplinger hvac" */
const normalize = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();

/**
 * Find the company a new user typed on the sign-up form. Capital letters and extra
 * spaces don't matter; otherwise the name must match exactly.
 *
 * Note: this runs before the user is signed in. If the database only lets signed-in
 * users read `companies`, every lookup comes back empty — see docs/PENDING_DB_FIXES.md.
 */
export async function findCompanyByName(input: string): Promise<CompanyLookup> {
  const wanted = normalize(input);
  if (!wanted) return { ok: false, reason: 'Please enter your company name.' };

  // ilike is case-insensitive. Escape its wildcards (% and _) so they match literally, and
  // let each run of spaces match any spacing; then compare exactly below.
  const pattern = wanted
    .split(' ')
    .map((word) => word.replace(/[\\%_]/g, (c) => `\\${c}`))
    .join('%');

  const { data, error } = await supabase
    .from('companies')
    .select('id, name, is_active')
    .ilike('name', pattern)
    .limit(20);

  if (error) {
    return {
      ok: false,
      reason: isNetworkError(error)
        ? "Couldn't reach the server to check the company name. Check your internet connection and try again."
        : `Couldn't check the company name. ${explainAuthError(error)}`,
    };
  }

  const matches = (data ?? []).filter((c) => normalize(c.name ?? '') === wanted);
  const active = matches.filter((c) => c.is_active !== false);

  if (active.length === 1) return { ok: true, id: active[0].id, name: active[0].name };
  if (active.length > 1) {
    return { ok: false, reason: `More than one company is called "${input.trim()}". Ask your manager or admin to sort this out.` };
  }
  if (matches.length > 0) {
    return { ok: false, reason: `The company "${matches[0].name}" is marked inactive, so new accounts can't join it. Ask your manager.` };
  }
  return {
    ok: false,
    reason: `We couldn't find a company called "${input.trim()}". Check the exact name with your manager (capital letters don't matter). If your manager is sure it's right, they should contact the app admin.`,
  };
}
