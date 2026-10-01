// Move many tools at once (return to warehouse / move to another van), and undo it.
// Writes the same columns and the same 'transferred' activity_logs entry per tool as the
// single-tool transfer on Manage Parts, so history and the Tool Usage report stay correct.
// Each entry also carries a batch_id so a move can be undone exactly.

import { supabase } from '@/lib/supabase';

export type Destination =
  | { type: 'warehouse' }
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
}

export interface MoveFailure { id: string; name: string; reason: string }

export interface MoveResult {
  batchId: string;
  destination: Destination;
  moved: ToolSnapshot[];
  /** Already at the destination, so left alone. */
  skipped: ToolSnapshot[];
  failed: MoveFailure[];
  /** Set when the tools moved but writing their history entries failed. */
  historyWarning?: string;
}

const UPDATE_CHUNK = 50;
const READ_CHUNK = 100;
const where = (s: Pick<ToolSnapshot, 'location_type' | 'truck_name'>) =>
  (s.location_type === 'truck' ? s.truck_name || 'Unknown van' : 'Warehouse');
export const destinationLabel = (d: Destination) => (d.type === 'warehouse' ? 'the warehouse' : d.truckName);

async function readSnapshots(companyId: string, ids: string[]): Promise<ToolSnapshot[]> {
  const out: ToolSnapshot[] = [];
  for (let i = 0; i < ids.length; i += READ_CHUNK) {
    const { data, error } = await supabase
      .from('inventory_items')
      .select('id, name, serial_number, barcode, condition, location_type, assigned_truck_id, location, assigned_at, assigned_by, trucks:assigned_truck_id (name)')
      .eq('company_id', companyId)
      .in('id', ids.slice(i, i + READ_CHUNK));
    if (error) throw new Error(error.message);
    for (const r of data ?? []) {
      const truck = r.trucks as unknown as { name?: string } | null;
      out.push({
        id: r.id, name: r.name, serial_number: r.serial_number, barcode: r.barcode, condition: r.condition,
        location_type: r.location_type, assigned_truck_id: r.assigned_truck_id, location: r.location,
        assigned_at: r.assigned_at, assigned_by: r.assigned_by, truck_name: truck?.name ?? null,
      });
    }
  }
  return out;
}

function alreadyThere(s: ToolSnapshot, d: Destination) {
  return d.type === 'warehouse' ? s.location_type !== 'truck' : s.location_type === 'truck' && s.assigned_truck_id === d.truckId;
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
  const result: MoveResult = { batchId, destination, moved: [], skipped: [], failed: [] };

  const snapshots = await readSnapshots(companyId, toolIds);
  const byId = new Map(snapshots.map((s) => [s.id, s]));
  for (const id of toolIds) {
    if (!byId.has(id)) result.failed.push({ id, name: 'Unknown tool', reason: 'Not found (it may have been deleted, or belongs to another company).' });
  }
  const toMove: ToolSnapshot[] = [];
  for (const s of snapshots) (alreadyThere(s, destination) ? result.skipped : toMove).push(s);

  const values: Record<string, unknown> = {
    location_type: destination.type,
    assigned_truck_id: destination.type === 'truck' ? destination.truckId : null,
    assigned_at: new Date().toISOString(),
    assigned_by: userId ?? null,
    location: destination.type === 'warehouse' ? 'Warehouse' : null,
  };
  if (options.condition && options.condition !== 'keep') values.condition = options.condition;

  let done = 0;
  onProgress?.(0, toMove.length);
  for (let i = 0; i < toMove.length; i += UPDATE_CHUNK) {
    const chunk = toMove.slice(i, i + UPDATE_CHUNK);
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

  // One history entry per tool, the same shape as the single-tool transfer.
  const to = destination.type === 'warehouse' ? 'Warehouse' : destination.truckName;
  const logs = result.moved.map((s) => ({
    company_id: companyId,
    user_id: userId,
    action: 'transferred',
    details: {
      item_name: s.name, item_id: s.id, serial_number: s.serial_number, from: where(s), to,
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
    const values = {
      location_type: s.location_type, assigned_truck_id: s.assigned_truck_id, location: s.location,
      assigned_at: s.assigned_at, assigned_by: s.assigned_by, condition: s.condition,
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
  const from = move.destination.type === 'warehouse' ? 'Warehouse' : move.destination.truckName;
  const logs = restored.map((s) => ({
    company_id: companyId, user_id: userId, action: 'transferred',
    details: { item_name: s.name, item_id: s.id, serial_number: s.serial_number, from, to: where(s), undo: true, undo_of_batch: move.batchId },
  }));
  for (let i = 0; i < logs.length; i += READ_CHUNK) await supabase.from('activity_logs').insert(logs.slice(i, i + READ_CHUNK));
  return out;
}

/** "12 tools returned to the warehouse" / "1 tool moved to Van 3" */
export function describeMove(move: MoveResult): string {
  const n = move.moved.length;
  const what = `${n} tool${n === 1 ? '' : 's'}`;
  return move.destination.type === 'warehouse' ? `${what} returned to the warehouse` : `${what} moved to ${move.destination.truckName}`;
}
