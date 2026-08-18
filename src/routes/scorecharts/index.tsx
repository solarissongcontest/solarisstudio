import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";

import { AppShell, PageHeader, Panel } from "@/components/AppShell";
import { editionLabel, useAllShows, useEditions } from "@/lib/data";
import { isShowPublic, resolveShowPublication } from "@/lib/publication";

export const Route = createFileRoute("/scorecharts/")({
  head: () => ({
    meta: [
      { title: "Full Scorecharts — Solaris Studio" },
      {
        name: "description",
        content: "Browse published SSC voting scorecharts with detailed jury voting.",
      },
    ],
  }),
  component: ScorechartsPage,
});

function ScorechartsPage() {
  const { data: editions } = useEditions();
  const { data: shows } = useAllShows();

  const editionMap = useMemo(
    () => new Map((editions ?? []).map((edition) => [edition.id, edition])),
    [editions],
  );

  const scorechartShows = useMemo(
    () =>
      (shows ?? [])
        .filter((show) => isShowPublic(show) && resolveShowPublication(show).detailed_voting)
        .sort((a, b) => {
          const editionA = editionMap.get(a.edition_id)?.edition_number ?? -1;
          const editionB = editionMap.get(b.edition_id)?.edition_number ?? -1;
          return editionB - editionA || a.sort_order - b.sort_order;
        }),
    [shows, editionMap],
  );

  return (
    <AppShell>
      <PageHeader
        eyebrow="Detailed voting"
        title="Full Scorecharts"
        description="Open the complete jury voting matrix for any published show where detailed voting is available. Rows receive points and columns give them."
        actions={
          <Link
            to="/editions"
            className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-center text-sm sm:w-auto"
          >
            Browse editions →
          </Link>
        }
      />

      <Panel
        className="mb-5"
        title="How to read a scorechart"
        description="The matrix keeps the whole vote visible instead of hiding it behind one country's total."
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <Guide number="01" title="Rows receive" text="Find an entry down the left side to follow all points it received." />
          <Guide number="02" title="Columns give" text="Follow a voter across the top to see how it distributed its points." />
          <Guide number="03" title="Open a show" text="The scorechart opens inside that show's results page, next to the other result views." />
        </div>
      </Panel>

      <section>
        <div className="mb-3 flex items-end justify-between gap-3 border-b border-border/60 pb-3">
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-primary">Available scorecharts</p>
            <h2 className="mt-1 font-display text-xl font-bold sm:text-2xl">Published detailed voting</h2>
          </div>
          <span className="numeric text-xs text-muted-foreground">{scorechartShows.length}</span>
        </div>

        {scorechartShows.length ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {scorechartShows.map((show) => {
              const edition = editionMap.get(show.edition_id);
              return (
                <Link
                  key={show.id}
                  to="/shows/$showId"
                  params={{ showId: show.id }}
                  search={{ tab: "matrix" }}
                  className="group rounded-2xl border border-border/70 bg-surface/75 p-4 transition hover:border-primary/35 hover:bg-surface"
                >
                  <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-primary">
                    {edition ? editionLabel(edition) : "SSC"}
                  </p>
                  <h3 className="mt-2 font-display text-lg font-bold">{show.name}</h3>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {show.kind.replaceAll("-", " ")} · full voting matrix available
                  </p>
                  <span className="mt-4 inline-block text-xs font-semibold text-primary transition-transform group-hover:translate-x-1">
                    Open scorechart →
                  </span>
                </Link>
              );
            })}
          </div>
        ) : (
          <Panel>
            <p className="text-sm leading-relaxed text-muted-foreground">
              No detailed voting scorecharts have been published yet. They will appear here automatically when a show's detailed voting is made public.
            </p>
          </Panel>
        )}
      </section>
    </AppShell>
  );
}

function Guide({ number, title, text }: { number: string; title: string; text: string }) {
  return (
    <div className="rounded-xl bg-surface p-3">
      <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-primary">{number}</p>
      <p className="mt-1 text-sm font-semibold">{title}</p>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{text}</p>
    </div>
  );
}
