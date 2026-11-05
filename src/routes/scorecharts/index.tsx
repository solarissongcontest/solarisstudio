import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ChevronRight, Search, SlidersHorizontal } from "lucide-react";

import { AppShell, PageHeader } from "@/components/AppShell";
import { ArchiveDataError, ArchiveDataLoading, archiveHasError, archiveIsLoading } from "@/components/ArchiveDataState";
import { useSolarisApp } from "@/components/app/AppRuntime";
import { AppEmptyState, AppGroupedList, AppScreen, AppSectionHeader } from "@/components/app/AppPrimitives";
import { SolarisSearchField } from "@/components/app/SolarisSearchField";
import { Sheet, SheetClose, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useV3DirectoryPresentation, type V3DirectoryPresentation } from "@/lib/v3-directory-presentation";
import "@/styles/v3-directory-family.css";
import { PublicDataGuide } from "@/components/public/PublicDataView";
import { V3ScorechartsGate } from "@/components/v3/V3ScorechartsGate";
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
  const { isAppMode, platformResolved } = useSolarisApp();

  if (!platformResolved) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10" data-v3-scorecharts-boot="">
        <h1 className="text-3xl font-bold">Full Scorecharts</h1>
        <p role="status" className="mt-3">
          Opening published detailed voting…
        </p>
      </main>
    );
  }

  if (isAppMode) {
    return <V3ScorechartsGate fallback={<LegacyScorechartsPage />} />;
  }

  return <LegacyScorechartsPage />;
}

