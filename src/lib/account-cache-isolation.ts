import type { QueryClient } from "@tanstack/react-query";

type AccountUser = { id: string } | null | undefined;

export function isPrivateAccountQuery(key: readonly unknown[]) {
  const root = String(key[0] ?? "");
  return /^(edition-selection|user-prefs|user-country-ownership|mysolaris-|my-solaris-|my-country-|owned-|country-confirmation-|country-jury-|home-personal-attention|participate-jury-|participate-confirmation-access|admin-|studio2-|organisation-backend-contract)/.test(
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
