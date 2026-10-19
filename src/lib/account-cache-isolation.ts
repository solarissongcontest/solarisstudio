import type { QueryClient } from "@tanstack/react-query";

type AccountUser = { id: string } | null | undefined;

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
      const priorUserId = previousUserId;
      previousUserId = nextUserId;
      // Security ordering is intentional: invalidate the previous account's
      // private observers before publishing the next fan-session namespace.
      clearPrivateAccountQueries(client);
      resetAttention();

      // The authenticated route deliberately does not own another auth-state
      // subscription. Reconcile its cached identity from this single global
      // subscriber so remote revocation/sign-out cannot leave a protected shell
      // showing stale identity until an incidental React Query refetch.
      if (nextUserId === null) {
        client.setQueryData(["authenticated-identity-gate"], null);
      } else if (priorUserId !== undefined) {
        void client.invalidateQueries({ queryKey: ["authenticated-identity-gate"] });
      }
    }
    client.setQueryData(["fan-session"], user ?? null);
  };
}