function LegacyScorechartsPage() {
  const presentation = useV3DirectoryPresentation();
  const editionsQuery = useEditions();
  const showsQuery = useAllShows();
  const { data: editions } = editionsQuery;
  const { data: shows } = showsQuery;
  const [search, setSearch] = useState("");
  const [editionId, setEditionId] = useState("all");

  const editionMap = useMemo(
    () => new Map((editions ?? []).map((edition) => [edition.id, edition])),
    [editions],
  );
  const scorechartShows = useMemo(
    () => (shows ?? [])
      // Published detailed voting is the sole source of index membership.
      .filter((show) => isShowPublic(show) && resolveShowPublication(show).detailed_voting)
      .sort((a, b) => {
        const editionA = editionMap.get(a.edition_id)?.edition_number ?? -1;
        const editionB = editionMap.get(b.edition_id)?.edition_number ?? -1;
        return editionB - editionA || a.sort_order - b.sort_order;
      }),
    [shows, editionMap],
  );
  const availableEditions = useMemo(() => {
    const ids = new Set(scorechartShows.map((show) => show.edition_id));
    return [...editionMap.values()]
      .filter((edition) => ids.has(edition.id))
      .sort((a, b) => (b.edition_number ?? -1) - (a.edition_number ?? -1));
  }, [editionMap, scorechartShows]);
  const terms = search.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const searched = scorechartShows.filter((show) => {
    const edition = editionMap.get(show.edition_id);
    const searchable = [
      show.name,
      show.kind.replaceAll("-", " "),
      edition ? editionLabel(edition) : "SSC",
    ].join(" ").toLocaleLowerCase();
    return terms.every((term) => searchable.includes(term));
  });
  const filtered = searched.filter((show) => editionId === "all" || show.edition_id === editionId);
  const groups = availableEditions
    .map((edition) => ({
      edition,
      shows: filtered.filter((show) => show.edition_id === edition.id),
    }))
    .filter((group) => group.shows.length > 0);
  const editionOptions = [
    { id: "all", label: "All editions", count: searched.length },
    ...availableEditions.map((edition) => ({
      id: edition.id,
      label: editionLabel(edition),
      count: searched.filter((show) => show.edition_id === edition.id).length,
    })),
  ];
  const selected = editionOptions.find((option) => option.id === editionId) ?? editionOptions[0];
  const reset = () => { setSearch(""); setEditionId("all"); };

  if (archiveIsLoading(editionsQuery, showsQuery)) {
    return <AppShell><ArchiveDataLoading label="Loading scorecharts…" /></AppShell>;
  }
  if (archiveHasError(editionsQuery, showsQuery)) {
    return <AppShell><ArchiveDataError /></AppShell>;
  }

  const controls = (
    <div className="v3-directory-controls">
      {presentation === "installed-app" ? (
        <SolarisSearchField value={search} onChange={setSearch}
          label="Search scorecharts" placeholder="Search shows or editions…" />
      ) : (
        <label className="v3-directory-search">
          <Search size={18} aria-hidden="true" />
          <span className="sr-only">Search scorecharts</span>
          <input type="search" value={search} aria-label="Search scorecharts"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search scorecharts by show or edition…" autoComplete="off" />
        </label>
      )}
      {presentation === "mobile-web" ? (
        <label className="v3-directory-area-select">
          <span className="sr-only">Filter scorecharts by edition</span>
          <select aria-label="Filter scorecharts by edition" value={editionId}
            onChange={(event) => setEditionId(event.target.value)}>
            {editionOptions.map((option) => (
              <option key={option.id} value={option.id}>{option.label} ({option.count})</option>
            ))}
          </select>
        </label>
      ) : null}
      {presentation === "installed-app" ? (
        <Sheet>
          <SheetTrigger asChild>
            <button type="button" className="v3-directory-sheet-trigger" aria-label="Filter scorecharts by edition">
              <SlidersHorizontal size={18} aria-hidden="true" />
              <span>{selected.label}</span><span className="v3-directory-count">{selected.count}</span>
            </button>
          </SheetTrigger>
          <SheetContent side="bottom" aria-label="Filter scorecharts by edition" className="max-h-[80dvh] overflow-y-auto">
            <h2 className="mb-3 text-lg font-bold">Browse scorecharts by edition</h2>
            <div className="v3-directory-sheet-options">
              {editionOptions.map((option) => (
                <SheetClose asChild key={option.id}>
                  <button type="button" aria-pressed={editionId === option.id}
                    onClick={() => setEditionId(option.id)}>
                    {option.label} <span>{option.count}</span>
                  </button>
                </SheetClose>
              ))}
            </div>
          </SheetContent>
        </Sheet>
      ) : null}
    </div>
  );

  const listing = (
    <>
      {controls}
      <p className="v3-directory-results-count" role="status">{filtered.length} matching scorecharts</p>
      <div className="v3-directory-groups">
        {groups.map((group) => (
          <section key={group.edition.id} className="v3-directory-group"
            aria-labelledby={`scorecharts-edition-${group.edition.id}`}>
            {presentation === "installed-app" ? (
              <AppSectionHeader eyebrow="Published detailed voting" title={editionLabel(group.edition)}
                id={`scorecharts-edition-${group.edition.id}`} />
            ) : (
              <h2 className="v3-directory-group-title"
                id={`scorecharts-edition-${group.edition.id}`}>{editionLabel(group.edition)}</h2>
            )}
            {presentation === "installed-app" ? (
              <AppGroupedList>
                {group.shows.map((show) => (
                  <Link key={show.id} to="/shows/$showId" params={{ showId: show.id }}
                    search={{ tab: "matrix", from: "results" }} className="solaris-app-list-row">
                    <span className="min-w-0 flex-1">
                      <strong className="block text-sm font-semibold">{show.name}</strong>
                      <span className="block text-xs leading-5 text-muted-foreground">{show.kind.replaceAll("-", " ")} · published detailed voting</span>
                    </span>
                    <ChevronRight size={18} className="shrink-0 text-muted-foreground" aria-hidden="true" />
                  </Link>
                ))}
              </AppGroupedList>
            ) : (
              <div className={presentation === "mobile-web" ? "v3-directory-mobile-list" : "v3-directory-desktop-grid"}>
                {group.shows.map((show) => (
                  <ScorechartShowLink key={show.id} show={show} presentation={presentation} />
                ))}
              </div>
            )}
          </section>
        ))}
      </div>
      {!filtered.length ? (
        <AppEmptyState
          title={scorechartShows.length ? "No matching scorecharts" : "No published scorecharts yet"}
          description={scorechartShows.length
            ? "Try another show, edition or search term."
            : "Detailed voting appears here only after a show's full voting matrix is officially public."}
          action={scorechartShows.length ? (
            <button type="button" className="solaris-app-empty-action" onClick={reset}>Clear filters</button>
          ) : undefined}
        />
      ) : null}
    </>
  );

  return (
    <AppShell>
      <div className="v3-directory-family" data-directory-experience={presentation}>
        {presentation === "installed-app" ? (
          <AppScreen>
            <header className="v3-directory-app-heading">
              <p className="v3-directory-eyebrow">DETAILED VOTING</p>
              <h1>Full Scorecharts</h1>
              <p>Open published jury voting matrices, organized by edition.</p>
            </header>
            {listing}
          </AppScreen>
        ) : (
          <>
            {presentation === "mobile-web" ? (
              <header className="v3-directory-mobile-header" data-directory-mobile-header="">
                <Link to="/results" className="v3-directory-back">Results / Scorecharts</Link>
                <p className="v3-directory-eyebrow">DETAILED VOTING</p>
                <h1>Full Scorecharts</h1>
                <p>Browse published matrices by show. Rows receive points, columns give them.</p>
              </header>
            ) : (
              <PageHeader eyebrow="Detailed voting" title="Full Scorecharts"
                description="Open the complete jury voting matrix for any show with officially published detailed voting."
                actions={<Link to="/editions" className="min-h-11 rounded-xl border border-border bg-surface px-4 py-3 text-sm font-semibold">Browse editions</Link>} />
            )}
            <div className="v3-directory-workspace">
              {presentation === "desktop-web" ? (
                <aside className="v3-directory-desktop-rail" aria-label="Filter scorecharts by edition">
                  <h2>Browse by edition</h2>
                  {editionOptions.map((option) => (
                    <button type="button" key={option.id} aria-pressed={editionId === option.id}
                      onClick={() => setEditionId(option.id)}>
                      <span>{option.label}</span><span>{option.count}</span>
                    </button>
                  ))}
                </aside>
              ) : null}
              <div className="v3-directory-results">
                {listing}
                {presentation === "desktop-web" ? (
                  <div className="mt-8">
                    <PublicDataGuide title="How to read a scorechart"
                      description="The official matrix shows who received each published vote."
                      items={[
                        { title: "Rows receive", description: "Find an entry down the left side to follow all points it received." },
                        { title: "Columns give", description: "Follow a voter across the top to see how it distributed its points." },
                        { title: "Open a show", description: "The scorechart opens inside the show's published results." },
                      ]}
                    />
                  </div>
                ) : null}
              </div>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}

function ScorechartShowLink({ show, presentation }: {
  show: NonNullable<ReturnType<typeof useAllShows>["data"]>[number];
  presentation: V3DirectoryPresentation;
}) {
  if (presentation === "mobile-web") {
    return (
      <Link to="/shows/$showId" params={{ showId: show.id }}
        search={{ tab: "matrix", from: "results" }} className="v3-directory-mobile-row">
        <span className="min-w-0 flex-1">
          <strong>{show.name}</strong>
          <span>{show.kind.replaceAll("-", " ")} · full voting matrix</span>
        </span>
        <ChevronRight size={18} aria-hidden="true" />
      </Link>
    );
  }
  return (
    <Link to="/shows/$showId" params={{ showId: show.id }}
      search={{ tab: "matrix", from: "results" }} className="v3-directory-desktop-card">
      <span className="v3-directory-eyebrow">PUBLISHED SCORECHART</span>
      <span className="v3-directory-card-top">
        <strong>{show.name}</strong><ChevronRight size={18} aria-hidden="true" />
      </span>
      <span className="v3-directory-card-description">{show.kind.replaceAll("-", " ")} · full voting matrix available</span>
    </Link>
  );
}
