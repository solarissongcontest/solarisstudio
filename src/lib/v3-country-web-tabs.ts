/**
 * Legacy ordinary-web Country sections are shareable fragment destinations.
 * Keep the current public route search schema unchanged: adding validateSearch
 * would make unrelated country links require a new typed query contract.
 */
export const COUNTRY_WEB_SECTIONS = [
  "overview", "entries", "results", "voting", "relationships", "form",
] as const;

export type CountryWebSection = (typeof COUNTRY_WEB_SECTIONS)[number];

export function sectionFromCountryHash(hash: string | null | undefined): CountryWebSection {
  const raw = (hash ?? "").replace(/^#/, "").toLowerCase();
  return COUNTRY_WEB_SECTIONS.find((section) => section === raw) ?? "overview";
}

/** No fragment on the canonical Overview URL; other sections remain permalinkable. */
export function countrySectionHash(section: CountryWebSection): string {
  return section === "overview" ? "" : section;
}
