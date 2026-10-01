// Tool Usage report: how often each tool is sent out to vans, built from activity_logs.
//
// Transfers are logged twice today:
//   - 'tool_transfer' by the database trigger: one row per tool, with the van id (truck_id);
//     tools moved together get the exact same timestamp.
//   - 'transferred' by the app: one row per move (a group move has a quantity), van by name.
// The trigger rows are used as the source. An app row counts only when no trigger row matches
// it (same tool, same van, within 2 minutes), e.g. moves made before the trigger existed.

import { supabase } from '@/lib/supabase';
import { fetchAll } from '@/lib/fetchAll';
import { ReportItem, TruckInfo, truckLabel } from '@/lib/inventoryReport';
import { normalizeName } from '@/lib/toolMerge';

export interface TransferLog {
  id: string;
  action: string;
  timestamp: string;
  truck_id: string | null;
  item_id: string | null;
  details: Record<string, unknown> | null;
}

/** One trip out to a van: one or more units of the same tool moved at once. */
interface OutEvent {
  toolKey: string;
  toolName: string;
  itemIds: string[];
  vanKey: string;
  vanLabel: string;
  at: number;
  units: number;
}

export interface VanUsage {
  vanKey: string;
  vanLabel: string;
  techs: string[];
  trips: number;
  units: number;
  lastOut: string;
}

export interface ToolUsage {
  toolKey: string;
  toolName: string;
  category: string;
  trips: number;
  units: number;
  vanCount: number;
  techCount: number;
  lastOut: string;
  byVan: VanUsage[];
}

export interface BuyOneFlag {
  toolName: string;
  category: string;
  vanLabel: string;
  techs: string[];
  trips: number;
}

const MATCH_WINDOW_MS = 2 * 60 * 1000;
const str = (v: unknown) => (typeof v === 'string' ? v : '');

export async function loadTransferLogs(companyId: string, from: Date, to: Date): Promise<TransferLog[]> {
  return fetchAll<TransferLog>(() => supabase
    .from('activity_logs')
    .select('id, action, timestamp, truck_id, item_id, details')
    .eq('company_id', companyId)
    .in('action', ['tool_transfer', 'transferred'])
    .gte('timestamp', from.toISOString())
    .lte('timestamp', to.toISOString())
    .order('timestamp')
    .order('id'));
}

/** Turn raw logs into "sent out to a van" trips, each transfer counted once. */
export function toOutEvents(logs: TransferLog[], trucks: TruckInfo[]): OutEvent[] {
  const truckById = new Map(trucks.map((t) => [t.id, t]));
  const truckByName = new Map(trucks.map((t) => [normalizeName(t.name), t]));
  const vanOf = (id: string | null, name: string) => {
    const t = (id && truckById.get(id)) || truckByName.get(normalizeName(name));
    return t ? { vanKey: t.id, vanLabel: truckLabel(t) } : { vanKey: `name:${normalizeName(name)}`, vanLabel: name || 'Unknown van' };
  };

  // 0. Mistakes that were undone don't count: the undo itself, and moves from a batch that
  //    was later undone. Their database-trigger rows are found by tool id + time.
  const undoneBatches = new Set(logs
    .filter((l) => l.action === 'transferred' && l.details?.undo && l.details?.undo_of_batch)
    .map((l) => str(l.details!.undo_of_batch)));
  const isIgnoredApp = (l: TransferLog) => l.action === 'transferred'
    && (!!l.details?.undo || (!!l.details?.batch_id && undoneBatches.has(str(l.details.batch_id))));
  const ignoredTimes = new Map<string, number[]>(); // item id -> times of ignored moves
  for (const l of logs) {
    if (!isIgnoredApp(l) || !str(l.details?.item_id)) continue;
    const id = str(l.details!.item_id);
    (ignoredTimes.get(id) ?? ignoredTimes.set(id, []).get(id)!).push(Date.parse(l.timestamp));
  }
  const ignoredTrigger = (l: TransferLog) => !!l.item_id
    && (ignoredTimes.get(l.item_id) ?? []).some((t) => Math.abs(t - Date.parse(l.timestamp)) <= MATCH_WINDOW_MS);

  // 1. Trigger rows, grouped into trips (same moment, same van, same tool).
  const trips = new Map<string, OutEvent>();
  for (const log of logs) {
    if (log.action !== 'tool_transfer' || ignoredTrigger(log)) continue;
    const d = log.details ?? {};
    const truckId = log.truck_id ?? (str(d.new_truck_id) || null);
    if (!truckId) continue; // went back to the warehouse
    const toolName = str(d.tool_name).trim() || 'Unnamed tool';
    const van = vanOf(truckId, str(d.to_location));
    const at = Date.parse(log.timestamp);
    const key = `${at}|${van.vanKey}|${normalizeName(toolName)}`;
    const trip = trips.get(key);
    if (trip) { trip.units += 1; if (log.item_id) trip.itemIds.push(log.item_id); }
    else trips.set(key, { toolKey: normalizeName(toolName), toolName, itemIds: log.item_id ? [log.item_id] : [], ...van, at, units: 1 });
  }
  const events = [...trips.values()];
  const triggerTimes = new Map<string, number[]>(); // "tool|van" -> times
  for (const e of events) {
    const k = `${e.toolKey}|${e.vanKey}`;
    (triggerTimes.get(k) ?? triggerTimes.set(k, []).get(k)!).push(e.at);
  }

  // 2. App rows, only when the trigger didn't record the same move.
  for (const log of logs) {
    if (log.action !== 'transferred' || isIgnoredApp(log)) continue;
    const d = log.details ?? {};
    const toName = str(d.to);
    if (!toName || normalizeName(toName) === 'warehouse') continue;
    const toolName = str(d.item_name).trim() || 'Unnamed tool';
    const van = vanOf(null, toName);
    const at = Date.parse(log.timestamp);
    const duplicate = (triggerTimes.get(`${normalizeName(toolName)}|${van.vanKey}`) ?? []).some((t) => Math.abs(t - at) <= MATCH_WINDOW_MS);
    if (duplicate) continue;
    const units = Math.max(1, Number(d.quantity) || 1);
    events.push({ toolKey: normalizeName(toolName), toolName, itemIds: str(d.item_id) ? [str(d.item_id)] : [], ...van, at, units });
  }
  return events;
}

