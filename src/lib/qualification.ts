import type { Participant, ResultRow, Show } from "./data";
import {
  isGrandFinalKind,
  isSemiFinalKind,
  resolveShowPublication,
} from "./publication";

export type QualificationStatus = "q" | "aq" | "wildcard" | "nq" | null;

type QualificationInput = {
  shows: Show[];
  participants: Participant[];
  results?: ResultRow[];
};

function qualifierCutoff(show: Show) {
  const raw = show.voting_config?.["qualifiers"];
  if (typeof raw === "number" && Number.isFinite(raw)) return Math.max(0, Math.trunc(raw));
  if (typeof raw === "string" && /^\d+$/.test(raw.trim())) return Number(raw.trim());
  return Math.max(0, show.qualifier_count ?? 0);
}

/**
 * Resolve the public qualification route for one country in one edition.
 *
 * Q = finished inside the semi-final qualifier cutoff.
 * NQ = finished outside the cutoff and did not reach the final.
 * Wildcard = finished outside the semi-final cutoff but still reached the final.
 * AQ = reached the final without competing in a semi-final in an edition that had semis.
 *
 * The helper deliberately preserves the semi-final `qualified` boolean as the
 * top-N fact. A wildcard therefore remains `qualified === false` at the semi
 * level while still counting as a successful final qualification in history
 * and streak analytics.
 */
export function resolveCountryEditionQualification(
  countryId: string,
  editionId: string,
  input: QualificationInput,
): QualificationStatus {
  const editionShows = input.shows.filter((show) => show.edition_id === editionId);
  const semiShows = editionShows.filter((show) => isSemiFinalKind(show.kind));
  if (!semiShows.length) return null;

  // Do not infer Q/NQ/AQ/Wildcard before qualification outcomes are public.
  if (!semiShows.some((show) => resolveShowPublication(show).qualifiers)) return null;

  const showById = new Map(editionShows.map((show) => [show.id, show]));
  const countryParticipants = input.participants.filter(
    (participant) => participant.country_id === countryId && participant.edition_id === editionId,
  );
  const semiRows = countryParticipants.filter((participant) =>
    isSemiFinalKind(showById.get(participant.show_id ?? "")?.kind),
  );

  const finalReached =
    countryParticipants.some((participant) =>
      isGrandFinalKind(showById.get(participant.show_id ?? "")?.kind),
    ) ||
    (input.results ?? []).some(
      (result) =>
        result.country_id === countryId &&
        result.edition_id === editionId &&
        isGrandFinalKind(showById.get(result.show_id ?? "")?.kind),
    );

  if (!semiRows.length) return finalReached ? "aq" : null;

  if (semiRows.some((participant) => participant.qualified === true)) return "q";
  if (semiRows.some((participant) => participant.qualified === false)) {
    return finalReached ? "wildcard" : "nq";
  }

  // Legacy/fallback path: if the top-N boolean is missing but semi results are
  // public, derive the same fact from rank + the configured qualifier cutoff.
  let hasKnownSemiResult = false;
  let insideCutoff = false;
  for (const result of input.results ?? []) {
    if (result.country_id !== countryId || result.edition_id !== editionId || result.final_rank == null) {
      continue;
    }
    const show = showById.get(result.show_id ?? "");
    if (!show || !isSemiFinalKind(show.kind)) continue;
    const cutoff = qualifierCutoff(show);
    if (cutoff <= 0) continue;
    hasKnownSemiResult = true;
    if (result.final_rank >= 1 && result.final_rank <= cutoff) insideCutoff = true;
  }

  if (!hasKnownSemiResult) return null;
  if (insideCutoff) return "q";
  return finalReached ? "wildcard" : "nq";
}

export function qualificationCountsAsQualified(status: QualificationStatus) {
  return status === "q" || status === "aq" || status === "wildcard";
}

export function qualificationLabel(status: QualificationStatus) {
  if (status === "q") return "Q";
  if (status === "aq") return "AQ";
  if (status === "wildcard") return "Wildcard";
  if (status === "nq") return "NQ";
  return null;
}
