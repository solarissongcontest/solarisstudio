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
  const query = input.search.trim().toLowerCase();

  return countries
    .filter((country) => !input.participatingOnly || input.participatingCountryIds.has(country.id))
    .filter((country) => input.region === "all" || country.region === input.region)
    .filter(
      (country) =>
        !query ||
        country.name.toLowerCase().includes(query) ||
        country.short_code.toLowerCase().includes(query) ||
        (country.native_name ?? "").toLowerCase().includes(query),
    )
    .sort((left, right) => left.name.localeCompare(right.name));
}
