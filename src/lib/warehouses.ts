// Multiple warehouses (migration 006_warehouses.sql). Like PO numbers and colors, the website
// and the database update go live separately: every screen asks once whether the warehouses
// table and the tool columns exist and, until they do, hides all warehouse features and works
// exactly as before (one unnamed "Warehouse").

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';

export interface Warehouse {
  id: string;
  company_id: string;
  name: string;
  address: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
}

/** True when an error means "the warehouse table/columns don't exist (yet)". */
export function isMissingWarehouseError(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null;
  const msg = (e?.message ?? '').toLowerCase();
  const about = msg.includes('warehouse');
  return about && (['42703', '42P01', 'PGRST204', 'PGRST205', 'PGRST200'].includes(e?.code ?? '')
    || msg.includes('does not exist') || msg.includes('schema cache') || msg.includes('could not find'));
}

let cached: boolean | null = null;
let pending: Promise<boolean> | null = null;

/** Does the database have warehouses yet? Asked once per page load. */
export function warehousesAvailable(): Promise<boolean> {
  if (cached !== null) return Promise.resolve(cached);
  if (!pending) {
    pending = (async () => {
      const [cols, table] = await Promise.all([
        supabase.from('inventory_items').select('home_warehouse_id, current_warehouse_id').limit(1),
        supabase.from('warehouses').select('id').limit(1),
      ]);
      const err = cols.error ?? table.error;
      if (!err) { cached = true; return true; }
      if (isMissingWarehouseError(err)) { cached = false; return false; }
      console.error('Could not check for warehouses (will ask again later):', err);
      return false;
    })().finally(() => { pending = null; });
  }
  return pending;
}

/** After a save fails because warehouses are missing, remember that. */
export function markWarehousesMissing() { cached = false; }

/** React hook: null while checking, then true/false. */
export function useWarehouseSupport(): boolean | null {
  const [ok, setOk] = useState<boolean | null>(cached);
  useEffect(() => {
    let alive = true;
    warehousesAvailable().then((v) => { if (alive) setOk(v); });
    return () => { alive = false; };
  }, []);
  return ok;
}

/** All of a company's warehouses (active first, then A–Z). [] when warehouses aren't switched on. */
export async function loadWarehouses(companyId: string): Promise<Warehouse[]> {
  if (!(await warehousesAvailable())) return [];
  const { data, error } = await supabase
    .from('warehouses').select('id, company_id, name, address, notes, is_active, created_at')
    .eq('company_id', companyId).order('name');
  if (error) {
    if (isMissingWarehouseError(error)) { markWarehousesMissing(); return []; }
    throw new Error(error.message);
  }
  return sortWarehouses((data ?? []) as Warehouse[]);
}

export const sortWarehouses = (list: Warehouse[]) =>
  [...list].sort((a, b) => Number(b.is_active) - Number(a.is_active) || a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }));

/** Warehouses for one company, reloadable. `supported` is null while checking. */
export function useWarehouses(companyId: string | undefined) {
  const supported = useWarehouseSupport();
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const reload = useCallback(async () => {
    if (!companyId || !supported) { setWarehouses([]); return; }
    try { setWarehouses(await loadWarehouses(companyId)); } catch (err) { console.error('Could not load warehouses:', err); }
  }, [companyId, supported]);
  useEffect(() => { reload(); }, [reload]);
  const byId = useMemo(() => new Map(warehouses.map((w) => [w.id, w])), [warehouses]);
  const active = useMemo(() => warehouses.filter((w) => w.is_active), [warehouses]);
  // "Warehouse features on" = database ready AND at least one warehouse exists.
  const enabled = !!supported && warehouses.length > 0;
  return { supported, enabled, warehouses, active, byId, reload };
}

export const warehouseLabel = (w: Pick<Warehouse, 'name' | 'is_active'> | undefined | null) =>
  (w ? `${w.name}${w.is_active ? '' : ' (inactive)'}` : '');

// ---- "last warehouse used" (per company, this browser only) ----
const lastKey = (companyId: string) => `wm-last-warehouse-${companyId}`;
export function getLastWarehouse(companyId: string | undefined, active: Warehouse[]): string {
  if (!companyId || !active.length) return '';
  let saved = '';
  try { saved = localStorage.getItem(lastKey(companyId)) ?? ''; } catch { /* storage unavailable */ }
  return active.some((w) => w.id === saved) ? saved : active[0].id;
}
export function setLastWarehouse(companyId: string | undefined, id: string) {
  if (!companyId || !id) return;
  try { localStorage.setItem(lastKey(companyId), id); } catch { /* storage unavailable */ }
}

// ---- add / edit / deactivate ----
const cleanName = (s: string) => s.trim().replace(/\s+/g, ' ');
function explain(error: { code?: string; message: string }, name?: string): string {
  if (error.code === '23505') return `Your company already has a warehouse called "${name}". Pick another name.`;
  if (error.code === '42501' || /row-level security|permission denied/i.test(error.message)) return 'Only an active admin can add or change warehouses.';
  return error.message;
}

export interface WarehouseInput { name: string; address?: string; notes?: string }

