import type { CountryConfirmationResponse } from "./confirmation-country-account";

export type CountryConfirmationRoundState =
  | { kind: "create"; response: null }
  | { kind: "edit"; response: CountryConfirmationResponse };

export function resolveCountryConfirmationRoundState(
  responses: readonly CountryConfirmationResponse[],
  roundId: string,
): CountryConfirmationRoundState {
  const response = responses.find((item) => item.round_id === roundId) ?? null;

  return response
    ? { kind: "edit", response }
    : { kind: "create", response: null };
}

export function preferredCountryConfirmationResponse(
  responses: readonly CountryConfirmationResponse[],
  editionId?: string | null,
): CountryConfirmationResponse | null {
  const eligible = editionId
    ? responses.filter((response) => response.edition_id === editionId)
    : responses;
  return eligible.find((response) => response.can_edit) ?? eligible[0] ?? null;
}
