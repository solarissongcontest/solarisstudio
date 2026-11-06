import { useMyCountryAccount } from "@/lib/country-account";
import { useFanSession } from "@/lib/prediction-data";
import { resolveOwnedHistoryScope } from "@/lib/owned-history-scope";

/**
 * Reuse the existing session and country-account queries. Do not enable
 * private history reads until both have independently established the same
 * current viewer and country.
 */
export function useOwnedHistoryScope(expectedViewerId?: string) {
  const session = useFanSession();
  const account = useMyCountryAccount();
  return resolveOwnedHistoryScope(session.data?.id, account.data, expectedViewerId);
}
