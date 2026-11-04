/**
 * The response-detail RPC is keyed by a submission ID. Organizer navigation
 * must additionally bind the result to the selected edition before exposing
 * private review, technical, recovery or privileged mutation controls.
 *
 * This client guard supplements server-side confirmation.read and RLS.
 */
export type ScopedConfirmationDetail = {
  id?: string | null;
  edition?: { id?: string | null } | null;
};

export function isConfirmationDetailInOrganizerScope(
  detail: ScopedConfirmationDetail | null | undefined,
  expectedSubmissionId: string,
  organizerEditionId: string,
): boolean {
  return Boolean(
    expectedSubmissionId &&
    organizerEditionId &&
    detail?.id === expectedSubmissionId &&
    detail?.edition?.id === organizerEditionId,
  );
}
