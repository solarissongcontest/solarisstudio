import { isValidUrl, parseTimestamp } from "./ssc";

/** A duplicate-check response is advisory. The final RPC still owns eligibility. */
export type NextInLineDuplicateState =
  | { key: string; status: "checking" | "unavailable" | "clear" }
  | { key: string; status: "duplicate"; type: "song" | "artist" };

export type NextInLineDraft = {
  editionId: string;
  sourceSubmissionId: string;
  country: string;
  method: "internal" | "national_final" | "unknown" | null;
  nationalFinalEntryId: string;
  eligibleNationalFinalEntryIds: readonly string[];
  artist: string;
  songTitle: string;
  songUrl: string;
  previewStart: string;
  previewEnd: string;
};

/** Keep every server lookup bound to the exact current draft. */
export function nextInLineDuplicateKey(draft: Pick<NextInLineDraft,
  "editionId" | "sourceSubmissionId" | "country" | "artist" | "songTitle" | "songUrl"
>): string {
  return JSON.stringify([
    draft.editionId,
    draft.sourceSubmissionId,
    draft.country,
    draft.artist.trim(),
    draft.songTitle.trim(),
    draft.songUrl.trim(),
  ]);
}

export function nextInLineDraftFingerprint(draft: NextInLineDraft): string {
  return JSON.stringify([
    draft.editionId,
    draft.sourceSubmissionId,
    draft.country,
    draft.method,
    draft.nationalFinalEntryId,
    draft.artist.trim(),
    draft.songTitle.trim(),
    draft.songUrl.trim(),
    draft.previewStart.trim(),
    draft.previewEnd,
  ]);
}

export function resolveNextInLineDuplicateCheck(
  key: string,
  response: { ok: boolean; duplicate: boolean; type: "song" | "artist" | null } | null,
): NextInLineDuplicateState {
  if (!response || response.ok !== true || typeof response.duplicate !== "boolean") {
    return { key, status: "unavailable" };
  }
  if (!response.duplicate) return { key, status: "clear" };
  if (response.type === "song" || response.type === "artist") {
    return { key, status: "duplicate", type: response.type };
  }
  return { key, status: "unavailable" };
}

export type NextInLineReadiness =
  | { ready: true }
  | { ready: false; reason: string };

export function nextInLineReviewReadiness(
  draft: NextInLineDraft,
  duplicateCheck: NextInLineDuplicateState | null,
): NextInLineReadiness {
  if (!draft.editionId || !draft.country || !draft.sourceSubmissionId) {
    return { ready: false, reason: "Choose an eligible competing country first." };
  }
  if (parseTimestamp(draft.previewStart) === null || !draft.previewEnd) {
    return { ready: false, reason: "Choose a valid 25-second preview start (MM:SS)." };
  }

  if (draft.method === "national_final") {
    return draft.eligibleNationalFinalEntryIds.includes(draft.nationalFinalEntryId)
      ? { ready: true }
      : { ready: false, reason: "Choose an eligible non-winning National Final song." };
  }
  if (draft.method !== "internal") {
    return {
      ready: false,
      reason: "This country's selection method is not confirmed. Reload its selection information before submitting.",
    };
  }
  if (!draft.artist.trim() || !draft.songTitle.trim() || !draft.songUrl.trim()) {
    return { ready: false, reason: "Enter the unused artist, song title and song link." };
  }
  if (!isValidUrl(draft.songUrl)) {
    return { ready: false, reason: "Enter a valid http:// or https:// song link." };
  }

  if (!duplicateCheck || duplicateCheck.key !== nextInLineDuplicateKey(draft)) {
    return { ready: false, reason: "Wait for the duplicate check on this exact song before reviewing." };
  }

  if (duplicateCheck.status === "duplicate") {
    return {
      ready: false,
      reason: duplicateCheck.type === "song"
        ? "That song is already an SSC entry and cannot enter Next in Line."
        : "That artist is already used by another country in this edition.",
    };
  }
  if (duplicateCheck.status !== "clear") {
    return {
      ready: false,
      reason: duplicateCheck.status === "unavailable"
        ? "Song eligibility could not be verified. Retry the check before reviewing."
        : "Checking whether this song has already been used…",
    };
  }
  return { ready: true };
}
