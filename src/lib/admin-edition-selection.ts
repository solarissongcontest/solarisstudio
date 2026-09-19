export type OrganizerEditionIdentity = {
  id: string;
};

export function selectOrganizerEdition<T extends OrganizerEditionIdentity>(
  editions: readonly T[],
  editionId: string | null | undefined,
): T | null {
  if (!editionId) return null;
  return editions.find((edition) => edition.id === editionId) ?? null;
}
