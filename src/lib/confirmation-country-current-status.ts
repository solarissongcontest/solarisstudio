/**
 * A country's current Confirmation state is the most recently submitted
 * response, not the newest response that happened to say "participating".
 *
 * Callers pass responses newest-first (as the Organizer country list does).
 * Earlier rounds remain available in history, but must never resurrect a
 * country that subsequently submitted a nonparticipation response.
 */
export function currentParticipatingCountryResponse<T extends { participating: boolean }>(
  responsesNewestFirst: readonly T[],
): T | null {
  const latest = responsesNewestFirst[0];
  return latest?.participating === true ? latest : null;
}
