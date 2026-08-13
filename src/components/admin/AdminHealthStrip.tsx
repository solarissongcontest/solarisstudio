import { useAllParticipants } from "@/lib/data";
import { entryReadiness } from "@/lib/admin-readiness";
import { useAdminContext } from "./AdminContext";

export function AdminHealthStrip() {
  const { editionId, showId } = useAdminContext();
  const { data = [] } = useAllParticipants();
  const entries = data.filter((row) => row.edition_id === editionId && (!showId || row.show_id === showId));
  const issues = entryReadiness(entries);
  return <div className="border-b border-border bg-surface/60 px-3 py-2 text-xs"><span className="font-semibold">{issues.length ? `${issues.length} things need attention` : "Entry data ready"}</span>{issues[0] && <span className="ml-2 text-muted-foreground">{issues[0].title}</span>}</div>;
}
