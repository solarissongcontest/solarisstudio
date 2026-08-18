import { useRouterState } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";

import { editionLabel, useEditions } from "@/lib/data";
import { useAdminContext } from "./AdminContext";

export function AdminSelectors() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { editionId, setEditionId } = useAdminContext();
  const { data: editions = [] } = useEditions();

  const orderedEditions = useMemo(
    () => [...editions].sort((a, b) => (b.edition_number ?? -1) - (a.edition_number ?? -1)),
    [editions],
  );

  const routeEdition = orderedEditions.find((edition) =>
    pathname === `/admin/${edition.slug}` ||
    pathname.startsWith(`/admin/design/${edition.slug}`) ||
    pathname.startsWith(`/admin/edition-theme/${edition.slug}`),
  ) ?? null;
  const savedEdition = orderedEditions.find((edition) => edition.id === editionId) ?? null;
  const activeEdition = routeEdition ?? savedEdition ?? orderedEditions[0] ?? null;

  useEffect(() => {
    if (activeEdition && activeEdition.id !== editionId) setEditionId(activeEdition.id);
  }, [activeEdition, editionId, setEditionId]);

  const changeEdition = (nextId: string) => {
    const nextEdition = orderedEditions.find((edition) => edition.id === nextId);
    if (!nextEdition) return;
    setEditionId(nextEdition.id);

    if (routeEdition) {
      window.location.assign(`/admin/${nextEdition.slug}`);
    }
  };

  return (
    <div className="flex min-w-0 items-center justify-end sm:justify-start">
      <label className="sr-only" htmlFor="admin-edition-context">Active edition</label>
      <select
        id="admin-edition-context"
        className="min-h-10 max-w-[9.5rem] rounded-xl border border-white/[0.08] bg-white/[0.035] px-2.5 text-xs font-bold text-foreground outline-none focus:border-sky-200/25 sm:max-w-[15rem]"
        value={activeEdition?.id ?? ""}
        onChange={(event) => changeEdition(event.target.value)}
      >
        {!orderedEditions.length ? <option value="">No editions</option> : null}
        {orderedEditions.map((edition) => (
          <option key={edition.id} value={edition.id}>
            {editionLabel(edition)}{edition === activeEdition ? "" : ` · ${edition.name}`}
          </option>
        ))}
      </select>
    </div>
  );
}
