import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell, PageHeader } from "@/components/AppShell";
import { editionLabel, useAllShows, useEditions } from "@/lib/data";

export const Route = createFileRoute("/editions/")({
  head: () => ({
    meta: [
      { title: "Editions — Solaris Spectacle Suite" },
      {
        name: "description",
        content: "Every Solaris Song Contest edition with its semi-finals, grand finals and special shows.",
      },
      { property: "og:title", content: "SSC editions" },
      { property: "og:description", content: "Browse all Solaris Song Contest editions and shows." },
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
        title="Contest editions"
        description="Each edition is a container of shows. Unpublished editions and shows stay hidden from the public."
      />
      {isLoading && <p className="text-sm text-muted-foreground">Loading editions…</p>}
      {!isLoading && !editions?.length && (
        <p className="text-sm text-muted-foreground">No editions yet — create one in the Studio.</p>
      )}
      <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
        {(editions ?? []).map((e) => {
          const es = (shows ?? []).filter((s) => s.edition_id === e.id);
          return (
            <Link
              key={e.id}
              to="/editions/$slug"
              params={{ slug: e.slug }}
              className="glass group min-w-0 p-3 transition-transform hover:-translate-y-0.5 sm:p-5"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-display text-xl font-bold sm:text-2xl">{editionLabel(e)}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{e.name}</p>
                </div>
                <span
                  className={
                    e.published
                      ? "rounded-full bg-surface-strong px-2 py-0.5 text-[10px] uppercase tracking-wider text-primary"
                      : "rounded-full bg-surface px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground"
                  }
                >
                  {e.published ? "Public" : "Private"}
                </span>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                {[e.host_city, e.year ? String(e.year) : null].filter(Boolean).join(" · ") || "Host to be announced"}
              </p>
              <p className="mt-3 text-xs text-muted-foreground">
                {es.length} show{es.length === 1 ? "" : "s"} · {es.filter((s) => s.published).length} published
              </p>
            </Link>
          );
        })}
      </div>
    </AppShell>
  );
}
