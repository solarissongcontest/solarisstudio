import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

export type AdminHealthSummary = {
  status: "ready" | "needs-attention" | "blocked";
  progress: number;
  issues_count: number;
  critical_count: number;
  first_issue: string | null;
  show_count: number;
  entry_count: number;
  missing_songs: number;
  missing_artists: number;
  running_issues: number;
  jury_issues: number;
  televote_issues: number;
  result_issues: number;
};

function missingRpc(error: unknown) {
  const text = String((error as { message?: string })?.message ?? error ?? "").toLowerCase();
  return (
    text.includes("could not find the function") ||
    text.includes("schema cache") ||
    text.includes("does not exist") ||
    text.includes("pgrst202")
  );
}

/**
 * Prefer the compact server-side health calculation when the database has the
 * Control Room RPC. Older Lovable databases can keep running: a missing RPC is
 * returned as null so callers can fall back to the client-side readiness loader.
 */
export function useAdminHealthSummary(editionId?: string | null) {
  return useQuery({
    enabled: !!editionId,
    queryKey: ["admin-health-summary", editionId ?? "pending"],
    queryFn: async (): Promise<AdminHealthSummary | null> => {
      if (!editionId) return null;

      const { data, error } = await (supabase as any).rpc(
        "admin_edition_health_summary",
        { _edition_id: editionId },
      );

      if (error) {
        if (missingRpc(error)) return null;
        throw error;
      }

      return (data ?? null) as AdminHealthSummary | null;
    },
    staleTime: 20_000,
    gcTime: 5 * 60 * 1000,
    retry: false,
  });
}
