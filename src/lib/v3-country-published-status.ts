/** Presentation-only status from the canonical published current-edition participant projection. */
export type PublishedCountryStatus = "participating" | "withdrawn" | "disqualified";
type CountryIdentifier = { id: string };
export type PublishedCountryGroups = {
  participating: readonly CountryIdentifier[];
  withdrawn: readonly CountryIdentifier[];
  disqualified: readonly CountryIdentifier[];
};

/** Fail closed: a pending, failed or absent lineup must never imply a status. */
export function publishedCountryStatusMap(
  groups: PublishedCountryGroups,
  lineupReady: boolean,
): ReadonlyMap<string, PublishedCountryStatus> {
  const statuses = new Map<string, PublishedCountryStatus>();
  if (!lineupReady) return statuses;
  for (const country of groups.participating) statuses.set(country.id, "participating");
  for (const country of groups.withdrawn) statuses.set(country.id, "withdrawn");
  for (const country of groups.disqualified) statuses.set(country.id, "disqualified");
  return statuses;
}
