/**
 * Authorized Entry version readback. These are immutable server records, not
 * editable drafts or an approval decision. Never expose full content snapshots
 * or signed media URLs from this projection in the Organizer UI.
 */
type JsonRecord = Record<string, unknown>;

export type OrganizerEntryRevision = {
  id: string;
  revision: number;
  source: string;
  restoredFromSubmissionVersionId: string | null;
  recordedAt: string | null;
  artist: string | null;
  songTitle: string | null;
  songSource: string | null;
  previewStart: string | null;
  previewEnd: string | null;
  finalClipStart: string | null;
  finalClipEnd: string | null;
  replacementVideoRequired: boolean;
  replacementVideoSource: string | null;
  credits: { name: string; role: string }[];
  reviews: { id: string; decision: string; reason: string | null; reviewedAt: string | null }[];
};

export type OrganizerEntryRevisionChange = {
  label: string;
  changed: boolean;
};

function record(value: unknown): JsonRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function credits(value: unknown) {
  if (value == null) return [] as { name: string; role: string }[];
  if (!Array.isArray(value) || value.length > 100) {
    throw new Error("Entry history returned malformed or oversized credit evidence.");
  }
  return value.map((item) => {
    const row = record(item);
    const name = text(row?.name);
    const role = text(row?.role);
    if (!name || !role) {
      throw new Error("Entry history returned incomplete credit evidence.");
    }
    return { name, role };
  });
}

export function parseOrganizerEntryRevisions(
  payload: unknown,
  expectedEntryId: string,
  expectedSubmissionId: string,
): OrganizerEntryRevision[] {
  const response = record(payload);
  if (!response || text(response.entry_id) !== expectedEntryId ||
      text(response.submission_id) !== expectedSubmissionId) {
    throw new Error("Entry history response did not match the displayed Entry and submission.");
  }
  if (!Array.isArray(response.versions) || response.versions.length > 20) {
    throw new Error("Entry history did not return a valid bounded version page.");
  }
  const knownIds = new Set<string>();
  let lastRevision = Number.POSITIVE_INFINITY;
  return response.versions.map((value) => {
    const row = record(value);
    const id = text(row?.id);
    const revision = row?.revision;
    const content = record(row?.content);
    if (!row || !id || !Number.isSafeInteger(revision) ||
        (revision as number) < 1 || (revision as number) >= lastRevision ||
        !content || knownIds.has(id)) {
      throw new Error("Entry history returned malformed or unordered immutable revision evidence.");
    }
    knownIds.add(id);
    lastRevision = revision as number;
    // Do not silently truncate or discard immutable review/audit evidence.
    // A partial ledger is more dangerous than an explicit reload error.
    if (row.reviews != null && !Array.isArray(row.reviews)) {
      throw new Error("Entry history returned malformed review evidence.");
    }
    const reviewRows = (row.reviews ?? []) as unknown[];
    if (reviewRows.length > 25) {
      throw new Error("Entry history exceeded the bounded review-evidence page.");
    }
    const reviewIds = new Set<string>();
    const reviews = reviewRows.map((value) => {
      const item = record(value);
      const decision = text(item?.decision);
      if (!item || !decision) {
        throw new Error("Entry history contains an invalid review decision.");
      }
      const reviewId = text(item.id) ?? `${id}:${decision}:${text(item.reviewed_at) ?? ""}`;
      if (reviewIds.has(reviewId)) {
        throw new Error("Entry history contains duplicate review evidence.");
      }
      reviewIds.add(reviewId);
      return {
        id: reviewId,
        decision,
        reason: text(item.reason),
        reviewedAt: text(item.reviewed_at),
      };
    });
    return {
      id,
      revision: revision as number,
      source: text(row.source) ?? "unknown",
      restoredFromSubmissionVersionId: text(row.restored_from_submission_version_id),
      recordedAt: text(row.recorded_at),
      artist: text(content.artist),
      songTitle: text(content.song_title),
      songSource: text(content.song_url),
      previewStart: text(content.preview_start),
      previewEnd: text(content.preview_end),
      finalClipStart: text(content.final_clip_start),
      finalClipEnd: text(content.final_clip_end),
      replacementVideoRequired: content.replacement_video_required === true,
      replacementVideoSource: text(content.replacement_video_url),
      credits: credits(content.credits),
      reviews,
    };
  });
}

/**
 * Earlier immutable revision pages must append without losing evidence.
 * Reject repeated version identities, even if the server assigns a different
 * revision number, instead of silently de-duplicating the audit history.
 */
export function appendOrganizerEntryRevisionPage(
  existing: readonly OrganizerEntryRevision[],
  incoming: readonly OrganizerEntryRevision[],
  beforeRevision: number,
): OrganizerEntryRevision[] {
  if (!Number.isSafeInteger(beforeRevision) || beforeRevision < 1 ||
      (existing.length > 0 && existing[existing.length - 1].revision !== beforeRevision)) {
    throw new Error("Entry history continuation cursor no longer matches the displayed revisions.");
  }
  const seen = new Set(existing.map((version) => version.id));
  for (const version of incoming) {
    if (version.revision >= beforeRevision || seen.has(version.id)) {
      throw new Error("Entry history repeated or reordered an already displayed revision. Reload its history.");
    }
    seen.add(version.id);
  }
  return [...existing, ...incoming];
}

/**
 * Compare only fields visible in the Organizer Entry inspection. In particular
 * URLs are compared but NEVER returned as plain text or displayed as history
 * links: those values can contain short-lived private access tokens.
 */
export function compareOrganizerEntryRevisions(
  newer: OrganizerEntryRevision,
  older: OrganizerEntryRevision,
): OrganizerEntryRevisionChange[] {
  const sameCredits = (left: OrganizerEntryRevision["credits"], right: OrganizerEntryRevision["credits"]) =>
    JSON.stringify(left) === JSON.stringify(right);
  return [
    { label: "Artist name", changed: newer.artist !== older.artist },
    { label: "Song title", changed: newer.songTitle !== older.songTitle },
    { label: "Song source", changed: newer.songSource !== older.songSource },
    { label: "Preview timing", changed: newer.previewStart !== older.previewStart || newer.previewEnd !== older.previewEnd },
    { label: "Final clip timing", changed: newer.finalClipStart !== older.finalClipStart || newer.finalClipEnd !== older.finalClipEnd },
    { label: "Replacement video requirement", changed: newer.replacementVideoRequired !== older.replacementVideoRequired },
    { label: "Replacement video source", changed: newer.replacementVideoSource !== older.replacementVideoSource },
    { label: "Credits", changed: !sameCredits(newer.credits, older.credits) },
  ];
}

export function hasEarlierOrganizerEntryVersions(
  page: readonly OrganizerEntryRevision[],
): boolean {
  return page.length === 20 && page[page.length - 1].revision > 1;
}
