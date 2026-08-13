import { useAllParticipants } from "@/lib/data";
import { entryReadiness } from "@/lib/admin-readiness";
import { useAdminContext } from "./AdminContext";

export function AdminEntryHealth() {
  const { editionId, showId } = useAdminContext();
  const { data = [] } = useAllParticipants();
  const rows = data.filter((x) => x.edition_id === editionId && (!showId || x.show_id === showId));
  const issues = entryReadiness(rows);
  return <section className="rounded-xl border border-border p-4"><p className="text-[10px] font-black uppercase tracking-[.18em] text-muted-foreground">Entries</p><h3 className="mt-1 font-display text-lg font-black">{issues.length ? "Needs attention" : "Ready"}</h3><p className="mt-1 text-xs text-muted-foreground">{rows.length} entries · {issues.length} open checks</p><div className="mt-3 space-y-2">{issues.map((i) => <div key={i.id} className="rounded-lg bg-surface p-2 text-xs"><b>{i.title}</b><div className="text-muted-foreground">{i.detail}</div></div>)}</div></section>;
}
