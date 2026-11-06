import type { CountryDiscovery } from "./v3-discovery-entities";

export type CountryCurrentContext = {
  editionLabel: string;
  status: string;
};

/**
 * Only published Country discovery may assert current-edition participation.
 * An absent published row is not proof that a delegation is absent from an
 * unpublished/unfinished lineup; retain the distinction explicitly.
 */
export function resolveCountryCurrentContext(
  discovery: CountryDiscovery,
  countryId: string,
  availability: { loading: boolean; error: boolean },
): CountryCurrentContext {
  if (availability.error) {
    return { editionLabel: "Current edition", status: "Participation status unavailable" };
  }
  if (availability.loading) {
    return { editionLabel: "Current edition", status: "Checking published participation…" };
  }
  const edition = discovery.currentEdition;
  if (!edition) {
    return { editionLabel: "Country archive", status: "No active published edition" };
  }
  const editionLabel = edition.edition_number == null ? edition.name : `SSC ${edition.edition_number}`;
  if (discovery.disqualified.some((country) => country.id === countryId)) {
    return { editionLabel, status: "Disqualified" };
  }
  if (discovery.withdrawn.some((country) => country.id === countryId)) {
    return { editionLabel, status: "Withdrawn" };
  }
  if (discovery.participating.some((country) => country.id === countryId)) {
    return { editionLabel, status: "Participating" };
  }
  return { editionLabel, status: "No published participation confirmed" };
}


/** An old published entry is not a current entry merely because it is the
 * newest row in the archive. Hide the "current" claim if the underlying
 * published participation query is loading or unavailable. */
export function isPublishedCurrentCountryEntry(
  activeEditionId: string | null | undefined,
  entryEditionId: string | null | undefined,
  availability: { loading: boolean; error: boolean },
): boolean {
  return !availability.loading &&
    !availability.error &&
    Boolean(activeEditionId && entryEditionId && activeEditionId === entryEditionId);
}
