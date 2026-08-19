import { useMemo } from "react";

import { useAdminHealthSummary } from "@/lib/admin-health-summary";
import { buildEditionReadiness } from "@/lib/admin-readiness";
import { useAdminReadinessData } from "@/lib/admin-readiness-data";
import { useEditions, useShows } from "@/lib/data";
import { cn } from "@/lib/utils";
import { useAdminContext } from "./AdminContext";

export function AdminHealthStrip() {
  const { editionId } = useAdminContext();
  const { data: editions = [] } = useEditions();

  const edition = useMemo(() => {
    const ordered = [...editions].sort(
      (a, b) => (b.edition_number ?? -1) - (a.edition_number ?? -1),
    );
    return ordered.find((item) => item.id === editionId) ?? ordered[0] ?? null;
  }, [editions, editionId]);

  const {
    data: serverSummary,
    isLoading: serverLoading,
    isFetched: serverFetched,
  } = useAdminHealthSummary(edition?.id);

  // Older Lovable databases do not have the compact summary RPC yet. Only in
  // that case do we fall back to fetching the selected edition's raw readiness
  // rows. Once the migration exists, ordinary admin pages never download those
  // large datasets just to draw this strip.
  const needsFallback = serverFetched && serverSummary == null;
  const { data: shows = [] } = useShows(needsFallback ? edition?.id : undefined);
  const { data: readinessData, isLoading: fallbackLoading } = useAdminReadinessData(
    needsFallback ? edition?.id : undefined,
  );

  if (!edition || serverLoading) return null;

  const fallbackReadiness =
    needsFallback && readinessData
      ? buildEditionReadiness({
          edition,
          shows,
          participants: readinessData.participants,
          voters: readinessData.voters,
          juryVotes: readinessData.juryVotes,
          juryBallotStatuses: readinessData.juryBallotStatuses,
          televotes: readinessData.televotes,
          results: readinessData.results,
        })
      : null;

  if (needsFallback && (fallbackLoading || !fallbackReadiness)) return null;

  const status = serverSummary?.status ?? fallbackReadiness?.status ?? "ready";
  const progress = serverSummary?.progress ?? fallbackReadiness?.progress ?? 100;
  const issueCount = serverSummary?.issues_count ?? fallbackReadiness?.issues.length ?? 0;
  const firstIssue = serverSummary?.first_issue ?? fallbackReadiness?.issues[0]?.title ?? null;

  return (
    <div className="border-t border-border/45 bg-surface/35 px-3 py-2 text-xs sm:px-5">
      <div className="flex min-w-0 items-center gap-2">
        <span
          className={cn(
            "h-2 w-2 shrink-0 rounded-full",
            status === "ready"
              ? "bg-emerald-400"
              : status === "blocked"
                ? "bg-red-400"
                : "bg-amber-300",
          )}
        />
        <span className={cn("shrink-0 font-bold", status === "blocked" && "text-red-300")}>
          {issueCount ? `${issueCount} things need attention` : "Ready"}
        </span>
        {firstIssue && <span className="truncate text-muted-foreground">{firstIssue}</span>}
        <span className="ml-auto shrink-0 text-[10px] font-semibold text-muted-foreground">
          {progress}% ready
        </span>
      </div>
    </div>
  );
}
