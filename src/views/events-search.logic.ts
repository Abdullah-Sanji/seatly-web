import type { LocationQueryRaw } from "vue-router";

export const SEARCH_DEBOUNCE_MS = 300;

/** Reads the `q` route query value (which may be an array or absent) as a plain string. */
export function termFromQuery(value: unknown): string {
  const first = Array.isArray(value) ? value[0] : value;
  return typeof first === "string" ? first : "";
}

/** Returns the route query with `q` set, or removed when the term is empty. */
export function withSearchTerm(
  query: LocationQueryRaw,
  term: string,
): LocationQueryRaw {
  const { q: _omit, ...rest } = query;
  return term ? { ...rest, q: term } : rest;
}
