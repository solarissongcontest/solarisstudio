import {
  effectiveOrganizerEntryReviewStatus,
  type OrganizerEntrySourceInput,
} from "./v3-organizer-entry-source-inspection";

type Entry = OrganizerEntrySourceInput & {
  id?: string | null;
  removed?: boolean | null;
};

type NationalFinal = {
  winning_entry_id?: string | null;
  entries?: readonly Entry[] | null;
};

export type OrganizerNationalFinalReviewBanner = {
  label: string;
  tone: "ready" | "neutral" | "attention";
  description: string;
};

export type OrganizerEntryDetailSummary = {
  entryCount: number;
  currentAcceptedCount: number;
  nationalFinal: OrganizerNationalFinalReviewBanner | null;
};

/**
 * A green Organizer readiness display requires both canonical current-version
 * acceptance and minimally present song identity. This never changes the
 * stored review decision or replaces the authoritative server checks.
 */
export function isOrganizerEntryReadyForWinner(
  entry: OrganizerEntrySourceInput & { removed?: boolean | null },
): boolean {
  return Boolean(entry.song_title?.trim()) &&
    effectiveOrganizerEntryReviewStatus(entry) === "accepted";
}

/**
 * Presentation-only Organizer detail summary. Historical review statuses
 * remain visible in audit history but cannot count as accepted current
 * immutable Entry versions or imply an approved National Final winner.
 * Counters describe the current participating selection, not residual data
 * retained after a delegation changes its selection method.
 */
export function summarizeOrganizerEntryDetail(input: {
  participating: boolean;
  selectionMethod: string | null;
  internalEntry?: Entry | null;
  nationalFinal?: NationalFinal | null;
}): OrganizerEntryDetailSummary {
  const nf = input.nationalFinal;
  const active = (nf?.entries ?? []).filter((entry) =>
    !entry.removed && entry.review_status !== "removed",
  );
  const entries = !input.participating ? []
    : input.selectionMethod === "internal"
      ? (input.internalEntry && !input.internalEntry.removed &&
          input.internalEntry.review_status !== "removed" ? [input.internalEntry] : [])
      : input.selectionMethod === "national_final" ? active : [];
  const currentAcceptedCount = entries.filter(isOrganizerEntryReadyForWinner).length;

  let banner: OrganizerNationalFinalReviewBanner | null = null;
  if (nf) {
    const winnerId = nf.winning_entry_id;
    const winnerIsActive = Boolean(winnerId && active.some((entry) => entry.id === winnerId));
    const allCurrentAccepted = active.length > 0 && active.every(isOrganizerEntryReadyForWinner);

    if (!input.participating || input.selectionMethod !== "national_final") {
      banner = {
        label: "Historical selection",
        tone: "neutral",
        description: "This National Final is not the currently participating selection.",
      };
    } else if (!active.length) {
      banner = {
        label: "No active entries",
        tone: "attention",
        description: "No current National Final candidates can be reviewed.",
      };
    } else if (winnerId && !winnerIsActive) {
      banner = {
        label: "Winner needs review",
        tone: "attention",
        description: "The stored winner does not identify an active candidate.",
      };
    } else if (!allCurrentAccepted) {
      banner = {
        label: winnerIsActive ? "Winner selected · review incomplete" : "Review in progress",
        tone: "attention",
        description: "One or more active candidates lack a current-version accepted review or a submitted song title.",
      };
    } else if (!winnerId) {
      banner = {
        label: "Waiting for winner",
        tone: "neutral",
        description: "All active candidates have current-version accepted reviews, but no winner is selected.",
      };
    } else {
      banner = {
        label: "Winner set",
        tone: "ready",
        description: "The selected winner is active and every candidate has a current-version accepted review.",
      };
    }
  }

  return {
    entryCount: entries.length,
    currentAcceptedCount,
    nationalFinal: banner,
  };
}
