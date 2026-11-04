/**
 * A page response belongs to the same Organizer request epoch only when
 * both the selected edition and the generation still match.
 *
 * Checking edition alone is insufficient: A → B → A must not admit a
 * response produced by the first A session.
 */
export type ConfirmationResponsePageRequest = Readonly<{
  editionId: string;
  generation: number;
}>;

export function isCurrentConfirmationResponsePage(
  request: ConfirmationResponsePageRequest,
  current: ConfirmationResponsePageRequest,
): boolean {
  return Boolean(request.editionId) &&
    Number.isSafeInteger(request.generation) &&
    request.generation >= 0 &&
    request.editionId === current.editionId &&
    request.generation === current.generation;
}
