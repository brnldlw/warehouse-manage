// Instant, forgiving text search used by every SearchBox.
// Case-insensitive, matches part of a word, and when several words are typed each one must
// appear somewhere (in any field): "van 3 drill" finds a drill on Van 3.

export type SearchField = string | number | null | undefined;

export function searchWords(query: string): string[] {
  return query.toLowerCase().split(/\s+/).filter(Boolean);
}

export function matchesSearch(query: string, ...fields: SearchField[]): boolean {
  const words = searchWords(query);
  if (!words.length) return true;
  const haystack = fields.filter((f) => f !== null && f !== undefined && f !== '').join(' \u0000 ').toLowerCase();
  return words.every((w) => haystack.includes(w));
}
