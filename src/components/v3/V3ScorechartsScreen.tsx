import { Link } from "@tanstack/react-router";
import { Table2 } from "lucide-react";

import type { V3ScorechartIndexItem } from "@/lib/v3-scorecharts";
import {
  V3Screen,
  V3ScreenHeader,
  V3Section,
  V3Surface,
} from "./V3Foundation";

export function V3ScorechartsScreen({
  items,
  generatedAt,
}: {
  items: readonly V3ScorechartIndexItem[];
  generatedAt: string;
}) {
  const groups = new Map<
    string,
    {
      editionName: string;
      editionSlug: string;
      items: V3ScorechartIndexItem[];
    }
  >();

  for (const item of items) {
    const existing = groups.get(item.editionId);
    if (existing) {
      existing.items.push(item);
    } else {
      groups.set(item.editionId, {
        editionName: item.editionName,
        editionSlug: item.editionSlug,
        items: [item],
      });
    }
  }

  return (
    <V3Screen>
      <V3ScreenHeader
        kicker="Detailed voting"
        title="Full Scorecharts"
        description="Browse complete published voting matrices. Rows receive points and columns give them."
        editorial
      />

      <V3Surface level="raised" className="p-5">
        <p className="v3-kicker">How to read it</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <div>
            <p className="text-sm font-semibold">Rows receive</p>
            <p className="mt-1 text-xs leading-5 text-white/48">
              Follow an entry down the left side to see every published score it received.
            </p>
          </div>
          <div>
            <p className="text-sm font-semibold">Columns give</p>
            <p className="mt-1 text-xs leading-5 text-white/48">
              Follow a voter across the top to see its published distribution.
            </p>
          </div>
          <div>
            <p className="text-sm font-semibold">Publication wins</p>
            <p className="mt-1 text-xs leading-5 text-white/48">
              A scorechart appears here only after detailed voting is officially public.
            </p>
          </div>
        </div>
      </V3Surface>

      <V3Section
        title="Published detailed voting"
        meta={`${items.length} ${items.length === 1 ? "scorechart" : "scorecharts"}`}
      >
        {items.length === 0 ? (
          <V3Surface className="p-5">
            <div role="status" data-v3-scorecharts-empty="">
              <p className="text-sm font-semibold">No published scorecharts yet</p>
              <p className="mt-1 text-xs leading-5 text-white/48">
                Detailed voting will appear automatically when a show publishes its full voting matrix.
              </p>
            </div>
          </V3Surface>
        ) : (
          <div className="grid gap-5">
            {[...groups.entries()].map(([editionId, group]) => (
              <section key={editionId} aria-labelledby={`scorecharts-${editionId}`}>
                <div className="mb-2 flex min-h-11 items-center justify-between gap-3">
                  <h3
                    id={`scorecharts-${editionId}`}
                    className="text-xs font-bold uppercase tracking-[0.12em] text-white/48"
                  >
                    {group.editionName}
                  </h3>
                  <Link
                    to="/editions/$slug"
                    params={{ slug: group.editionSlug }}
                    className="inline-flex min-h-11 shrink-0 items-center rounded-xl px-3 text-xs font-semibold text-[var(--v3-text-secondary)] transition hover:bg-white/[0.04] hover:text-[var(--v3-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
                    aria-label={`Open ${group.editionName} edition hub`}
                  >
                    Edition overview →
                  </Link>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {group.items.map((item) => (
                    <Link
                      key={item.showId}
                      to="/shows/$showId"
                      params={{ showId: item.showId }}
                      search={{ tab: "matrix", from: "results" }}
                      className="block rounded-[var(--v3-radius-xl)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
                      aria-label={`Open ${item.editionName} ${item.showName} published voting matrix`}
                    >
                      <V3Surface
                        level="raised"
                        className="flex min-h-24 items-center gap-4 p-4 transition hover:bg-white/[0.045]"
                      >
                        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/[0.055]">
                          <Table2 className="size-5" aria-hidden="true" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold">
                            {item.showName}
                          </span>
                          <span className="mt-1 block text-xs capitalize text-white/45">
                            {item.showKind.replaceAll("-", " ")} · full voting matrix
                          </span>
                        </span>
                      </V3Surface>
                    </Link>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </V3Section>

      <p className="sr-only">
        Scorechart index refreshed from published Solaris state at {generatedAt}.
      </p>
    </V3Screen>
  );
}