/** Per-tool usage and the "Buy one?" list. */
export function buildUsage(
  events: OutEvent[], inventory: ReportItem[], truckTechs: Record<string, string[]>, buyThreshold: number,
): { tools: ToolUsage[]; buyOne: BuyOneFlag[] } {
  const categoryByItem = new Map(inventory.map((i) => [i.id, i.categoryName]));
  const categoryByName = new Map<string, string>();
  for (const i of inventory) if (!categoryByName.has(normalizeName(i.name))) categoryByName.set(normalizeName(i.name), i.categoryName);
  const techsOf = (vanKey: string) => truckTechs[vanKey] ?? [];

  const byTool = new Map<string, OutEvent[]>();
  for (const e of events) {
    const list = byTool.get(e.toolKey);
    if (list) list.push(e); else byTool.set(e.toolKey, [e]);
  }

  const tools: ToolUsage[] = [...byTool].map(([toolKey, list]) => {
    const nameCounts = new Map<string, number>();
    list.forEach((e) => nameCounts.set(e.toolName, (nameCounts.get(e.toolName) ?? 0) + 1));
    const toolName = [...nameCounts].sort((a, b) => b[1] - a[1])[0][0];
    const itemCategory = list.flatMap((e) => e.itemIds).map((id) => categoryByItem.get(id)).find(Boolean);
    const category = itemCategory ?? categoryByName.get(toolKey) ?? 'Not in inventory now';

    const vans = new Map<string, VanUsage>();
    for (const e of list) {
      const v = vans.get(e.vanKey) ?? { vanKey: e.vanKey, vanLabel: e.vanLabel, techs: techsOf(e.vanKey), trips: 0, units: 0, lastOut: '' };
      v.trips += 1;
      v.units += e.units;
      const iso = new Date(e.at).toISOString();
      if (iso > v.lastOut) v.lastOut = iso;
      vans.set(e.vanKey, v);
    }
    const byVan = [...vans.values()].sort((a, b) => b.trips - a.trips || a.vanLabel.localeCompare(b.vanLabel));
    return {
      toolKey, toolName, category,
      trips: list.length,
      units: list.reduce((n, e) => n + e.units, 0),
      vanCount: byVan.length,
      techCount: new Set(byVan.flatMap((v) => v.techs)).size,
      lastOut: new Date(Math.max(...list.map((e) => e.at))).toISOString(),
      byVan,
    };
  }).sort((a, b) => b.trips - a.trips || a.toolName.localeCompare(b.toolName));

  const buyOne: BuyOneFlag[] = tools
    .flatMap((t) => t.byVan.filter((v) => v.trips >= buyThreshold)
      .map((v) => ({ toolName: t.toolName, category: t.category, vanLabel: v.vanLabel, techs: v.techs, trips: v.trips })))
    .sort((a, b) => b.trips - a.trips || a.vanLabel.localeCompare(b.vanLabel));

  return { tools, buyOne };
}

export const techText = (techs: string[]) => (techs.length ? techs.join(', ') : 'no tech assigned now');
