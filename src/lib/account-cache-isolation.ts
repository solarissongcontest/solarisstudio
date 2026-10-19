import type { QueryClient } from "@tanstack/react-query";

type AccountUser = { id: string; [key: string]: unknown } | null | undefined;

export function isPrivateAccountQuery(key: readonly unknown[]) {
  const root = String(key[0] ?? "");
  return /^(edition-selection|user-prefs|user-country-ownership|mysolaris-|my-solaris-|my-country-|owned-|country-confirmation-|country-jury-|home-personal-attention|participate-jury-|participate-confirmation-access|admin-|studio2-|organisation-backend-contract|v3-rollout-probe|v3-primary-surface-bundle|v3-account-)/.test(
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
      // private observers before publishing the next account identity.
      clearPrivateAccountQueries(client);
      resetAttention();

      // The authenticated route deliberately does not own another auth-state
      // subscription. Reconcile its cached identity from this single global
      // subscriber so remote revocation/sign-out and A -> B account switches
      // cannot leave the protected shell rendering the previous account while
      // a background refetch is still pending. AccountCacheIsolation receives
      // the Supabase auth User object at runtime, so replacing the cache is
      // stricter than merely invalidating stale identity data.
      client.setQueryData(["authenticated-identity-gate"], user ?? null);
    }
    client.setQueryData(["fan-session"], user ?? null);
  };
}
