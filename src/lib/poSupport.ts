// PO number + purchase date live in inventory_items.po_number / purchase_date, added by
// supabase/migrations/003_po_number.sql. The website and the database update go live
// separately, so every screen checks whether the columns exist and, if not, hides the PO
// fields and says why instead of failing.

import { useEffect, useState } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '@/lib/supabase';

export const PO_NOT_ENABLED =
  "PO numbers aren't switched on in the database yet. An admin needs to run the 003_po_number.sql update in Supabase. Everything else works as normal.";

let cached: boolean | null = null;
let pending: Promise<boolean> | null = null;

/** True when an error means "the PO columns don't exist (yet)". */
export function isMissingPoColumnError(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null;
  const msg = (e?.message ?? '').toLowerCase();
  const aboutPo = msg.includes('po_number') || msg.includes('purchase_date');
  return aboutPo && (e?.code === '42703' || e?.code === 'PGRST204' || msg.includes('does not exist') || msg.includes('schema cache'));
}

/** Do inventory_items.po_number and purchase_date exist? Asked once per page load. */
export function poColumnsAvailable(): Promise<boolean> {
  if (cached !== null) return Promise.resolve(cached);
  if (!pending) {
    pending = (async () => {
      const { error } = await supabase.from('inventory_items').select('po_number, purchase_date').limit(1);
      if (!error) { cached = true; return true; }
      if (isMissingPoColumnError(error)) { cached = false; return false; }
      console.error('Could not check for PO columns (will ask again later):', error);
      return false; // network trouble: don't remember the answer
    })().finally(() => { pending = null; });
  }
  return pending;
}

/** After a save fails because the columns are missing, remember that. */
export function markPoColumnsMissing() { cached = false; }

/** Forget the answer, so the next check asks the database again. */
export function resetPoSupportCache() { cached = null; }

/** React hook: null while checking, then true/false. */
export function usePoSupport(): boolean | null {
  const [ok, setOk] = useState<boolean | null>(cached);
  useEffect(() => {
    let alive = true;
    poColumnsAvailable().then((v) => { if (alive) setOk(v); });
    return () => { alive = false; };
  }, []);
  return ok;
}

/**
 * Put one PO number (and optionally a purchase date) on many tools at once, and log it.
 * `purchaseDate` undefined = leave each tool's date alone. Returns how many tools changed.
 */
export async function setPoOnTools(
  companyId: string, userId: string | undefined, tools: { id: string; name: string }[],
  poNumber: string, purchaseDate?: string,
): Promise<number> {
  const values: Record<string, string | null> = { po_number: poNumber.trim() || null };
  if (purchaseDate !== undefined) values.purchase_date = purchaseDate || null;
  const ids = tools.map((t) => t.id);
  let changed = 0;
  for (let i = 0; i < ids.length; i += 150) {
    const { data, error } = await supabase
      .from('inventory_items').update(values).eq('company_id', companyId).in('id', ids.slice(i, i + 150)).select('id');
    if (error) {
      if (isMissingPoColumnError(error)) { markPoColumnsMissing(); throw new Error(PO_NOT_ENABLED); }
      throw error;
    }
    changed += data?.length ?? 0;
  }
  const names = [...new Set(tools.map((t) => t.name))];
  await supabase.from('activity_logs').insert({
    company_id: companyId, user_id: userId, action: 'po_number_set',
    details: {
      po_number: values.po_number, purchase_date: values.purchase_date, tool_count: changed,
      item_name: names.length === 1 ? names[0] : `${names.length} kinds of tools`, item_ids: ids,
    },
  });
  return changed;
}

/** "2026-09-28" -> "Sep 28, 2026" (dates are stored without a time, so no time-zone shifts). */
export function formatPurchaseDate(d: string | null | undefined): string {
  if (!d) return '';
  const [y, m, day] = d.split('-').map(Number);
  if (!y || !m || !day) return d;
  return new Date(y, m - 1, day).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * Purchase date from a spreadsheet cell: Excel date numbers, 2026-09-28, 2026/09/28,
 * or US style 9/28/2026 (or 9/28/26). Returns "YYYY-MM-DD", null when empty, or 'invalid'.
 */
export function parsePurchaseDate(value: unknown): string | null | 'invalid' {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  const pad = (n: number) => String(n).padStart(2, '0');
  const valid = (y: number, m: number, d: number) => {
    const dt = new Date(y, m - 1, d);
    return y > 1900 && dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d ? `${y}-${pad(m)}-${pad(d)}` : 'invalid';
  };
  if (typeof value === 'number') {
    const p = XLSX.SSF.parse_date_code(value);
    return p ? valid(p.y, p.m, p.d) : 'invalid';
  }
  const s = String(value).trim();
  let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (m) return valid(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (m) return valid(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[1], +m[2]);
  return 'invalid';
}
