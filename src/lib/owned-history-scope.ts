/**
 * Private delegation history is scoped to both the viewer and their country.
 * Neither a shared cache nor a late response may cross that boundary.
 */
export type OwnedHistoryScope = Readonly<{
  viewerId: string;
  countryId: string;
}>;

type AccountSnapshot = {
  access: { userId: string | null; countryId: string | null };
  country: { id: string } | null;
};

export function resolveOwnedHistoryScope(
  viewerId: string | null | undefined,
  account: AccountSnapshot | null | undefined,
  expectedViewerId?: string,
): OwnedHistoryScope | null {
  if (
    !viewerId ||
    (expectedViewerId !== undefined && expectedViewerId !== viewerId) ||
    !account?.country?.id ||
    account.access.userId !== viewerId ||
    account.access.countryId !== account.country.id
  ) {
    return null;
  }
  return { viewerId, countryId: account.country.id };
}

export type OwnedHistoryQueryRoot =
  | "owned-hod-edition-history"
  | "owned-country-identity-history";

export function scopedOwnedHistoryQueryKey(
  root: OwnedHistoryQueryRoot,
  scope: OwnedHistoryScope | null,
) {
  return [root, scope?.viewerId ?? null, scope?.countryId ?? null] as const;
}

/** Fail closed if a late or wrong-country RPC response reaches a reader. */
export function assertOwnedHistoryCountry(value: unknown, scope: OwnedHistoryScope): void {
  if (
    !value ||
    typeof value !== "object" ||
    (value as { country_id?: unknown }).country_id !== scope.countryId
  ) {
    throw new Error("Delegation history could not be verified for this account.");
  }
}
