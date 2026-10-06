// Tool color lives in inventory_items.color, added by supabase/migrations/004_tool_color.sql.
// Like PO numbers, the website and the database update go live separately, so every screen
// checks whether the column exists and, if not, hides the color fields and says why.

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export const COLOR_NOT_ENABLED =
  "Tool colors aren't switched on in the database yet. An admin needs to run the 004_tool_color.sql update in Supabase. Everything else works as normal.";

/** Short version, shown where the Color field would be. */
export const COLOR_SHORT_NOTE = 'Color: not switched on yet (an admin needs to run the 004_tool_color.sql update).';

export interface ToolColor { value: string; label: string; hex: string }

export const TOOL_COLORS: ToolColor[] = [
  { value: 'red', label: 'Red', hex: '#dc2626' },
  { value: 'orange', label: 'Orange', hex: '#ea580c' },
  { value: 'yellow', label: 'Yellow', hex: '#facc15' },
  { value: 'green', label: 'Green', hex: '#16a34a' },
  { value: 'blue', label: 'Blue', hex: '#2563eb' },
  { value: 'purple', label: 'Purple', hex: '#9333ea' },
  { value: 'pink', label: 'Pink', hex: '#ec4899' },
  { value: 'brown', label: 'Brown', hex: '#92400e' },
  { value: 'black', label: 'Black', hex: '#111827' },
  { value: 'white', label: 'White', hex: '#ffffff' },
  { value: 'gray', label: 'Gray', hex: '#6b7280' },
  { value: 'silver', label: 'Silver', hex: '#c0c0c0' },
];
const byValue = new Map(TOOL_COLORS.map((c) => [c.value, c]));

/** The Select can't use '' as a value, so "None" is this. */
export const NO_COLOR = 'none';

export const findColor = (v: string | null | undefined): ToolColor | undefined => (v ? byValue.get(v.toLowerCase()) : undefined);
/** "Red", or '' for no/unknown color. */
export const colorLabel = (v: string | null | undefined) => findColor(v)?.label ?? '';

/**
 * A color typed in a spreadsheet: "Red", " red ", "GREY" -> 'red' / 'gray'.
 * Returns null when empty, 'invalid' when it isn't one of the colors.
 */
export function parseColor(value: unknown): string | null | 'invalid' {
  const s = String(value ?? '').trim().toLowerCase();
  if (!s || s === 'none') return null;
  const v = s === 'grey' ? 'gray' : s;
  return byValue.has(v) ? v : 'invalid';
}

let cached: boolean | null = null;
let pending: Promise<boolean> | null = null;

/** True when an error means "the color column doesn't exist (yet)". */
export function isMissingColorColumnError(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null;
  const msg = (e?.message ?? '').toLowerCase();
  return /\bcolor\b/.test(msg) && (e?.code === '42703' || e?.code === 'PGRST204' || msg.includes('does not exist') || msg.includes('schema cache'));
}

/** Does inventory_items.color exist? Asked once per page load. */
export function colorColumnAvailable(): Promise<boolean> {
  if (cached !== null) return Promise.resolve(cached);
  if (!pending) {
    pending = (async () => {
      const { error } = await supabase.from('inventory_items').select('color').limit(1);
      if (!error) { cached = true; return true; }
      if (isMissingColorColumnError(error)) { cached = false; return false; }
      console.error('Could not check for the color column (will ask again later):', error);
      return false; // network trouble: don't remember the answer
    })().finally(() => { pending = null; });
  }
  return pending;
}

/** After a save fails because the column is missing, remember that. */
export function markColorColumnMissing() { cached = false; }

/** React hook: null while checking, then true/false. */
export function useColorSupport(): boolean | null {
  const [ok, setOk] = useState<boolean | null>(cached);
  useEffect(() => {
    let alive = true;
    colorColumnAvailable().then((v) => { if (alive) setOk(v); });
    return () => { alive = false; };
  }, []);
  return ok;
}

/** Put one color (or none) on many tools at once, and log it. Returns how many changed. */
export async function setColorOnTools(
  companyId: string, userId: string | undefined, tools: { id: string; name: string }[], color: string | null,
): Promise<number> {
  const ids = tools.map((t) => t.id);
  let changed = 0;
  for (let i = 0; i < ids.length; i += 150) {
    const { data, error } = await supabase
      .from('inventory_items').update({ color }).eq('company_id', companyId).in('id', ids.slice(i, i + 150)).select('id');
    if (error) {
      if (isMissingColorColumnError(error)) { markColorColumnMissing(); throw new Error(COLOR_NOT_ENABLED); }
      throw new Error(error.message);
    }
    changed += data?.length ?? 0;
  }
  const names = [...new Set(tools.map((t) => t.name))];
  await supabase.from('activity_logs').insert({
    company_id: companyId, user_id: userId, action: 'color_set',
    details: { color, tool_count: changed, item_name: names.length === 1 ? names[0] : `${names.length} kinds of tools`, item_ids: ids },
  });
  return changed;
}
