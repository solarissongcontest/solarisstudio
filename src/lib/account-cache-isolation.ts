import type { QueryClient } from "@tanstack/react-query";

type AccountUser = { id: string } | null | undefined;

export function isPrivateAccountQuery(key: readonly unknown[]) {
  const root = String(key[0] ?? "");
  return /^(authenticated-identity-gate$|organizer-access-gate$|permission-engine-|edition-selection|user-prefs|user-country-ownership|mysolaris-|my-solaris-|my-country-|owned-|country-confirmation-|country-jury-|home-personal-attention|participate-jury-|participate-confirmation-access|admin-|studio2-|organisation-backend-contract|v3-rollout-probe|v3-primary-surface-bundle)/.test(
    root,
  );
}

function isAuthorizationQuery(key: readonly unknown[]) {
  return key[0] === "authenticated-identity-gate" || key[0] === "organizer-access-gate";
}

export function clearPrivateAccountQueries(client: QueryClient) {
  const filter = {
    predicate: (query: { queryKey: readonly unknown[] }) => isPrivateAccountQuery(query.queryKey),
  };
  // cancelQueries cancels retryers synchronously, before its promise resolves.
  void client.cancelQueries(filter);
  // Removing a mounted query leaves its observer holding the old result.
  // Reset authorization evidence so mounted gates synchronously close and
  // reverify against the new session instead of retaining an old identity/grant.
  void client.resetQueries({
    predicate: (query) => isAuthorizationQuery(query.queryKey),
  });
  client.removeQueries({
    predicate: (query) =>
      isPrivateAccountQuery(query.queryKey) && !isAuthorizationQuery(query.queryKey),
  });
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
