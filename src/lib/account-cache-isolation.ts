import type { QueryClient } from "@tanstack/react-query";

type AccountUser = { id: string } | null | undefined;

// Explicit, actor-scoped fan query families. Keep this exact-match list separate
// from public feeds/leaderboards so account switches never purge public caches.
const privateFanQueryRoots = new Set([
  "fan-follows",
  "fan-event-reads",
  "notification-preferences",
  "fan-profile",
  "my-prediction",
  "prediction-history",
  "fan-taste-ballots",
  "fantasy-my-team",
  "fantasy-my-team-entries",
  // Used by the pending Following/Save integration; keep its cache isolated
  // when that feature is merged without introducing a second logout owner.
  "v3-follow-entity-details",
]);

export function isPrivateAccountQuery(key: readonly unknown[]) {
  const root = String(key[0] ?? "");
  return privateFanQueryRoots.has(root) || /^(edition-selection|user-prefs|user-country-ownership|mysolaris-|my-solaris-|my-country-|hod-history|hod-identity-suggestions|permission-engine-|authenticated-identity-gate|organizer-access-gate|v3-organizer|confirmation-requirements|owned-|country-confirmation-|country-jury-|home-personal-attention|participate-jury-|participate-confirmation-access|admin-|studio2-|organisation-backend-contract|v3-rollout-probe|v3-primary-surface-bundle)/.test(
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
  resetAttention: () => void,
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
      resetAttention();
    }
    client.setQueryData(["fan-session"], user ?? null);
  };
}