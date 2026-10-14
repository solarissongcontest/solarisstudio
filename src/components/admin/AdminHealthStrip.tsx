import { useV3OrganizerProjection } from "@/lib/v3-organizer-projection.query";
import { cn } from "@/lib/utils";
import { useAdminContext } from "./AdminContext";

export function AdminHealthStrip() {
  const { editionId } = useAdminContext();
  const projectionQuery = useV3OrganizerProjection(editionId || null);
  const projection = projectionQuery.data ?? null;

  if (!editionId || projectionQuery.isLoading || projectionQuery.error || !projection) return null;

  const readiness = projection.readiness;
  const blocking = readiness.blocking.length;
  const incomplete = readiness.incomplete.length;
  const issueCount = blocking + incomplete;
  const status = blocking > 0 ? "blocked" : incomplete > 0 ? "attention" : "ready";
  const firstIssue = readiness.blocking[0]?.label ?? readiness.incomplete[0]?.label ?? null;

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
          {readiness.overall}% ready
        </span>
      </div>
    </div>
  );
}
