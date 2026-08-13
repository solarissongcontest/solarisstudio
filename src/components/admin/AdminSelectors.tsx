import { useEffect, useMemo } from "react";

import { editionLabel, useEditions } from "@/lib/data";
import { useAdminContext } from "./AdminContext";

export function AdminSelectors() {
  const { editionId, setEditionId } = useAdminContext();
  const { data: editions = [] } = useEditions();

  const orderedEditions = useMemo(
    () =>
      [...editions].sort(
        (a, b) => (b.edition_number ?? -1) - (a.edition_number ?? -1),
      ),
    [editions],
  );

  useEffect(() => {
    if (!orderedEditions.length) return;

    const stillExists = orderedEditions.some((edition) => edition.id === editionId);
    if (!stillExists) setEditionId(orderedEditions[0].id);
  }, [editionId, orderedEditions, setEditionId]);

  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="hidden text-[9px] font-black uppercase tracking-[0.16em] text-muted-foreground sm:inline">
        Edition
      </span>
      <select
        className="min-h-9 max-w-[13rem] rounded-lg border border-border bg-surface px-2 text-xs font-semibold sm:max-w-[18rem]"
        value={editionId}
        onChange={(event) => setEditionId(event.target.value)}
        aria-label="Active admin edition"
      >
        {orderedEditions.map((edition) => (
          <option key={edition.id} value={edition.id}>
            {editionLabel(edition)} · {edition.name}
          </option>
        ))}
      </select>
    </div>
  );
}
