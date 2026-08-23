import type { Participant, ResultRow, Show } from "./data";
import {
  isFinalShow,
  isHeatShow,
  isSecondChanceShow,
  isSemiShow,
} from "./edition-progression";
import { resolveShowPublication } from "./publication";

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
 * Resolve the public Grand Final qualification route for one country in one
 * edition, including editions that used an earlier Heat -> Semi -> Final path.
 *
 * Q = reached the Grand Final through a semi-final qualifier place.
 * NQ = did not reach the Grand Final. This includes countries eliminated in a
 * heat or Second Chance before the semi-final.
 * Wildcard = missed the normal semi-final cutoff but still reached the final.
 * AQ = reached the final without competing in a semi-final in an edition that
 * had semi-finals.
 *
 * Heat and Second Chance `qualified` flags remain stage-local facts. They say
 * whether the country advanced to the semi-final; the semi-final flag says
 * whether it advanced to the Grand Final. Second Chance itself is not treated
 * as a separate final ranking tier.
 */
export function resolveCountryEditionQualification(
  countryId: string,
  editionId: string,
  input: QualificationInput,
): QualificationStatus {
  const editionShows = input.shows.filter((show) => show.edition_id === editionId);
  const semiShows = editionShows.filter((show) => isSemiShow(show));
  if (!semiShows.length) return null;

  // Do not infer final Q/NQ/AQ/Wildcard before the semi qualification outcome
  // itself is public. Heat results may be known earlier while the edition is
  // still in progress.
  if (!semiShows.some((show) => resolveShowPublication(show).qualifiers)) return null;

  const showById = new Map(editionShows.map((show) => [show.id, show]));
  const countryParticipants = input.participants.filter(
    (participant) => participant.country_id === countryId && participant.edition_id === editionId,
  );
  const countryResults = (input.results ?? []).filter(
    (result) => result.country_id === countryId && result.edition_id === editionId,
  );

  const semiRows = countryParticipants.filter((participant) =>
    isSemiShow(showById.get(participant.show_id ?? "")),
  );
  const lowerStageRows = countryParticipants.filter((participant) => {
    const show = showById.get(participant.show_id ?? "");
    return isHeatShow(show) || isSecondChanceShow(show);
  });

  const finalReached =
    countryParticipants.some((participant) => isFinalShow(showById.get(participant.show_id ?? ""))) ||
    countryResults.some((result) => isFinalShow(showById.get(result.show_id ?? "")));

  const semiReached =
    semiRows.length > 0 ||
    countryResults.some((result) => isSemiShow(showById.get(result.show_id ?? "")));

  if (!semiReached) {
    // In a multi-stage edition, a country that never reached the semi-final is
    // an NQ for the edition. If a lower-stage row says it qualified but the
    // corresponding semi row is not loaded yet, leave the outcome unresolved
    // rather than inventing a later result.
    if (lowerStageRows.length) {
      if (lowerStageRows.some((participant) => participant.qualified === true)) return null;
      return finalReached ? "wildcard" : "nq";
    }
    return finalReached ? "aq" : null;
  }

  if (!semiRows.length) {
    // A published semi result can exist in older data even when its participant
    // row is missing. Derive the top-N fact from the result/cutoff below.
  } else {
    if (semiRows.some((participant) => participant.qualified === true)) return "q";
    if (semiRows.some((participant) => participant.qualified === false)) {
      return finalReached ? "wildcard" : "nq";
    }
  }

  // Legacy/fallback path: if the semi top-N boolean is missing but results are
  // public, derive the same fact from rank + configured qualifier cutoff.
  let hasKnownSemiResult = false;
  let insideCutoff = false;
  for (const result of countryResults) {
    if (result.final_rank == null) continue;
    const show = showById.get(result.show_id ?? "");
    if (!show || !isSemiShow(show)) continue;
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
