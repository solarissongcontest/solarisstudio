import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useSyncExternalStore } from "react";

import { supabase } from "@/integrations/supabase/client";
import {
  SSC_RULEBOOK,
  applyPublishedRulebookRelease,
  getRuleById,
  type RulebookRelease,
} from "@/lib/ssc-rules/index";

export type {
  RulebookChange,
  RulebookChangeKind,
  RulebookRelease,
  RuleSnapshot,
} from "@/lib/ssc-rules/runtime-overlay";
export {
  applyPublishedRulebookRelease,
  buildRuleSnapshot,
} from "@/lib/ssc-rules/runtime-overlay";

export async function fetchCurrentRulebookRelease(): Promise<RulebookRelease | null> {
  const { data, error } = await (supabase as any).rpc("public_current_rulebook_release");
  if (error) throw new Error(error.message);
  if (!data || typeof data !== "object") return null;
  return data as RulebookRelease;
}

export async function fetchRulebookReleaseHistory(): Promise<RulebookRelease[]> {
  const { data, error } = await (supabase as any).rpc("public_rulebook_release_history");
  if (error) throw new Error(error.message);
  return Array.isArray(data) ? (data as RulebookRelease[]) : [];
}

export async function fetchAdminRulebookReleases(): Promise<RulebookRelease[]> {
  const { data, error } = await (supabase as any).rpc("admin_rulebook_releases");
  if (error) throw new Error(error.message);
  return Array.isArray(data) ? (data as RulebookRelease[]) : [];
}

const subscribeToHydration = () => () => undefined;
const getClientHydrationSnapshot = () => true;
const getServerHydrationSnapshot = () => false;

export function usePublishedRulebook() {
  // The public Supabase client can resolve before React reaches this subtree in
  // the browser, while SSR deliberately renders the bundled rulebook. Defer the
  // query until after hydration so the server and first client snapshots are
  // identical; React then refreshes the live release immediately after commit.
  const hydrated = useSyncExternalStore(
    subscribeToHydration,
    getClientHydrationSnapshot,
    getServerHydrationSnapshot,
  );
  const query = useQuery({
    queryKey: ["public-rulebook-release"],
    queryFn: async () => {
      const release = await fetchCurrentRulebookRelease();
      return release;
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
    enabled: hydrated,
  });

  useEffect(() => {
    if (!hydrated) return;
    // Apply the immutable overlay only after the first client snapshot is
    // hydrated. This keeps sibling Rules consumers on the bundled baseline
    // during hydration, even when a cached query is already available.
    applyPublishedRulebookRelease(query.data ?? null);
  }, [hydrated, query.data]);

  const data = hydrated ? query.data : undefined;

  return {
    ...query,
    data,
    version: data?.version ?? SSC_RULEBOOK.version,
  };
}

export function useRulebookReleaseHistory() {
  return useQuery({
    queryKey: ["public-rulebook-release-history"],
    queryFn: fetchRulebookReleaseHistory,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}

export function useRuntimeRule(ruleId: string) {
  const release = usePublishedRulebook();
  return useMemo(
    () => ({ release, rule: getRuleById(ruleId) }),
    [release.data, release.version, ruleId],
  );
}
