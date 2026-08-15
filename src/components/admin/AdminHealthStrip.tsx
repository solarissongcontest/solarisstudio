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
    return ordered.find((item) => item.id === editionId) ?? ordered[0] ?? null;
  }, [editions, editionId]);

  const { data: shows = [] } = useShows(edition?.id);
  const { data: readinessData, isLoading } = useAdminReadinessData(edition?.id);

  if (!edition || isLoading || !readinessData) return null;

  const readiness = buildEditionReadiness({
    edition,
    shows,
    participants: readinessData.participants,
    voters: readinessData.voters,
    juryVotes: readinessData.juryVotes,
    televotes: readinessData.televotes,
    results: readinessData.results,
  });

  return (
    <div className="border-t border-border/45 bg-surface/35 px-3 py-2 text-xs sm:px-5">
      <div className="flex min-w-0 items-center gap-2">
        <span
          className={cn(
            "h-2 w-2 shrink-0 rounded-full",
            readiness.status === "ready"
              ? "bg-emerald-400"
              : readiness.status === "blocked"
                ? "bg-red-400"
                : "bg-amber-300",
          )}
        />
        <span
          className={cn(
            "shrink-0 font-bold",
            readiness.status === "blocked" && "text-red-300",
          )}
        >
          {readiness.issues.length
            ? `${readiness.issues.length} things need attention`
            : "Ready"}
        </span>
        {readiness.issues[0] && (
          <span className="truncate text-muted-foreground">
            {readiness.issues[0].title}
          </span>
        )}
        <span className="ml-auto shrink-0 text-[10px] font-semibold text-muted-foreground">
          {readiness.progress}% ready
        </span>
      </div>
    </div>
  );
}
