import type { Participant, ResultRow } from "./data";

export type ParticipationStatus = "confirmed" | "withdrawn" | "disqualified";

export type ParticipationAwareParticipant = Participant & {
  participation_status?: ParticipationStatus | "pending" | "waitlist" | string | null;
};

export function participationStatus(participant: ParticipationAwareParticipant): ParticipationStatus {
  return participant.participation_status === "withdrawn" || participant.participation_status === "disqualified"
    ? participant.participation_status
    : "confirmed";
}

export function isCompetingParticipant(participant: ParticipationAwareParticipant): boolean {
  return participationStatus(participant) === "confirmed";
}

export function participationStatusLabel(status: ParticipationStatus): string {
  if (status === "withdrawn") return "Withdrawn";
  if (status === "disqualified") return "Disqualified";
  return "Active";
}

function editionIdentityKey(editionId: string, countryId: string): string {
  return `${editionId}:${countryId}`;
}

export function nonCompetingEditionIdentities(participants: ParticipationAwareParticipant[]): Set<string> {
  return new Set(
    participants
      .filter((participant) => !isCompetingParticipant(participant))
      .map((participant) => editionIdentityKey(participant.edition_id, participant.country_id)),
  );
}

/**
 * Result rows remain stored exactly as they were historically. A withdrawal or
 * disqualification is a participation state, not destructive result editing.
 * Public scoreboards/statistics simply omit results whose edition identity is
 * currently marked non-competing.
 */
export function filterResultsToCompetingParticipants(
  results: ResultRow[],
  participants: ParticipationAwareParticipant[],
): ResultRow[] {
  const excluded = nonCompetingEditionIdentities(participants);
  if (!excluded.size) return results;
  return results.filter(
    (result) => !excluded.has(editionIdentityKey(result.edition_id, result.country_id)),
  );
}
