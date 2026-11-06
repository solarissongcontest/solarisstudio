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
export function visiblePublicationVerifiedRecents<T extends RecentPath & { label: string }>(
  recents: readonly T[],
  grants: {
    publishedEditionLabels: ReadonlyMap<string, string>;
    publishedStoryLabels: ReadonlyMap<string, string>;
  },
): T[] {
  return recents.flatMap((recent): T[] => {
    const edition = /^\/editions\//i.test(recent.path)
      ? singleSegment(recent.path, "editions")
      : null;
    if (/^\/editions\//i.test(recent.path)) {
      const label = edition == null ? null : grants.publishedEditionLabels.get(edition);
      // Do not replay an old label if a once-published Edition was renamed,
      // unpublished, or the current canonical label cannot be confirmed.
      return typeof label === "string" && label.trim()
        ? [{ ...recent, label: label.trim() } as T]
        : [];
    }

    const story = /^\/stories\//i.test(recent.path)
      ? singleSegment(recent.path, "stories")
      : null;
    if (/^\/stories\//i.test(recent.path)) {
      const label = story == null ? null : grants.publishedStoryLabels.get(story);
      return typeof label === "string" && label.trim()
        ? [{ ...recent, label: label.trim() } as T]
        : [];
    }
    return [recent];
  });
}

/**
 * Shared-device history stores visitor-visible titles, not merely destinations.
 * A Story headline can spoil a final even though the Story is public. In
 * spoiler-free mode, do not replay any stored Story title while the current
 * edition's final-result scope cannot be established without another query.
 * Keep deliberate published Results/Records links but replace stored labels
 * that may themselves reveal a winner. No additional hosted reads.
 */
export function spoilerSafePublicRecents<T extends { path: string; label: string }>(
  recents: readonly T[],
  spoilerFree: boolean,
): T[] {
  if (!spoilerFree) return [...recents];
  return recents.flatMap((recent): T[] => {
    if (/^\/stories(?:\/|[?#]|$)/i.test(recent.path)) return [];
    if (/^\/records(?:\/|[?#]|$)/i.test(recent.path)) {
      return [{ ...recent, label: "Records" } as T];
    }
    if (/^\/results(?:\/|[?#]|$)/i.test(recent.path)) {
      return [{ ...recent, label: "Results" } as T];
    }
    return [recent];
  });
}
