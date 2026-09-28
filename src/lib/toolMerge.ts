// "Merge duplicates" on Manage Parts: make tools that are really the same thing group together.
// A merge only relabels tools (group_id, name, category, photo). It never deletes a tool, and
// each tool keeps its own serial, barcode, location, condition, price and history.
// Every merge is logged in activity_logs with each tool's previous values, so it can be undone.

import { supabase } from '@/lib/supabase';

/** The fields merging needs from an inventory item. */
export interface MergeableTool {
  id: string;
  name: string;
  categoryId: string | null;
  groupId?: string | null;
  image_url?: string | null;
  locationType?: string;
  assignedTruckName?: string;
}

export interface ToolGroup {
  groupId: string;
  name: string;
  categoryId: string | null;
  imageUrl: string | null;
  tools: MergeableTool[];
}

export const normalizeName = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();

function mostCommon<T>(values: T[]): T {
  const counts = new Map<T, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1])[0][0];
}

/** One entry per group_id (wherever its tools are). Tools without a group_id are their own group. */
export function buildToolGroups(tools: MergeableTool[]): ToolGroup[] {
  const byGroup = new Map<string, MergeableTool[]>();
  for (const t of tools) {
    const key = t.groupId || t.id;
    const list = byGroup.get(key);
    if (list) list.push(t); else byGroup.set(key, [t]);
  }
  return [...byGroup].map(([groupId, list]) => ({
    groupId,
    name: mostCommon(list.map((t) => t.name.trim())),
    categoryId: mostCommon(list.map((t) => t.categoryId ?? null)),
    imageUrl: list.find((t) => t.image_url)?.image_url ?? null,
    tools: list,
  }));
}

/**
 * Groups that look like the same tool: same name (ignoring capitals and extra spaces) and
 * same category. Largest sets first.
 */
export function suggestDuplicates(groups: ToolGroup[]): ToolGroup[][] {
  const byKey = new Map<string, ToolGroup[]>();
  for (const g of groups) {
    const key = `${normalizeName(g.name)}|${g.categoryId ?? ''}`;
    const list = byKey.get(key);
    if (list) list.push(g); else byKey.set(key, [g]);
  }
  return [...byKey.values()]
    .filter((list) => list.length > 1)
    .map((list) => [...list].sort((a, b) => b.tools.length - a.tools.length))
    .sort((a, b) => b.reduce((n, g) => n + g.tools.length, 0) - a.reduce((n, g) => n + g.tools.length, 0));
}

export interface MergeChoice {
  name: string;
  categoryId: string | null;
  imageUrl: string | null;
}

export interface MergePlan extends MergeChoice {
  /** The group everything joins: the one with the most tools already. */
  targetGroupId: string;
  tools: MergeableTool[];
}

export function planMerge(selected: ToolGroup[], choice: MergeChoice): MergePlan {
  if (selected.length < 2) throw new Error('Pick at least two groups to merge.');
  const target = [...selected].sort((a, b) => b.tools.length - a.tools.length)[0];
  return { ...choice, name: choice.name.trim().replace(/\s+/g, ' '), targetGroupId: target.groupId, tools: selected.flatMap((g) => g.tools) };
}

interface PreviousValues {
  id: string;
  group_id: string | null;
  name: string;
  category_id: string | null;
  image_url: string | null;
}

const CHUNK = 150;

/** Update the given tools in batches; returns how many rows the database actually changed. */
async function updateTools(companyId: string, ids: string[], values: Record<string, unknown>): Promise<number> {
  let changed = 0;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const { data, error } = await supabase
      .from('inventory_items').update(values).eq('company_id', companyId).in('id', ids.slice(i, i + CHUNK)).select('id');
    if (error) throw error;
    changed += data?.length ?? 0;
  }
  return changed;
}

export interface MergeResult {
  mergeId: string;
  changed: number;
  expected: number;
}

export async function applyMerge(companyId: string, userId: string | undefined, plan: MergePlan): Promise<MergeResult> {
  const mergeId = crypto.randomUUID();
  const previous: PreviousValues[] = plan.tools.map((t) => ({
    id: t.id, group_id: t.groupId ?? null, name: t.name, category_id: t.categoryId ?? null, image_url: t.image_url ?? null,
  }));

  // Log first, so the merge can always be undone even if it stops halfway.
  const { error: logError } = await supabase.from('activity_logs').insert({
    company_id: companyId, user_id: userId, action: 'tools_merged',
    details: {
      merge_id: mergeId, item_name: plan.name, target_group_id: plan.targetGroupId, category_id: plan.categoryId,
      image_url: plan.imageUrl, tool_count: plan.tools.length,
      group_count: new Set(previous.map((p) => p.group_id ?? p.id)).size, previous,
    },
  });
  if (logError) throw new Error(`Couldn't record the merge, so nothing was changed: ${logError.message}`);

  const changed = await updateTools(companyId, plan.tools.map((t) => t.id), {
    group_id: plan.targetGroupId, name: plan.name, category_id: plan.categoryId, image_url: plan.imageUrl,
  });
  return { mergeId, changed, expected: plan.tools.length };
}

export interface LastMerge {
  mergeId: string;
  name: string;
  toolCount: number;
  groupCount: number;
  at: string;
  previous: PreviousValues[];
}

/** The most recent merge for this company, if it hasn't been undone. */
export async function findUndoableMerge(companyId: string): Promise<LastMerge | null> {
  const { data, error } = await supabase
    .from('activity_logs').select('details, timestamp')
    .eq('company_id', companyId).eq('action', 'tools_merged')
    .order('timestamp', { ascending: false }).limit(1);
  if (error) throw error;
  const last = data?.[0];
  if (!last?.details?.merge_id) return null;
  const { data: undone, error: undoneError } = await supabase
    .from('activity_logs').select('id')
    .eq('company_id', companyId).eq('action', 'tools_merge_undone').eq('details->>merge_id', last.details.merge_id).limit(1);
  if (undoneError) throw undoneError;
  if (undone?.length) return null;
  const d = last.details;
  return {
    mergeId: d.merge_id, name: d.item_name, toolCount: d.tool_count, groupCount: d.group_count,
    at: last.timestamp, previous: d.previous ?? [],
  };
}

/** Put every tool back to the group, name, category and photo it had before the merge. */
export async function undoMerge(companyId: string, userId: string | undefined, merge: LastMerge): Promise<number> {
  const batches = new Map<string, { values: Omit<PreviousValues, 'id'>; ids: string[] }>();
  for (const p of merge.previous) {
    const values = { group_id: p.group_id, name: p.name, category_id: p.category_id, image_url: p.image_url };
    const key = JSON.stringify(values);
    const batch = batches.get(key);
    if (batch) batch.ids.push(p.id); else batches.set(key, { values, ids: [p.id] });
  }
  let restored = 0;
  for (const { values, ids } of batches.values()) restored += await updateTools(companyId, ids, values);
  await supabase.from('activity_logs').insert({
    company_id: companyId, user_id: userId, action: 'tools_merge_undone',
    details: { merge_id: merge.mergeId, item_name: merge.name, tool_count: restored },
  });
  return restored;
}
