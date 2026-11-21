import { matchesPublicSearch } from "./public-search";

/**
 * Edition picker filtering is presentational: no additional data requests,
 * Organizer context changes or alternate edition authority.
 */
export type OrganizerEditionSearchable = {
  name?: string | null;
  slug?: string | null;
  host_city?: string | null;
  edition_number?: number | null;
};

export function matchesOrganizerEditionSearch(
  edition: OrganizerEditionSearchable,
  displayLabel: string,
  query: string,
): boolean {
  return matchesPublicSearch(
    query,
    displayLabel,
    edition.name,
    edition.slug,
    edition.host_city,
    edition.edition_number,
  );
}
