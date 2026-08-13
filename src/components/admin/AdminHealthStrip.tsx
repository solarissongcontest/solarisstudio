import { useAllParticipants, useAllResults } from "@/lib/data";
import { entryReadiness, resultReadiness } from "@/lib/admin-readiness";
import { useAdminContext } from "./AdminContext";

export function AdminHealthStrip() {
  const { editionId, showId } = useAdminContext();
  const { data: entries = [] } = useAllParticipants();
  const { data: results = [] } = useAllResults();
  const p = entries.filter((row) => row.edition_id === editionId && (!showId || row.show_id === showId));
  const r = results.filter((row) => !showId || row.show_id === showId);
  const issues = [...entryReadiness(p), ...resultReadiness(r)];
  const critical = issues.some((item) => item.level === "critical");
  return <div className="border-b border-border bg-surface/60 px-3 py-2 text-xs"><span className={critical ? "font-bold text-destructive" : "font-semibold"}>{issues.length ? `${issues.length} things need attention` : "Ready"}</span>{issues[0] && <span className="ml-2 text-muted-foreground">{issues[0].title}</span>}</div>;
}
