import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";

import { HeatProgressionSyncPanel } from "@/components/admin/HeatProgressionSyncPanel";
import { ShowLineupWorkspace } from "@/components/admin/ShowLineupWorkspace";

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

  // `show` is only an entry point. ShowLineupWorkspace already seeds its local
  // state from it, so leaving the query parameter in the URL would make the
  // workspace effect keep forcing the user back to that show after every
  // selector click. Consume it once, then release the selector.
  useEffect(() => {
    if (!search.show) return;
    void navigate({ search: { show: undefined }, replace: true });
  }, [navigate, search.show]);

  return (
    <div className="space-y-4 sm:space-y-5">
      <HeatProgressionSyncPanel slug={slug} />
      <ShowLineupWorkspace slug={slug} initialShow={search.show} />
    </div>
  );
}
