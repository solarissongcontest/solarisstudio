import type { QueryClient } from "@tanstack/react-query";

export function isPrivateAccountQuery(key: readonly unknown[]) {
  const root = String(key[0] ?? "");
  return /^(mysolaris-|my-solaris-|my-country-|country-confirmation-|country-jury-|home-personal-attention|participate-jury-|participate-confirmation-access|admin-|studio2-|organisation-backend-contract)/.test(root);
}

export function clearPrivateAccountQueries(client: QueryClient) {
  const filter = { predicate: (query: { queryKey: readonly unknown[] }) => isPrivateAccountQuery(query.queryKey) };
  // cancelQueries cancels retryers synchronously, before its promise resolves.
  void client.cancelQueries(filter);
  client.removeQueries(filter);
}
