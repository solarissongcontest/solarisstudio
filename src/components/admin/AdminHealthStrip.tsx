import { useMemo } from "react";

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
    return editionId
      ? ordered.find((item) => item.id === editionId) ?? null
      : ordered[0] ?? null;
  }, [editions, editionId]);

  const { data: shows = [], isLoading: showsLoading } = useShows(edition?.id);
  const { data: readinessData, isLoading: readinessLoading } = useAdminReadinessData(edition?.id);

  const readiness =
    edition && readinessData
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

  if (!edition || showsLoading || readinessLoading || !readiness) return null;

  const status = readiness.status;
  const progress = readiness.progress;
  const issueCount = readiness.issues.length;
  const firstIssue = readiness.issues[0]?.title ?? null;

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
