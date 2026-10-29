import type { QueryClient } from "@tanstack/react-query";

type AccountUser = { id: string } | null | undefined;

/** Server identity results are scoped to the current UI session, never shared across accounts. */
export function authenticatedIdentityQueryKey(userId: string | null) {
  return ["authenticated-identity-gate", userId] as const;
}

export function isPrivateAccountQuery(key: readonly unknown[]) {
  const root = String(key[0] ?? "");
  return /^(authenticated-identity-gate|organizer-tasks-v5|organizer-task-count-v5|edition-selection|user-prefs|user-country-ownership|mysolaris-|my-solaris-|my-country-|owned-|country-confirmation-|confirmation-(requirements|submission-versions|responses-for-version-history|response-version-current)(?:$|-)|country-jury-|home-personal-attention|participate-jury-|participate-confirmation-access|fan-(profile|follows|event-reads|taste-ballots)(?:$|-)|notification-preferences(?:$|-)|prediction-history(?:$|-)|my-prediction(?:$|-)|fantasy-(my-|admin-)|integrity-(user|protected-case|protected-cases)(?:$|-)|v3-me-summary(?:$|-)|v3-account-|admin-|studio2-|merged-televoting-|merged-integrity-|merged-combined-|friend-voting-|v3-organizer-|televoting-result-integrity|organisation-backend-contract|v3-edition-rollout-probe|v3-participant-activity|v3-rollout-probe|v3-primary-surface-bundle)/.test(
    root,
  );
}

export function clearPrivateAccountQueries(client: QueryClient) {
  const filter = {
    predicate: (query: { queryKey: readonly unknown[] }) => isPrivateAccountQuery(query.queryKey),
  };
  // cancelQueries cancels retryers synchronously, before its promise resolves.
  void client.cancelQueries(filter);
  client.removeQueries(filter);
}

export function createAccountCacheIsolationHandler(
  client: QueryClient,
  resetAttention: (viewerId: string | null) => void,
  isCurrent: () => boolean = () => true,
) {
  let previousUserId: string | null | undefined;

  return (user: AccountUser) => {
    if (!isCurrent()) return;

    const nextUserId = user?.id ?? null;
    if (previousUserId !== nextUserId) {
      previousUserId = nextUserId;
      // Security ordering is intentional: invalidate the previous account's
      // private observers before publishing the next fan-session namespace.
      clearPrivateAccountQueries(client);
      resetAttention(nextUserId);
    }
    // An older getSession retryer must not overwrite this newer SDK event.
    void client.cancelQueries({ queryKey: ["fan-session"], exact: true });
    client.setQueryData(["fan-session"], user ?? null);
  };
}
