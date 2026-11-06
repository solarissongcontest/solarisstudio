import type { AccountAccess } from "./country-account";

/**
 * Discovery only. The Confirmation route remains the authorization authority.
 * Do not advertise personal delegation work while identity or account access
 * is unresolved, suspended or unavailable.
 */
export function canSuggestDelegationSearchActions(
  access: Pick<
    AccountAccess,
    "userId" | "countryId" | "countryStatus" | "schemaReady"
  > | null | undefined,
): boolean {
  return (
    access?.schemaReady === true &&
    typeof access.userId === "string" &&
    access.userId.trim().length > 0 &&
    typeof access.countryId === "string" &&
    access.countryId.trim().length > 0 &&
    access.countryStatus === "active"
  );
}
