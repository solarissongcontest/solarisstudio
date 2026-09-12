import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

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

export function usePublishedRulebook() {
  const query = useQuery({
    queryKey: ["public-rulebook-release"],
    queryFn: async () => {
      const release = await fetchCurrentRulebookRelease();
      // Apply the immutable overlay before React Query publishes `data` to
      // subscribers. Otherwise sibling rule components can render one frame of
      // bundled v4 text after the query has already resolved.
      applyPublishedRulebookRelease(release);
      return release;
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  return {
    ...query,
    version: query.data?.version ?? SSC_RULEBOOK.version,
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
