/**
 * A client-side discovery matcher for already-public directory rows.
 * Search changes presentation only: it never determines publication, identity,
 * participation or the visibility of protected records.
 */
export function normalizePublicDirectorySearch(value: string): string {
  return value
    .toLocaleLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/ø/g, "o")
    .replace(/æ/g, "ae")
    .replace(/œ/g, "oe")
    .replace(/ł/g, "l")
    .replace(/ß/g, "ss");
}

/** All words must occur somewhere in the published subject's searchable fields. */
export function matchesPublicDirectorySearch(
  query: string,
  fields: readonly (string | number | null | undefined)[],
): boolean {
  const terms = normalizePublicDirectorySearch(query.trim()).split(/\s+/).filter(Boolean);
  if (!terms.length) return true;
  const haystack = normalizePublicDirectorySearch(
    fields.filter((value) => value !== null && value !== undefined).join(" "),
  );
  return terms.every((term) => haystack.includes(term));
}

/** A former region/facet must not leave a browse page stuck on an invisible option. */
export function resolvePublicDirectoryFacet(
  requested: string,
  available: readonly string[],
): string {
  if (requested === "all") return "all";
  return available.includes(requested) ? requested : "all";
}
