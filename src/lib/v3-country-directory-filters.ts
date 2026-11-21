import { matchesPublicDirectorySearch } from "./v3-public-directory-search";

/** Preserve a participant-scope permalink until the public edition and lineup
 * have been checked. A slow edition lookup must not erase a valid deep link. */
export function shouldHoldCountryLineupUrlScope(
  requested: boolean,
  editionSourceReady: boolean,
  lineupReadPending: boolean,
): boolean {
  return requested && (!editionSourceReady || lineupReadPending);
}

/** Current-edition selection is usable only with a successful published lineup read. */
export function effectiveParticipatingScope(requested: boolean, currentLineupReady: boolean): boolean {
  return requested && currentLineupReady;
}

/** Bounded public country discovery filters; this is presentation only, never participation authority. */
export type DirectoryCountry = {
  id: string;
  name: string;
  short_code: string;
  native_name?: string | null;
  region?: string | null;
};

export function filterCountryDirectory<T extends DirectoryCountry>(
  countries: readonly T[],
  input: {
    search: string;
    region: string;
    participatingOnly: boolean;
    participatingCountryIds: ReadonlySet<string>;
  },
): T[] {
  return countries
    .filter((country) => !input.participatingOnly || input.participatingCountryIds.has(country.id))
    .filter((country) => input.region === "all" || (country.region?.trim() || "Other") === input.region)
    .filter((country) => matchesPublicDirectorySearch(input.search, [
      country.name,
      country.short_code,
      country.native_name,
      country.region?.trim() || "Other",
    ]))
    .sort((left, right) => left.name.localeCompare(right.name));
}

/** Region facets reflect the current country collection, never unrelated editions. */
export function countryDirectoryRegionOptions<T extends DirectoryCountry>(
  countries: readonly T[],
  input: { participatingOnly: boolean; participatingCountryIds: ReadonlySet<string> },
): Array<{ name: string; count: number }> {
  const counts = new Map<string, number>();
  for (const country of countries) {
    if (input.participatingOnly && !input.participatingCountryIds.has(country.id)) continue;
    const name = country.region?.trim() || "Other";
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((left, right) => left.name.localeCompare(right.name));
}
