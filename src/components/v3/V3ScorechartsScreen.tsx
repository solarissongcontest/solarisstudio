import { Link } from "@tanstack/react-router";
import { Search, Table2 } from "lucide-react";

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
  selectedEditionSlug = null,
  query = "",
  onEditionChange,
  onQueryChange,
  onClearFilters,
}: {
  items: readonly V3ScorechartIndexItem[];
  generatedAt: string;
  selectedEditionSlug?: string | null;
  query?: string;
  onEditionChange?: (editionSlug: string | null) => void;
  onQueryChange?: (query: string) => void;
  onClearFilters?: () => void;
}) {
  const editionOptions = [
    ...new Map(
      items.map((item) => [
        item.editionSlug,
        {
          slug: item.editionSlug,
          name: item.editionName,
          editionNumber: item.editionNumber,
        },
      ]),
    ).values(),
  ].sort(
    (a, b) =>
      (b.editionNumber ?? Number.MIN_SAFE_INTEGER) -
        (a.editionNumber ?? Number.MIN_SAFE_INTEGER) ||
      a.name.localeCompare(b.name),
  );
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filteredItems = items.filter((item) => {
    if (selectedEditionSlug && item.editionSlug !== selectedEditionSlug) return false;
    if (!normalizedQuery) return true;

    return [item.showName, item.editionName, item.showKind]
      .join(" ")
      .toLocaleLowerCase()
      .includes(normalizedQuery);
  });
  const groups = new Map<
    string,
    { editionName: string; items: V3ScorechartIndexItem[] }
  >();

  for (const item of filteredItems) {
    const existing = groups.get(item.editionId);
    if (existing) {
      existing.items.push(item);
    } else {
      groups.set(item.editionId, { editionName: item.editionName, items: [item] });
    }
  }

  const filtersActive = Boolean(selectedEditionSlug || query.trim());
  const resultMeta = filtersActive
    ? `${filteredItems.length} of ${items.length} scorecharts`
    : `${items.length} ${items.length === 1 ? "scorechart" : "scorecharts"}`;

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

      {items.length > 0 && (onEditionChange || onQueryChange) ? (
        <V3Surface level="raised" className="p-4" data-v3-scorecharts-filters="">
          <div className="grid gap-3 md:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)_auto] md:items-end">
            <label className="grid gap-1.5 text-xs font-semibold text-white/58" htmlFor="v3-scorecharts-edition">
              Edition
              <select
                id="v3-scorecharts-edition"
                value={selectedEditionSlug ?? ""}
                onChange={(event) => onEditionChange?.(event.target.value || null)}
                className="min-h-11 rounded-xl border border-white/[0.08] bg-white/[0.035] px-3 text-sm text-white"
              >
                <option value="">All published editions</option>
                {editionOptions.map((edition) => (
                  <option key={edition.slug} value={edition.slug}>
                    {edition.editionNumber != null
                      ? `SSC ${edition.editionNumber} · ${edition.name}`
                      : edition.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-1.5 text-xs font-semibold text-white/58" htmlFor="v3-scorecharts-search">
              Find a scorechart
              <span className="relative block">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-white/38"
                  aria-hidden="true"
                />
                <input
                  id="v3-scorecharts-search"
                  type="search"
                  value={query}
                  onChange={(event) => onQueryChange?.(event.target.value)}
                  placeholder="Show or edition"
                  className="min-h-11 w-full rounded-xl border border-white/[0.08] bg-white/[0.035] pl-10 pr-3 text-sm text-white placeholder:text-white/32"
                />
              </span>
            </label>

            {filtersActive && onClearFilters ? (
              <button
                type="button"
                onClick={onClearFilters}
                className="min-h-11 rounded-xl border border-white/[0.1] px-4 text-sm font-semibold text-white/72"
              >
                Clear filters
              </button>
            ) : null}
          </div>
          <p className="mt-3 text-xs leading-5 text-white/42">
            Filters live in the URL so this archive view can be refreshed, bookmarked and shared. They only narrow the already publication-approved scorechart index.
          </p>
        </V3Surface>
      ) : null}

      <V3Section
        title="Published detailed voting"
        meta={resultMeta}
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
        ) : filteredItems.length === 0 ? (
          <V3Surface className="p-5">
            <div role="status" data-v3-scorecharts-filter-empty="">
              <p className="text-sm font-semibold">No scorecharts match these filters</p>
              <p className="mt-1 text-xs leading-5 text-white/48">
                Try another published edition or a broader show search. Hidden voting detail is never included as a match.
              </p>
              {onClearFilters ? (
                <button
                  type="button"
                  onClick={onClearFilters}
                  className="mt-4 min-h-11 rounded-xl border border-white/[0.1] px-4 text-sm font-semibold"
                >
                  Show all published scorecharts
                </button>
              ) : null}
            </div>
          </V3Surface>
        ) : (
          <div className="grid gap-5">
            {[...groups.entries()].map(([editionId, group]) => (
              <section key={editionId} aria-labelledby={`scorecharts-${editionId}`}>
                <h3
                  id={`scorecharts-${editionId}`}
                  className="mb-2 text-xs font-bold uppercase tracking-[0.12em] text-white/48"
                >
                  {group.editionName}
                </h3>
                <div className="grid gap-2 sm:grid-cols-2">
                  {group.items.map((item) => (
                    <Link
                      key={item.showId}
                      to="/shows/$showId"
                      params={{ showId: item.showId }}
                      search={{ tab: "matrix", from: "results" }}
                      className="block rounded-[var(--v3-radius-xl)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
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
