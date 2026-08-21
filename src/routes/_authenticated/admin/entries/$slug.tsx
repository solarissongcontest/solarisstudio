import { createFileRoute } from "@tanstack/react-router";

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
  return <ShowLineupWorkspace slug={slug} initialShow={search.show} />;
}
