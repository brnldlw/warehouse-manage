// Move many tools at once (return to warehouse / move to another van / between warehouses),
// and undo it. Writes the same columns and the same 'transferred' activity_logs entry per tool as
// the single-tool transfer on Manage Parts, so history and the Tool Usage report stay correct.
// Each entry also carries a batch_id so a move can be undone exactly.
//
// With several warehouses (migration 006): "return to warehouse" sends each tool to ITS OWN home
// warehouse unless a specific warehouse is chosen, and tools can move between warehouses.
// History entries going to a warehouse are marked to_type: 'warehouse'.

import { supabase } from '@/lib/supabase';
import { loadWarehouses, warehousesAvailable } from '@/lib/warehouses';

export type Destination =
  /** No warehouseId = each tool goes back to its own home warehouse. */
  | { type: 'warehouse'; warehouseId?: string; warehouseName?: string }
  | { type: 'truck'; truckId: string; truckName: string };

/** 'keep' = leave each tool's condition as it is. 'damaged' is shown as "Needs repair". */
export type ConditionChange = 'keep' | 'good' | 'damaged';

export interface MoveOptions {
  condition?: ConditionChange;
  note?: string;
  /** Extra details for the history entries, e.g. { reason: 'tech_deactivated' }. */
  extraDetails?: Record<string, unknown>;
}

/** A tool's location and condition just before it was moved (also what Undo restores). */
export interface ToolSnapshot {
  id: string;
  name: string;
  serial_number: string | null;
  barcode: string | null;
  condition: string | null;
  location_type: string | null;
  assigned_truck_id: string | null;
  location: string | null;
  assigned_at: string | null;
  assigned_by: string | null;
  truck_name: string | null;
  home_warehouse_id: string | null;
  home_name: string | null;
  current_warehouse_id: string | null;
  current_name: string | null;
}

export interface MoveFailure { id: string; name: string; reason: string }

export interface MoveResult {
  batchId: string;
  destination: Destination;
  /** Whether the database has several warehouses (migration 006). */
  warehouses: boolean;
  moved: ToolSnapshot[];
  /** Already at the destination, so left alone. */
  skipped: ToolSnapshot[];
  failed: MoveFailure[];
  /** Set when the tools moved but writing their history entries failed. */
  historyWarning?: string;
}

const UPDATE_CHUNK = 50;
const READ_CHUNK = 100;
const where = (s: ToolSnapshot) =>
  (s.location_type === 'truck' ? s.truck_name || 'Unknown van' : s.current_name || s.home_name || 'Warehouse');
export const destinationLabel = (d: Destination) =>
  (d.type === 'warehouse' ? d.warehouseName ?? 'the warehouse' : d.truckName);

/** The warehouse a tool will end up in for this destination (null = the one unnamed warehouse). */
const targetWarehouse = (s: ToolSnapshot, d: Destination) =>
  (d.type === 'warehouse' ? d.warehouseId ?? s.home_warehouse_id ?? s.current_warehouse_id : null);

async function readSnapshots(companyId: string, ids: string[], wh: boolean): Promise<ToolSnapshot[]> {
  const cols = 'id, name, serial_number, barcode, condition, location_type, assigned_truck_id, location, assigned_at, assigned_by, trucks:assigned_truck_id (name)'
    + (wh ? ', home_warehouse_id, current_warehouse_id, home_wh:home_warehouse_id (name), cur_wh:current_warehouse_id (name)' : '');
  const out: ToolSnapshot[] = [];
  for (let i = 0; i < ids.length; i += READ_CHUNK) {
    const { data, error } = await supabase
      .from('inventory_items').select(cols)
      .eq('company_id', companyId)
      .in('id', ids.slice(i, i + READ_CHUNK))
      .returns<Record<string, unknown>[]>();
    if (error) throw new Error(error.message);
    for (const r of data ?? []) {
      const name = (rel: unknown) => (rel as { name?: string } | null)?.name ?? null;
      out.push({
        id: r.id as string, name: r.name as string, serial_number: r.serial_number as string | null, barcode: r.barcode as string | null,
        condition: r.condition as string | null, location_type: r.location_type as string | null,
        assigned_truck_id: r.assigned_truck_id as string | null, location: r.location as string | null,
        assigned_at: r.assigned_at as string | null, assigned_by: r.assigned_by as string | null, truck_name: name(r.trucks),
        home_warehouse_id: (r.home_warehouse_id as string | null) ?? null, home_name: name(r.home_wh),
        current_warehouse_id: (r.current_warehouse_id as string | null) ?? null, current_name: name(r.cur_wh),
      });
    }
  }
  return out;
}

