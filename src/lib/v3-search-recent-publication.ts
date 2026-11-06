type RecentPath = { path: string };

export type RecentPublicationSlugs = {
  editionSlugs: string[];
  storySlugs: string[];
};

const MAX_STORED_RECENTS = 8;

function singleSegment(path: string, kind: "editions" | "stories"): string | null {
  const match = new RegExp(`^/${kind}/([^/?#]+)/?$`, "i").exec(path);
  if (!match) return null;
  try {
    const slug = decodeURIComponent(match[1]);
    // Reject encoded separators, dot-segment traversal and control bytes
    // before a stored shared-device URL can trigger any publication request.
    if (
      !slug ||
      slug.length > 160 ||
      slug === "." ||
      slug === ".." ||
      ["/", "\\", "?", "#"].some((separator) => slug.includes(separator)) ||
      [...slug].some((character) => {
        const code = character.charCodeAt(0);
        return code <= 0x1f || code === 0x7f;
      })
    ) return null;
    return slug;
  } catch {
    return null;
  }
}

/**
 * At most eight shared-device recent paths can trigger publication checks.
 * Do not query whole archives merely to display a persisted Search shortcut.
 */
export function recentPublicationSlugs(recents: readonly RecentPath[]): RecentPublicationSlugs {
  const editions = new Set<string>();
  const stories = new Set<string>();
  for (const recent of recents.slice(0, MAX_STORED_RECENTS)) {
    const edition = singleSegment(recent.path, "editions");
    if (edition) editions.add(edition);
    const story = singleSegment(recent.path, "stories");
    if (story) stories.add(story);
  }
  return { editionSlugs: [...editions], storySlugs: [...stories] };
}

/**
 * Unpublished or unverified labels must never be replayed from localStorage.
 * Public Show recents are separately checked with canonical Show publication.
 * Other existing public destination categories remain owned by their
 * respective discovery policies.
 */
export function visiblePublicationVerifiedRecents<T extends RecentPath>(
  recents: readonly T[],
  grants: {
    publishedEditionSlugs: ReadonlySet<string>;
    publishedStorySlugs: ReadonlySet<string>;
  },
): T[] {
  return recents.filter((recent) => {
    if (/^\/editions\//i.test(recent.path)) {
      const slug = singleSegment(recent.path, "editions");
      return slug != null && grants.publishedEditionSlugs.has(slug);
    }
    if (/^\/stories\//i.test(recent.path)) {
      const slug = singleSegment(recent.path, "stories");
      return slug != null && grants.publishedStorySlugs.has(slug);
    }
    return true;
  });
}
