/**
 * A delegated country list is private Organizer data. Bind the entire
 * projection batch to the exact selected edition and the load generation;
 * A → B → A must not resurrect the earlier A read or its copy actions.
 */
export type ConfirmationCountriesRequest = Readonly<{
  editionId: string;
  generation: number;
}>;

export function isCurrentConfirmationCountriesRequest(
  request: ConfirmationCountriesRequest,
  current: ConfirmationCountriesRequest,
): boolean {
  return Boolean(request.editionId) &&
    request.editionId === current.editionId &&
    Number.isSafeInteger(request.generation) &&
    request.generation >= 0 &&
    request.generation === current.generation;
}

export type ConfirmationCountryScopedRow = {
  editions: { id: string } | null;
  submission_rounds: { edition_id: string } | null;
};

/** Refuse to render or export a partial batch containing a foreign round. */
export function isConfirmationCountryBatchInEdition(
  rows: readonly ConfirmationCountryScopedRow[],
  editionId: string,
): boolean {
  return Boolean(editionId) && rows.every(
    (row) =>
      row.editions?.id === editionId &&
      (row.submission_rounds === null || row.submission_rounds.edition_id === editionId),
  );
}
