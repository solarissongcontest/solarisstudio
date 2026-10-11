/** Edition numbers are display metadata; canonical UUIDs are identity. */
export function confirmationEditionsById<T extends { id: string }>(editions: readonly T[]) {
  const result = new Map<string, T>();
  for (const edition of editions) {
    if (!edition.id || result.has(edition.id)) {
      throw new Error("Confirmation editions require unique canonical IDs. Refresh or repair the legacy linkage.");
    }
    result.set(edition.id, edition);
  }
  return result;
}
