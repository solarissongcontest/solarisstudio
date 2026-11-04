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

/** Never fall back to another edition when edition context is missing. */
export function preferredCountryConfirmationResponse(
  responses: readonly CountryConfirmationResponse[],
  editionId: string | null,
): CountryConfirmationResponse | null {
  if (!editionId?.trim()) return null;
  const eligible = responses.filter((response) => response.edition_id === editionId);
  return eligible.find((response) => response.can_edit) ?? eligible[0] ?? null;
}
/** The saved response and the edition-level requirement are distinct facts. */
export function countryConfirmationOverviewMessage(
  status: "required" | "satisfied" | "waived" | "invalidated" | null,
  hasEditionResponse: boolean,
  hasOtherEditionResponse: boolean,
): string {
  switch (status) {
    case "satisfied":
      return "Your edition Confirmation requirement is satisfied. A later round does not automatically require another response.";
    case "required":
      return hasEditionResponse
        ? "A response is saved for this edition, but its current Confirmation requirement is still outstanding. Follow the latest TSBC instructions before assuming participation is confirmed."
        : "This edition still requires your Confirmation. Choose an eligible submission round below to complete it.";
    case "waived":
      return "TSBC has waived this delegation's Confirmation requirement for this edition. No additional response is required.";
    case "invalidated":
      return "The previous Confirmation requirement was invalidated. Check the current instructions before attempting another submission.";
    default:
      return hasEditionResponse
        ? "A response is saved for this edition, but its requirement status is unavailable here. A saved response alone does not prove completion."
        : hasOtherEditionResponse
          ? "A Confirmation from another edition remains saved in history, but it does not confirm participation in this edition."
          : "No edition-level Confirmation requirement or response is currently recorded here.";
  }
}
