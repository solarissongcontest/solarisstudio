import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";

import { HeatProgressionSyncPanel } from "@/components/admin/HeatProgressionSyncPanel";
import { ShowLineupWorkspace } from "@/components/admin/ShowLineupWorkspace";
import { useEdition, useShows } from "@/lib/data";

type EntriesSearch = { show?: string };

export const Route = createFileRoute("/_authenticated/admin/entries/$slug")({
  head: () => ({
    meta: [
      { title: "Line-up, allocation & running order — Solaris Studio" },
      { name: "robots", content: "noindex" },
    ],
  }),
  validateSearch: (search: Record<string, unknown>): EntriesSearch => ({
    show: typeof search.show === "string" && search.show ? search.show : undefined,
  }),
  component: EntriesRoute,
});

function EntriesRoute() {
  const { slug } = Route.useParams();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const { data: edition, isSuccess: editionResolved } = useEdition(slug);
  const { isSuccess: showsResolved } = useShows(edition?.id);
  const canConsumeRequestedShow = editionResolved && (!edition?.id || showsResolved);

  // `show` is only an entry point, but it must remain available until the
  // async show list has resolved. Consuming it earlier lets the workspace lose
  // the requested show while its loading state is still active.
  useEffect(() => {
    if (!search.show || !canConsumeRequestedShow) return;
    void navigate({ search: { show: undefined }, replace: true });
  }, [canConsumeRequestedShow, navigate, search.show]);

  return (
    <div className="space-y-4 sm:space-y-5">
      <HeatProgressionSyncPanel slug={slug} />
      <ShowLineupWorkspace slug={slug} initialShow={search.show} />
    </div>
  );
}
