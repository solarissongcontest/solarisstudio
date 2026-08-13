import { useEffect } from "react";
import { useAllShows, useEditions } from "@/lib/data";
import { useAdminContext } from "./AdminContext";

export function AdminSelectors() {
  const { editionId, showId, setEditionId, setShowId } = useAdminContext();
  const { data: editions = [] } = useEditions();
  const { data: shows = [] } = useAllShows();
  const editionShows = shows.filter((show) => show.edition_id === editionId).sort((a, b) => a.sort_order - b.sort_order);

  useEffect(() => { if (!editionId && editions[0]) setEditionId(editions[0].id); }, [editionId, editions, setEditionId]);
  useEffect(() => { if (editionId && !editionShows.some((show) => show.id === showId)) setShowId(editionShows[0]?.id ?? ""); }, [editionId, showId, editionShows, setShowId]);

  const cls = "min-h-9 rounded-lg border border-border bg-surface px-2 text-xs";
  return <div className="flex min-w-0 gap-2"><select className={cls} value={editionId} onChange={(e) => setEditionId(e.target.value)}>{editions.map((e) => <option key={e.id} value={e.id}>{e.edition_number ? `SSC ${e.edition_number}` : e.name}</option>)}</select><select className={cls} value={showId} onChange={(e) => setShowId(e.target.value)}><option value="">Edition overview</option>{editionShows.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>;
}
