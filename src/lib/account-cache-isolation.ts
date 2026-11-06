import type { QueryClient } from "@tanstack/react-query";

type AccountUser = { id: string } | null | undefined;

// Server authorization remains mandatory. This is a defense-in-depth cleanup
// for confidential Jury/Televote evidence that may have used legacy query keys.
const PRIVATE_VOTING_QUERY_ROOTS = new Set([
  "voters",
  "jury_votes",
  "jury_ballot_statuses",
  "jury_ballot_submissions",
  "integrity-human-moderation",
  "televoting-result-integrity",
]);

export function isPrivateAccountQuery(key: readonly unknown[]) {
  const root = String(key[0] ?? "");
  if (PRIVATE_VOTING_QUERY_ROOTS.has(root)) return true;
  if (/^(merged-televoting-|merged-combined-|merged-integrity-|v3-organizer-)/.test(root)) return true;
  return /^(edition-selection|user-prefs|user-country-ownership|mysolaris-|my-solaris-|my-country-|owned-|country-confirmation-|country-jury-|home-personal-attention|participate-jury-|participate-confirmation-access|admin-|studio2-|organisation-backend-contract|v3-rollout-probe|v3-primary-surface-bundle)/.test(
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