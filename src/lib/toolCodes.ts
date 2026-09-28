// Tool barcodes: company prefix + number (e.g. CAP-00142), uniqueness checks, and saving
// a code onto a tool. Codes are stored in inventory_items.barcode.

import { supabase } from '@/lib/supabase';
import { fetchAll } from '@/lib/fetchAll';

export const CODE_DIGITS = 5;

const FILLER_WORDS = new Set(['THE', 'AND', 'OF', 'INC', 'LLC', 'LTD', 'CO', 'CORP', 'COMPANY', 'CORPORATION']);

/**
 * Prefix from the company name: the initials when the name has 3+ significant words
 * ("Caplinger Heating and Air" -> CHA), otherwise its first three letters
 * ("Caplinger" or "Caplinger HVAC" -> CAP).
 */
export function companyPrefix(companyName: string): string {
  const words = companyName.toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim().split(' ')
    .filter((w) => w && !FILLER_WORDS.has(w));
  if (words.length >= 3) return words.map((w) => w[0]).join('').slice(0, 4);
  const letters = words.join('');
  return letters.slice(0, 3) || 'TOOL';
}

export const formatCode = (prefix: string, n: number) => `${prefix}-${String(n).padStart(CODE_DIGITS, '0')}`;

/** 142 for "CAP-00142" (any capitals), null for codes in another format. */
export function codeNumber(code: string, prefix: string): number | null {
  const m = code.trim().toUpperCase().match(new RegExp(`^${prefix}-(\\d+)$`));
  return m ? Number(m[1]) : null;
}

/** The next `count` free codes after the highest existing one for this prefix. */
export function nextCodes(existing: string[], prefix: string, count = 1): string[] {
  const taken = new Set(existing.map((c) => c.trim().toUpperCase()));
  let n = Math.max(0, ...existing.map((c) => codeNumber(c, prefix) ?? 0));
  const out: string[] = [];
  while (out.length < count) {
    n += 1;
    const code = formatCode(prefix, n);
    if (!taken.has(code)) out.push(code);
  }
  return out;
}

/** Every barcode already used by this company's tools. */
export async function loadCompanyBarcodes(companyId: string): Promise<string[]> {
  const rows = await fetchAll(() => supabase
    .from('inventory_items').select('barcode').eq('company_id', companyId).not('barcode', 'is', null).order('id'));
  return rows.map((r) => String(r.barcode)).filter((b) => b.trim());
}

export async function generateNextCode(companyId: string, companyName: string): Promise<string> {
  return nextCodes(await loadCompanyBarcodes(companyId), companyPrefix(companyName))[0];
}

export interface ToolRef {
  id: string;
  name: string;
  location: string;
}

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/** Which of this company's tools already has this code (capital letters ignored), if any. */
export async function findToolWithBarcode(companyId: string, code: string, excludeToolId?: string): Promise<ToolRef | null> {
  const { data, error } = await supabase
    .from('inventory_items')
    .select('id, name, location_type, trucks:assigned_truck_id (name)')
    .eq('company_id', companyId)
    .ilike('barcode', escapeLike(code.trim()))
    .limit(5);
  if (error) throw error;
  const hit = (data ?? []).find((r) => r.id !== excludeToolId);
  if (!hit) return null;
  const truck = hit.trucks as unknown as { name?: string } | null;
  return { id: hit.id, name: hit.name, location: hit.location_type === 'truck' ? truck?.name ?? 'a van' : 'Warehouse' };
}

export const describeConflict = (code: string, t: ToolRef) => `${code} is already on "${t.name}" (${t.location}).`;

export interface AssignResult {
  ok: boolean;
  /** Why it failed, in plain English. */
  reason?: string;
  /** Another company already uses this code. */
  usedElsewhere?: boolean;
}

/**
 * Save `code` as the tool's barcode (after checking this company doesn't use it), and log it.
 * Codes must also be unique across every company in the app (database rule), so a code
 * another company uses is refused with usedElsewhere = true.
 */
export async function assignBarcode(
  companyId: string, userId: string | undefined, tool: { id: string; name: string; barcode?: string | null }, rawCode: string,
): Promise<AssignResult> {
  const code = rawCode.trim();
  if (!code) return { ok: false, reason: 'Enter or generate a code first.' };
  const conflict = await findToolWithBarcode(companyId, code, tool.id);
  if (conflict) return { ok: false, reason: describeConflict(code, conflict) };

  const { data, error } = await supabase
    .from('inventory_items').update({ barcode: code }).eq('id', tool.id).eq('company_id', companyId).select('id');
  if (error) {
    if (error.code === '23505') {
      return { ok: false, usedElsewhere: true, reason: `${code} is already used by a tool in another company (codes must be unique across the whole app). Generate a different code.` };
    }
    return { ok: false, reason: `Couldn't save the code: ${error.message}` };
  }
  if (!data?.length) return { ok: false, reason: "The code wasn't saved. You may not have permission to change this tool." };

  await supabase.from('activity_logs').insert({
    company_id: companyId, user_id: userId, action: 'barcode_assigned', item_id: tool.id,
    details: { item_id: tool.id, item_name: tool.name, barcode: code, previous_barcode: tool.barcode || null },
  });
  return { ok: true };
}

export interface BulkAssignOutcome {
  toolId: string;
  code?: string;
  error?: string;
}

/**
 * Give each tool the next free code, one at a time. If a code turns out to be used by another
 * company, skip to the next number and try again (up to 25 times per tool).
 */
export async function assignCodesInBulk(
  companyId: string, userId: string | undefined, companyName: string,
  tools: { id: string; name: string; barcode?: string | null }[],
  onProgress?: (done: number) => void,
): Promise<BulkAssignOutcome[]> {
  const prefix = companyPrefix(companyName);
  const used = await loadCompanyBarcodes(companyId);
  const results: BulkAssignOutcome[] = [];
  for (const tool of tools) {
    let outcome: BulkAssignOutcome = { toolId: tool.id, error: 'No free code found.' };
    for (let attempt = 0; attempt < 25; attempt++) {
      const [code] = nextCodes(used, prefix);
      used.push(code);
      const r = await assignBarcode(companyId, userId, tool, code);
      if (r.ok) { outcome = { toolId: tool.id, code }; break; }
      if (!r.usedElsewhere) { outcome = { toolId: tool.id, error: r.reason }; break; }
    }
    results.push(outcome);
    onProgress?.(results.length);
  }
  return results;
}