function alreadyThere(s: ToolSnapshot, d: Destination, wh: boolean) {
  if (d.type === 'truck') return s.location_type === 'truck' && s.assigned_truck_id === d.truckId;
  if (s.location_type === 'truck') return false;
  return !wh || targetWarehouse(s, d) === s.current_warehouse_id;
}

/**
 * Move the given tools in batches. Never silently half-done: every tool ends up in `moved`,
 * `skipped` or `failed` (with the reason), and the caller shows all three.
 */
export async function moveTools(
  companyId: string, userId: string | undefined, toolIds: string[], destination: Destination,
  options: MoveOptions = {}, onProgress?: (done: number, total: number) => void,
): Promise<MoveResult> {
  // randomUUID only exists on https/localhost; fall back for e.g. a phone testing over the LAN.
  const batchId = crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  // Warehouse logic only when the database has warehouses AND this company has at least one.
  const wh = (await warehousesAvailable()) && (await loadWarehouses(companyId).catch(() => [])).length > 0;
  const result: MoveResult = { batchId, destination, warehouses: wh, moved: [], skipped: [], failed: [] };

  const snapshots = await readSnapshots(companyId, toolIds, wh);
  const byId = new Map(snapshots.map((s) => [s.id, s]));
  for (const id of toolIds) {
    if (!byId.has(id)) result.failed.push({ id, name: 'Unknown tool', reason: 'Not found (it may have been deleted, or belongs to another company).' });
  }
  const toMove: ToolSnapshot[] = [];
  for (const s of snapshots) (alreadyThere(s, destination, wh) ? result.skipped : toMove).push(s);

  const base: Record<string, unknown> = {
    location_type: destination.type,
    assigned_truck_id: destination.type === 'truck' ? destination.truckId : null,
    assigned_at: new Date().toISOString(),
    assigned_by: userId ?? null,
    location: destination.type === 'warehouse' ? 'Warehouse' : null,
  };
  if (options.condition && options.condition !== 'keep') base.condition = options.condition;

  // One batch of updates per target warehouse (each tool may be going to its own home).
  const groups = new Map<string, ToolSnapshot[]>();
  for (const s of toMove) {
    const key = wh ? targetWarehouse(s, destination) ?? '' : '';
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(s);
  }

  let done = 0;
  onProgress?.(0, toMove.length);
  for (const [target, list] of groups) {
    const values = wh ? { ...base, current_warehouse_id: destination.type === 'warehouse' ? target || null : null } : base;
    for (let i = 0; i < list.length; i += UPDATE_CHUNK) {
      const chunk = list.slice(i, i + UPDATE_CHUNK);
      const { data, error } = await supabase
        .from('inventory_items').update(values).eq('company_id', companyId).in('id', chunk.map((s) => s.id)).select('id');
      if (error) {
        chunk.forEach((s) => result.failed.push({ id: s.id, name: s.name, reason: error.message }));
      } else {
        const ok = new Set((data ?? []).map((r) => r.id as string));
        for (const s of chunk) {
          if (ok.has(s.id)) result.moved.push(s);
          else result.failed.push({ id: s.id, name: s.name, reason: "The database didn't change it (you may not have permission for this tool)." });
        }
      }
      done += chunk.length;
      onProgress?.(done, toMove.length);
    }
  }

  // One history entry per tool, the same shape as the single-tool transfer.
  const toName = (s: ToolSnapshot) => {
    if (destination.type === 'truck') return destination.truckName;
    if (!wh) return 'Warehouse';
    return destination.warehouseName ?? (destination.warehouseId ? null : s.home_name) ?? 'Warehouse';
  };
  const logs = result.moved.map((s) => ({
    company_id: companyId,
    user_id: userId,
    action: 'transferred',
    details: {
      item_name: s.name, item_id: s.id, serial_number: s.serial_number, from: where(s), to: toName(s),
      to_type: destination.type === 'truck' ? 'van' : 'warehouse',
      ...(wh && destination.type === 'warehouse' ? { to_warehouse_id: targetWarehouse(s, destination), home_warehouse_id: s.home_warehouse_id } : {}),
      batch_id: batchId, bulk: true,
      ...(options.condition && options.condition !== 'keep' ? { condition_from: s.condition, condition_to: options.condition } : {}),
      ...(options.note?.trim() ? { note: options.note.trim() } : {}),
      ...(options.extraDetails ?? {}),
    },
  }));
  for (let i = 0; i < logs.length; i += READ_CHUNK) {
    const { error } = await supabase.from('activity_logs').insert(logs.slice(i, i + READ_CHUNK));
    if (error) result.historyWarning = `The tools moved, but their history entries couldn't all be saved: ${error.message}`;
  }
  return result;
}

