import type { PostgrestError } from '@supabase/supabase-js';

/** Supabase (PostgREST) returns at most this many rows per request. */
export const PAGE_SIZE = 1000;

/** Any Supabase select query that can be paged with .range(). */
export interface RangeableQuery<T> {
  range(from: number, to: number): PromiseLike<{ data: T[] | null; error: PostgrestError | null }>;
}

/**
 * Load every row of a query, not just the first 1000, by paging with .range().
 *
 * Pass a function that builds a fresh query each time — including its filters and an
 * .order() that is unique per row (end with .order('id')), otherwise rows can be
 * skipped or repeated between pages:
 *
 *   const trucks = await fetchAll(() =>
 *     supabase.from('trucks').select('id, name').eq('company_id', companyId).order('name').order('id'));
 *
 * Throws the Supabase error if any page fails, so callers never get a partial list.
 */
export async function fetchAll<T>(buildQuery: () => RangeableQuery<T>, pageSize = PAGE_SIZE): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await buildQuery().range(from, from + pageSize - 1);
    if (error) throw error;
    const page = data ?? [];
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}
