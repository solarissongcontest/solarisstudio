import { useRouterState } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";

import { editionLabel, useEditions } from "@/lib/data";
import { useAdminContext } from "./AdminContext";

export function AdminSelectors() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { editionId, setEditionId, setShowId } = useAdminContext();
  const { data: editions = [] } = useEditions();

  const orderedEditions = useMemo(
    () => [...editions].sort((a, b) => (b.edition_number ?? -1) - (a.edition_number ?? -1)),
    [editions],
  );

  const routeEdition = orderedEditions.find((edition) => pathname === `/admin/${edition.slug}`) ?? null;
  const savedEdition = orderedEditions.find((edition) => edition.id === editionId) ?? null;
  const activeEdition = routeEdition ?? savedEdition ?? orderedEditions[0] ?? null;

  useEffect(() => {
    if (activeEdition && activeEdition.id !== editionId) setEditionId(activeEdition.id);
  }, [activeEdition, editionId, setEditionId]);

  const changeEdition = (nextId: string) => {
    const nextEdition = orderedEditions.find((edition) => edition.id === nextId);
    if (!nextEdition) return;

    setEditionId(nextEdition.id);
    setShowId("");

    if (routeEdition) window.location.href = `/admin/${nextEdition.slug}`;
  };

  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="hidden text-[9px] font-black uppercase tracking-[0.16em] text-muted-foreground sm:inline">Edition</span>
      <select
        className="min-h-9 max-w-[13rem] rounded-lg border border-border bg-surface px-2 text-xs font-semibold outline-none sm:max-w-[18rem]"
        value={activeEdition?.id ?? ""}
        onChange={(event) => changeEdition(event.target.value)}
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
