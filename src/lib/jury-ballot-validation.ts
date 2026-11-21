/** Presentation/preflight validation; canonical submission RPC remains authoritative. */
export function juryConfigurationError(input: {
  pointScale: readonly number[];
  participantIds: readonly string[];
  countryId: string;
  allowSelfVote: boolean;
}): string | null {
  const { pointScale, participantIds, countryId, allowSelfVote } = input;
  if (!pointScale.length || pointScale.some((p) => !Number.isSafeInteger(p) || p <= 0) ||
      new Set(pointScale).size !== pointScale.length) {
    return "The show's jury point scale is invalid. Ask the Organizer to verify its configuration.";
  }
  const recipients = new Set(participantIds.filter((id) => id && (allowSelfVote || id !== countryId)));
  if (recipients.size < pointScale.length) {
    return "This show has fewer eligible recipients than jury scores. Ask the Organizer to verify its configuration.";
  }
  return null;
}

export function juryAllocationError(input: {
  pointScale: readonly number[];
  participantIds: readonly string[];
  countryId: string;
  allowSelfVote: boolean;
  entries: ReadonlyArray<{ target_country_id: string; points: number }>;
}): string | null {
  const configuration = juryConfigurationError(input);
  if (configuration) return configuration;
  const { entries, pointScale, participantIds, countryId, allowSelfVote } = input;
  if (entries.length !== pointScale.length || new Set(entries.map((e) => e.points)).size !== pointScale.length ||
      entries.some((e) => !pointScale.includes(e.points))) return "Use every jury score exactly once";
  if (new Set(entries.map((e) => e.target_country_id)).size !== entries.length) return "Each country can receive only one jury score";
  if (entries.some((e) => !participantIds.includes(e.target_country_id))) return "One or more selected countries are not in this show";
  if (!allowSelfVote && entries.some((e) => e.target_country_id === countryId)) return "You cannot vote for your own country";
  return null;
}
