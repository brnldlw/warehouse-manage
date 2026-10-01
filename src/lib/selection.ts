export type Tri = boolean | 'indeterminate';

/** All / some / none of these ids selected (for a checkbox: ticked / half-ticked / empty). */
export const triState = (ids: string[], selected: Set<string>): Tri => {
  const n = ids.filter((id) => selected.has(id)).length;
  return n === 0 ? false : n === ids.length ? true : 'indeterminate';
};
