import { useNavigate, useRouterState } from "@tanstack/react-router";
import { Check, ChevronDown, Trophy } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { editionLabel, useEditions } from "@/lib/data";
import { AdminSheet } from "./AdminUI";
import { useAdminContext } from "./AdminContext";

export function AdminSelectors() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const navigate = useNavigate();
  const { editionId, setEditionId } = useAdminContext();
  const { data: editions = [] } = useEditions();
  const [open, setOpen] = useState(false);

  const orderedEditions = useMemo(
    () => [...editions].sort((a, b) => (b.edition_number ?? -1) - (a.edition_number ?? -1)),
    [editions],
  );

  const routeEdition =
    orderedEditions.find(
      (edition) =>
        pathname === `/admin/${edition.slug}` ||
        pathname.startsWith(`/admin/design/${edition.slug}`) ||
        pathname.startsWith(`/admin/edition-theme/${edition.slug}`) ||
        pathname.startsWith(`/admin/shows/${edition.slug}`) ||
        pathname.startsWith(`/admin/entries/${edition.slug}`) ||
        pathname.startsWith(`/admin/jury/${edition.slug}`) ||
        pathname.startsWith(`/admin/televote/${edition.slug}`) ||
        pathname.startsWith(`/admin/voting-system/${edition.slug}`) ||
        pathname.startsWith(`/admin/publication/${edition.slug}`),
    ) ?? null;
  const savedEdition = orderedEditions.find((edition) => edition.id === editionId) ?? null;
  const activeEdition = routeEdition ?? savedEdition ?? orderedEditions[0] ?? null;

  useEffect(() => {
    if (activeEdition && activeEdition.id !== editionId) setEditionId(activeEdition.id);
  }, [activeEdition, editionId, setEditionId]);

  const changeEdition = async (nextId: string) => {
    const nextEdition = orderedEditions.find((edition) => edition.id === nextId);
    if (!nextEdition) return;

    setEditionId(nextEdition.id);
    setOpen(false);

    if (!routeEdition) return;

    if (pathname.startsWith("/admin/design/")) {
      await navigate({ to: "/admin/design/$slug", params: { slug: nextEdition.slug } });
      return;
    }

    if (pathname.startsWith("/admin/edition-theme/")) {
      await navigate({ to: "/admin/edition-theme/$slug", params: { slug: nextEdition.slug } });
      return;
    }

    if (pathname.startsWith("/admin/shows/")) {
      await navigate({ to: "/admin/shows/$slug", params: { slug: nextEdition.slug } });
      return;
    }

    if (pathname.startsWith("/admin/entries/")) {
      await navigate({ to: "/admin/entries/$slug", params: { slug: nextEdition.slug }, search: {} });
      return;
    }

    if (pathname.startsWith("/admin/jury/")) {
      await navigate({ to: "/admin/jury/$slug", params: { slug: nextEdition.slug }, search: {} });
      return;
    }

    if (pathname.startsWith("/admin/televote/")) {
      await navigate({ to: "/admin/televote/$slug", params: { slug: nextEdition.slug } });
      return;
    }

    if (pathname.startsWith("/admin/voting-system/")) {
      await navigate({ to: "/admin/voting-system/$slug", params: { slug: nextEdition.slug } });
      return;
    }

    if (pathname.startsWith("/admin/publication/")) {
      await navigate({ to: "/admin/publication/$slug", params: { slug: nextEdition.slug } });
      return;
    }

    await navigate({ to: "/admin/$slug", params: { slug: nextEdition.slug } });
  };

  return (
    <>
      <div className="flex min-w-0 items-center justify-end sm:justify-start">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex min-h-10 max-w-[10rem] min-w-0 items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.035] px-2.5 text-left transition hover:bg-white/[0.055] sm:max-w-[16rem]"
          aria-haspopup="dialog"
          aria-expanded={open}
        >
          <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-sky-200/[0.07] text-sky-100">
            <Trophy className="size-3.5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[10px] font-semibold text-muted-foreground">Edition</span>
            <span className="block truncate text-xs font-bold text-foreground">
              {activeEdition ? editionLabel(activeEdition) : "Choose edition"}
            </span>
          </span>
          <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
        </button>
      </div>

      <AdminSheet
        open={open}
        onClose={() => setOpen(false)}
        title="Switch edition"
        description="The selected edition stays active across the organizer workspace."
      >
        <div className="space-y-2">
          {orderedEditions.map((edition) => {
            const active = edition.id === activeEdition?.id;
            return (
              <button
                key={edition.id}
                type="button"
                onClick={() => void changeEdition(edition.id)}
                className={`flex w-full min-w-0 items-center gap-3 rounded-xl border p-3 text-left transition ${
                  active
                    ? "border-sky-200/20 bg-sky-200/[0.08]"
                    : "border-white/[0.07] bg-white/[0.02] hover:bg-white/[0.04]"
                }`}
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-white/[0.07] bg-white/[0.03] text-xs font-bold text-muted-foreground">
                  {edition.edition_number ?? "?"}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-foreground">{editionLabel(edition)}</span>
                  <span className="mt-1 block truncate text-xs text-muted-foreground">{edition.name}</span>
                </span>
                {active ? <Check className="size-4 shrink-0 text-sky-100" /> : null}
              </button>
            );
          })}

          {!orderedEditions.length ? (
            <div className="rounded-xl border border-dashed border-white/[0.1] p-5 text-center text-sm text-muted-foreground">
              No editions exist yet.
            </div>
          ) : null}
        </div>
      </AdminSheet>
    </>
  );
}
