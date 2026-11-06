/** Only navigate to published Wiki section anchors. Malformed URL hashes must not crash article hydration. */
export function resolveWikiArticleAnchor(rawHash: string, sectionIds: readonly string[]): string | null {
  if (!rawHash.startsWith("#") || rawHash.length < 2) return null;
  try {
    const id = decodeURIComponent(rawHash.slice(1));
    return sectionIds.includes(id) ? id : null;
  } catch {
    return null;
  }
}
