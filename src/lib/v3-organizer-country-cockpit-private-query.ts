export type OrganizerCountryCockpitPrivateScope = {
  actorId: string | null | undefined;
  editionId: string | null | undefined;
  editionVerified: boolean;
};

export type OrganizerCountryCockpitPrivateQueryState = {
  isSuccess: boolean;
  isFetching: boolean;
  error: unknown;
};

/**
 * The readiness projection contains unpublished, actor-authorized delegation
 * state. A public edition ID is never sufficient to reuse its cached rows.
 */
export function resolveOrganizerCountryCockpitPrivateScope(
  scope: OrganizerCountryCockpitPrivateScope,
) {
  const actorId = scope.actorId?.trim() ?? "";
  const editionId = scope.editionId?.trim() ?? "";
  return {
    queryKey: [
      "studio2-country-cockpit",
      "organizer-countries",
      actorId || "unverified-actor",
      editionId || "unverified-edition",
    ] as const,
    enabled: Boolean(actorId && editionId && scope.editionVerified),
  };
}

/**
 * Do not render old private rows during edition/account verification, a
 * permission-invalidating refresh, or a failed read. This is independent of
 * the server RPC's own mandatory authorization.
 */
export function canExposeOrganizerCountryCockpitRows(
  scope: OrganizerCountryCockpitPrivateScope,
  query: OrganizerCountryCockpitPrivateQueryState,
) {
  return (
    resolveOrganizerCountryCockpitPrivateScope(scope).enabled &&
    query.isSuccess &&
    !query.isFetching &&
    query.error == null
  );
}