export interface UndoResult { restored: number; failed: MoveFailure[] }

/** Put exactly the moved tools back where (and in the condition) they were before. */
export async function undoMove(companyId: string, userId: string | undefined, move: MoveResult): Promise<UndoResult> {
  const out: UndoResult = { restored: 0, failed: [] };
  const groups = new Map<string, { values: Record<string, unknown>; tools: ToolSnapshot[] }>();
  for (const s of move.moved) {
    const values: Record<string, unknown> = {
      location_type: s.location_type, assigned_truck_id: s.assigned_truck_id, location: s.location,
      assigned_at: s.assigned_at, assigned_by: s.assigned_by, condition: s.condition,
      ...(move.warehouses ? { current_warehouse_id: s.current_warehouse_id } : {}),
    };
    const key = JSON.stringify(values);
    const g = groups.get(key);
    if (g) g.tools.push(s); else groups.set(key, { values, tools: [s] });
  }
  const restored: ToolSnapshot[] = [];
  for (const { values, tools } of groups.values()) {
    for (let i = 0; i < tools.length; i += UPDATE_CHUNK) {
      const chunk = tools.slice(i, i + UPDATE_CHUNK);
      const { data, error } = await supabase
        .from('inventory_items').update(values).eq('company_id', companyId).in('id', chunk.map((s) => s.id)).select('id');
      if (error) { chunk.forEach((s) => out.failed.push({ id: s.id, name: s.name, reason: error.message })); continue; }
      const ok = new Set((data ?? []).map((r) => r.id as string));
      for (const s of chunk) {
        if (ok.has(s.id)) restored.push(s);
        else out.failed.push({ id: s.id, name: s.name, reason: "The database didn't change it." });
      }
    }
  }
  out.restored = restored.length;
  const fromName = (s: ToolSnapshot) => (move.destination.type === 'truck' ? move.destination.truckName
    : move.destination.warehouseName ?? (move.warehouses ? s.home_name : null) ?? 'Warehouse');
  const logs = restored.map((s) => ({
    company_id: companyId, user_id: userId, action: 'transferred',
    details: {
      item_name: s.name, item_id: s.id, serial_number: s.serial_number, from: fromName(s), to: where(s),
      to_type: s.location_type === 'truck' ? 'van' : 'warehouse', undo: true, undo_of_batch: move.batchId,
    },
  }));
  for (let i = 0; i < logs.length; i += READ_CHUNK) await supabase.from('activity_logs').insert(logs.slice(i, i + READ_CHUNK));
  return out;
}

/** "12 tools returned to the warehouse" / "… to their home warehouses" / "1 tool moved to Van 3" */
export function describeMove(move: MoveResult): string {
  const n = move.moved.length;
  const what = `${n} tool${n === 1 ? '' : 's'}`;
  const d = move.destination;
  if (d.type === 'truck') return `${what} moved to ${d.truckName}`;
  if (d.warehouseName) return `${what} moved to ${d.warehouseName}`;
  if (!move.warehouses) return `${what} returned to the warehouse`;
  const homes = [...new Set(move.moved.map((s) => s.home_name).filter(Boolean))];
  return homes.length === 1 ? `${what} returned to ${homes[0]}` : `${what} returned to their home warehouses`;
}