export async function createWarehouse(companyId: string, userId: string | undefined, input: WarehouseInput): Promise<Warehouse> {
  const name = cleanName(input.name);
  if (!name) throw new Error('Give the warehouse a name, e.g. "North Shop".');
  const { data, error } = await supabase.from('warehouses')
    .insert({ company_id: companyId, name, address: input.address?.trim() || null, notes: input.notes?.trim() || null })
    .select('id, company_id, name, address, notes, is_active, created_at').maybeSingle();
  if (error) throw new Error(explain(error, name));
  if (!data) throw new Error('The warehouse was not saved. Only an active admin can add warehouses.');
  await supabase.from('activity_logs').insert({ company_id: companyId, user_id: userId, action: 'warehouse_added', details: { warehouse_id: data.id, warehouse_name: name } });
  return data as Warehouse;
}

export async function updateWarehouse(
  companyId: string, userId: string | undefined, before: Warehouse, changes: Partial<WarehouseInput> & { is_active?: boolean },
): Promise<Warehouse> {
  const values: Record<string, unknown> = {};
  if (changes.name !== undefined) {
    const name = cleanName(changes.name);
    if (!name) throw new Error('A warehouse needs a name.');
    if (name !== before.name) values.name = name;
  }
  if (changes.address !== undefined && (changes.address.trim() || null) !== before.address) values.address = changes.address.trim() || null;
  if (changes.notes !== undefined && (changes.notes.trim() || null) !== before.notes) values.notes = changes.notes.trim() || null;
  if (changes.is_active !== undefined && changes.is_active !== before.is_active) values.is_active = changes.is_active;
  if (!Object.keys(values).length) return before;
  const { data, error } = await supabase.from('warehouses').update(values)
    .eq('id', before.id).eq('company_id', companyId)
    .select('id, company_id, name, address, notes, is_active, created_at').maybeSingle();
  if (error) throw new Error(explain(error, values.name as string));
  if (!data) throw new Error('The change was not saved. Only an active admin can change warehouses.');
  const action = values.is_active === false ? 'warehouse_deactivated' : values.is_active === true ? 'warehouse_reactivated' : 'warehouse_updated';
  await supabase.from('activity_logs').insert({
    company_id: companyId, user_id: userId, action,
    details: { warehouse_id: before.id, warehouse_name: (data as Warehouse).name, ...(values.name ? { previous_name: before.name } : {}), changes: values },
  });
  return data as Warehouse;
}

/**
 * Empty a warehouse into another one (before deactivating it):
 * - tools physically in it move to `to` (each logged like any transfer);
 * - tools that belong to it (even out on vans) get `to` as their new home (one summary log).
 */
export async function moveWarehouseContents(
  companyId: string, userId: string | undefined, from: Warehouse, to: Warehouse,
): Promise<{ moved: number; rehomed: number }> {
  const { data: moved, error: moveError } = await supabase.from('inventory_items')
    .update({ current_warehouse_id: to.id, assigned_at: new Date().toISOString(), assigned_by: userId ?? null })
    .eq('company_id', companyId).eq('current_warehouse_id', from.id)
    .select('id, name, serial_number');
  if (moveError) throw new Error(moveError.message);
  const { data: rehomed, error: homeError } = await supabase.from('inventory_items')
    .update({ home_warehouse_id: to.id })
    .eq('company_id', companyId).eq('home_warehouse_id', from.id)
    .select('id');
  if (homeError) throw new Error(`${moved?.length ?? 0} tools were moved, but changing their home warehouse failed: ${homeError.message}`);

  const logs = (moved ?? []).map((t) => ({
    company_id: companyId, user_id: userId, action: 'transferred',
    details: {
      item_name: t.name, item_id: t.id, serial_number: t.serial_number, from: from.name, to: to.name,
      to_type: 'warehouse', to_warehouse_id: to.id, reason: 'warehouse_emptied',
    },
  }));
  for (let i = 0; i < logs.length; i += 100) await supabase.from('activity_logs').insert(logs.slice(i, i + 100));
  if (rehomed?.length) {
    await supabase.from('activity_logs').insert({
      company_id: companyId, user_id: userId, action: 'warehouse_tools_rehomed',
      details: { from_warehouse_id: from.id, from_warehouse: from.name, to_warehouse_id: to.id, to_warehouse: to.name, tool_count: rehomed.length },
    });
  }
  return { moved: moved?.length ?? 0, rehomed: rehomed?.length ?? 0 };
}

/** How many tools call this warehouse home / are in it now. */
export async function warehouseToolCounts(companyId: string, warehouseId: string): Promise<{ home: number; inside: number }> {
  const [home, inside] = await Promise.all([
    supabase.from('inventory_items').select('id', { count: 'exact', head: true }).eq('company_id', companyId).eq('home_warehouse_id', warehouseId),
    supabase.from('inventory_items').select('id', { count: 'exact', head: true }).eq('company_id', companyId).eq('current_warehouse_id', warehouseId),
  ]);
  if (home.error) throw new Error(home.error.message);
  if (inside.error) throw new Error(inside.error.message);
  return { home: home.count ?? 0, inside: inside.count ?? 0 };
}
