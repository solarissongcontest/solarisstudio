import { createFileRoute, Link } from "@tanstack/react-router";

import { AppShell, PageHeader } from "@/components/AppShell";
import { editionLabel, useAllShows, useEditions } from "@/lib/data";

export const Route = createFileRoute("/editions/")({
  head: () => ({
    meta: [
      { title: "Editions — Solaris Studio" },
      {
        name: "description",
        content: "Browse every Solaris Song Contest edition.",
      },
    ],
  }),
  component: EditionsPage,
});

function EditionsPage() {
  const { data: editions, isLoading } = useEditions();
  const { data: shows } = useAllShows();

  return (
    <AppShell>
      <PageHeader
        eyebrow="Archive"
        title="Editions"
        description="One clean archive of every Solaris Song Contest edition."
      />

      {isLoading && <p className="text-sm text-muted-foreground">Loading editions…</p>}

      {!isLoading && !(editions ?? []).length && (
        <div className="glass p-6 text-sm text-muted-foreground">No editions yet.</div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {(editions ?? []).map((edition) => {
          const editionShows = (shows ?? []).filter(
            (show) => show.edition_id === edition.id,
          );

          return (
            <Link
              key={edition.id}
              to="/editions/$slug"
              params={{ slug: edition.slug }}
              className="glass group block p-4 transition-transform hover:-translate-y-0.5 sm:p-5"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-display text-2xl font-bold">{editionLabel(edition)}</p>
                  <h2 className="mt-1 truncate text-sm text-muted-foreground">{edition.name}</h2>
                </div>
                <span className="text-xs text-primary">→</span>
              </div>

              <div className="mt-5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span>{edition.host_city ?? "Host TBC"}</span>
                {edition.year && <span>{edition.year}</span>}
                <span>{editionShows.length} show{editionShows.length === 1 ? "" : "s"}</span>
              </div>
            </Link>
          );
        })}
      </div>
    </AppShell>
  );
}
