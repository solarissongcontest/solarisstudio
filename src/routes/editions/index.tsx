import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, ChevronRight, Search, SlidersHorizontal, X } from "lucide-react";
import { useMemo, useState } from "react";

import { AppShell, PageHeader } from "@/components/AppShell";
import { SolarisSearchField } from "@/components/app/SolarisSearchField";
import { Sheet, SheetClose, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useV3DirectoryPresentation, type V3DirectoryPresentation } from "@/lib/v3-directory-presentation";
import { directoryCountLabel } from "@/lib/v3-directory-count";
import { matchesPublicDirectorySearch } from "@/lib/v3-public-directory-search";
import "@/styles/v3-directory-family.css";
import { useSolarisApp } from "@/components/app/AppRuntime";
import {
  AppEmptyState,
  AppGroupedList,
  AppScreen,
} from "@/components/app/AppPrimitives";
import { ArchiveDataError, ArchiveDataLoading, archiveHasError, archiveIsLoading } from "@/components/ArchiveDataState";
import { FlagChip } from "@/components/FlagChip";
import {
  editionLabel,
  useAllShows,
  useCountries,
  useEditions,
} from "@/lib/data";
import { isShowPublic, resolveShowPublication } from "@/lib/publication";
import { usePublicFinalWinners } from "@/lib/public-final-winners";

export const Route = createFileRoute("/editions/")({
  head: () => ({
    meta: [
      { title: "Editions — Solaris Song Contest" },
      {
        name: "description",
        content: "Browse every published Solaris Song Contest edition, host, show and public result.",
      },
    ],
    links: [
      {
        rel: "canonical",
        href: "https://studio.solaris-song-contest.workers.dev/editions",
      },
    ],
  }),
  component: EditionsPage,
});

type HostLocation = {
  key: string;
  city: string | null;
  country: any | null;
  showNames: string[];
};

type EditionCard = {
  edition: any;
  editionShows: any[];
  winner: any;
  winnerResult: any;
  winnerReadState: "ready" | "loading" | "error";
  hosts: HostLocation[];
};

function EditionsPage() {
  const { platformResolved } = useSolarisApp();
  const presentation = useV3DirectoryPresentation();
  const [search, setSearch] = useState("");
  const [scope, setScope] = useState<EditionDirectoryScope>("all");
  const editionsQuery = useEditions();
  const showsQuery = useAllShows();
  const countriesQuery = useCountries();
  const { data: editions } = editionsQuery;
  const { data: shows } = showsQuery;
  const { data: countries } = countriesQuery;

  // A directory needs only the first-place rows of already published finals.
  // Derive the finite allowlist from published Edition, public Show and
  // results-publication gates before executing the optional winner read.
  const publishedFinalShowIds = useMemo(() => {
    const publicEditionIds = new Set((editions ?? []).filter((item) => item.published).map((item) => item.id));
    return [...new Set((shows ?? [])
      .filter((show) =>
        publicEditionIds.has(show.edition_id) &&
        isShowPublic(show) &&
        (show.kind === "grand-final" || show.kind === "final") &&
        resolveShowPublication(show).results,
      )
      .map((show) => show.id))].sort();
  }, [editions, shows]);
  const resultsQuery = usePublicFinalWinners(publishedFinalShowIds);
  // Invalidate cached winner labels on a failed refresh rather than showing
  // historical data as if the public result read just succeeded.
  const results = resultsQuery.isSuccess ? resultsQuery.data : undefined;
  const winnerReadState: EditionCard["winnerReadState"] =
    publishedFinalShowIds.length === 0 ? "ready" :
    resultsQuery.isError ? "error" : resultsQuery.isSuccess ? "ready" : "loading";

  const editionList = useMemo(
    () =>
      [...(editions ?? []).filter((edition) => edition.published)].sort(
        (a, b) => (b.edition_number ?? -1) - (a.edition_number ?? -1),
      ),
    [editions],
  );

  const countryMap = useMemo(
    () => new Map((countries ?? []).map((country) => [country.id, country])),
    [countries],
  );

  const cards = useMemo<EditionCard[]>(
    () =>
      editionList.map((edition) => {
        const editionShows = (shows ?? [])
          .filter((show) => show.edition_id === edition.id && isShowPublic(show))
          .sort((a, b) => a.sort_order - b.sort_order);

        const grandFinal =
          editionShows.find((show) => show.kind === "grand-final" || show.kind === "final") ?? null;
        const publication = grandFinal ? resolveShowPublication(grandFinal) : null;
        const finalResults =
          grandFinal && publication?.results
            ? (results ?? [])
                .filter((result) => result.show_id === grandFinal.id && result.final_rank != null)
                .sort((a, b) => (a.final_rank ?? 999) - (b.final_rank ?? 999))
            : [];
        const winnerResult =
          finalResults.find((result) => result.final_rank === 1) ?? finalResults[0] ?? null;
        const winner = winnerResult ? countryMap.get(winnerResult.country_id) ?? null : null;

        const hostMap = new Map<string, HostLocation>();

        editionShows.forEach((show: any) => {
          const countryId = show.host_country_id ?? edition.host_country_id ?? null;
          const city = show.host_city ?? edition.host_city ?? null;

          if (!countryId && !city) return;

          const key = `${countryId ?? "none"}:${city ?? "none"}`;
          const current: HostLocation = hostMap.get(key) ?? {
            key,
            city,
            country: countryId ? countryMap.get(countryId) ?? null : null,
            showNames: [],
          };

          current.showNames.push(show.name);
          hostMap.set(key, current);
        });

        if (hostMap.size === 0 && (edition.host_country_id || edition.host_city)) {
          const country = edition.host_country_id ? countryMap.get(edition.host_country_id) ?? null : null;
          const key = `${edition.host_country_id ?? "none"}:${edition.host_city ?? "none"}`;
          hostMap.set(key, {
            key,
            city: edition.host_city ?? null,
            country,
            showNames: editionShows.map((show) => show.name),
          });
        }

        return {
          edition,
          editionShows,
          winner,
          winnerResult,
          winnerReadState: publication?.results ? winnerReadState : "ready",
          hosts: [...hostMap.values()],
        };
      }),
    [editionList, shows, results, countryMap, winnerReadState],
  );

  const latest = cards[0] ?? null;
  const normalizedSearch = search.trim().toLowerCase();
  const searched = cards.filter((card) => {
    const hostNames = card.hosts
      .map((host) => [host.city, host.country?.name].filter(Boolean).join(" "))
      .join(" ");
    return matchesPublicDirectorySearch(normalizedSearch, [
      editionLabel(card.edition),
      card.edition.slug,
      card.edition.edition_number,
      hostNames,
      card.winner?.name,
    ]);
  });
  const latestCount = latest && searched.some((card) => card.edition.id === latest.edition.id) ? 1 : 0;
  const pastCount = searched.length - latestCount;
  const visible = searched.filter((card) => (
    scope === "all"
    || (scope === "latest" && card.edition.id === latest?.edition.id)
    || (scope === "past" && card.edition.id !== latest?.edition.id)
  ));
  const visibleLatest = visible.find((card) => card.edition.id === latest?.edition.id) ?? null;
  const visiblePast = visible.filter((card) => card.edition.id !== latest?.edition.id);
  const archiveQueries = [editionsQuery, showsQuery, countriesQuery];

  // Never flash website navigation before the installed runtime is resolved.
  if (!platformResolved) {
    return <div data-directory-boot="" role="status" aria-label="Opening editions" className="min-h-20" />;
  }

  if (archiveIsLoading(...archiveQueries)) {
    return (
      <AppShell>
        {presentation === "desktop-web" ? (
          <PageHeader eyebrow="Contest archive" title="Editions" description="Browse the published Solaris Song Contest editions." />
        ) : null}
        <ArchiveDataLoading label="Loading published editions…" />
      </AppShell>
    );
  }
  if (archiveHasError(...archiveQueries)) {
    return (
      <AppShell>
        {presentation === "desktop-web" ? (
          <PageHeader eyebrow="Contest archive" title="Editions" description="Browse the published Solaris Song Contest editions." />
        ) : null}
        <ArchiveDataError />
      </AppShell>
    );
  }

  const searchLabel = "Search editions";
  const reset = () => { setSearch(""); setScope("all"); };
  const control = (
    <EditionDirectoryControls
      presentation={presentation}
      search={search}
      setSearch={setSearch}
      scope={scope}
      setScope={setScope}
      latestCount={latestCount}
      pastCount={pastCount}
      searchLabel={searchLabel}
    />
  );

  return (
    <AppShell>
      <div className="v3-directory-family v3-editions-directory" data-directory-experience={presentation}>
        {presentation === "installed-app" ? (
          <AppScreen>
            <header className="v3-directory-app-heading">
              <p className="v3-directory-eyebrow">CONTEST HISTORY</p>
              <h1>Editions</h1>
              <p>Explore the latest edition and past contests.</p>
            </header>
            {control}
            <p className="v3-directory-results-count" role="status" aria-live="polite">{directoryCountLabel({ available: cards.length, matches: visible.length, rendered: visible.length, noun: "published editions" })}</p>
            {visibleLatest ? <LatestEdition card={visibleLatest} appMode /> : null}
            {visiblePast.length ? (
              <section className="v3-directory-group" aria-labelledby="app-edition-archive">
                <h2 id="app-edition-archive" className="v3-directory-group-title">Past editions <span className="v3-directory-group-count">{visiblePast.length}</span></h2>
                <AppGroupedList>
                  {visiblePast.map((card) => <ArchiveEdition key={card.edition.id} card={card} appMode />)}
                </AppGroupedList>
              </section>
            ) : null}
            {!visible.length ? <EditionDirectoryEmpty onReset={reset} hasPublishedEditions={cards.length > 0} /> : null}
          </AppScreen>
        ) : (
          <>
            {presentation === "mobile-web" ? (
              <header className="v3-directory-mobile-header" data-directory-mobile-header="">
                <p className="v3-directory-eyebrow">CONTEST ARCHIVE</p>
                <h1>Editions</h1>
                <p>Explore every published SSC edition, from the latest contest back through history.</p>
              </header>
            ) : (
              <PageHeader
                eyebrow="Contest archive"
                title="Editions"
                description="Every published Solaris chapter, from the latest contest back through the archive."
              />
            )}
            <div className="v3-directory-workspace">
              {presentation === "desktop-web" ? (
                <EditionDirectoryRail
                  scope={scope}
                  setScope={setScope}
                  latestCount={latestCount}
                  pastCount={pastCount}
                />
              ) : null}
              <div className="v3-directory-results">
                {control}
                <p className="v3-directory-results-count" role="status" aria-live="polite">{directoryCountLabel({ available: cards.length, matches: visible.length, rendered: visible.length, noun: "published editions" })}</p>
                {visibleLatest ? <LatestEdition card={visibleLatest} /> : null}
                {visiblePast.length ? (
                  <section className="v3-directory-group v3-editions-history" aria-labelledby="editions-archive-heading">
                    <h2 id="editions-archive-heading" className="v3-directory-group-title">Past editions</h2>
                    {presentation === "mobile-web" ? (
                      <div className="v3-directory-mobile-list">
                        {visiblePast.map((card) => <EditionMobileRow key={card.edition.id} card={card} />)}
                      </div>
                    ) : (
                      <div className="v3-directory-desktop-grid">
                        {visiblePast.map((card) => <EditionDesktopCard key={card.edition.id} card={card} />)}
                      </div>
                    )}
                  </section>
                ) : null}
                {!visible.length ? <EditionDirectoryEmpty onReset={reset} hasPublishedEditions={cards.length > 0} /> : null}
              </div>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}

type EditionDirectoryScope = "all" | "latest" | "past";

function EditionDirectoryControls({
  presentation,
  search,
  setSearch,
  scope,
  setScope,
  latestCount,
  pastCount,
  searchLabel,
}: {
  presentation: V3DirectoryPresentation;
  search: string;
  setSearch: (value: string) => void;
  scope: EditionDirectoryScope;
  setScope: (value: EditionDirectoryScope) => void;
  latestCount: number;
  pastCount: number;
  searchLabel: string;
}) {
  const options = [
    { id: "all", label: "All editions", count: latestCount + pastCount },
    { id: "latest", label: "Latest edition", count: latestCount },
    { id: "past", label: "Past editions", count: pastCount },
  ] as const;
  const webSearch = (
    <div className="v3-directory-search" role="search">
      <Search size={18} aria-hidden="true" />
      <input type="search" value={search} onChange={(event) => setSearch(event.target.value)}
        aria-label={searchLabel} placeholder="Search editions, hosts or winners…" autoComplete="off" />
      {search ? (
        <button type="button" className="v3-directory-search-clear" aria-label="Clear search" onClick={() => setSearch("")}>
          <X size={16} aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
  if (presentation === "desktop-web") {
    return <div className="v3-directory-controls">{webSearch}</div>;
  }
  if (presentation === "mobile-web") {
    return (
      <div className="v3-directory-controls">
        {webSearch}
        <label className="v3-directory-area-select">
          <span className="sr-only">Browse edition history</span>
          <select aria-label="Browse edition history" value={scope}
            onChange={(event) => setScope(event.target.value as EditionDirectoryScope)}>
            {options.map((option) => (
              <option key={option.id} value={option.id}>{option.label} ({option.count})</option>
            ))}
          </select>
        </label>
      </div>
    );
  }
  return (
    <div className="v3-directory-controls">
      <SolarisSearchField value={search} onChange={setSearch} label={searchLabel} placeholder="Search editions or hosts…" />
      <Sheet>
        <SheetTrigger asChild>
          <button type="button" className="v3-directory-sheet-trigger" aria-label="Filter editions">
            <SlidersHorizontal size={18} aria-hidden="true" />
            <span>{options.find((option) => option.id === scope)?.label}</span>
            <span className="v3-directory-count">{options.find((option) => option.id === scope)?.count}</span>
          </button>
        </SheetTrigger>
        <SheetContent side="bottom" aria-label="Filter editions" className="max-h-[80dvh] overflow-y-auto">
          <h2 className="mb-3 text-lg font-bold">Browse edition history</h2>
          <div className="v3-directory-sheet-options">
            {options.map((option) => (
              <SheetClose asChild key={option.id}>
                <button type="button" aria-pressed={scope === option.id} onClick={() => setScope(option.id)}>
                  <span className="v3-directory-option-label">{scope === option.id ? <Check size={17} aria-hidden="true" /> : null}{option.label}</span>
                  <span>{option.count}</span>
                </button>
              </SheetClose>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function EditionDirectoryRail({
  scope,
  setScope,
  latestCount,
  pastCount,
}: {
  scope: EditionDirectoryScope;
  setScope: (value: EditionDirectoryScope) => void;
  latestCount: number;
  pastCount: number;
}) {
  const options = [
    { id: "all", label: "All editions", count: latestCount + pastCount },
    { id: "latest", label: "Latest edition", count: latestCount },
    { id: "past", label: "Past editions", count: pastCount },
  ] as const;
  return (
    <aside className="v3-directory-desktop-rail" aria-label="Filter editions">
      <h2>Browse history</h2>
      {options.map((option) => (
        <button key={option.id} type="button" aria-pressed={scope === option.id}
          onClick={() => setScope(option.id)}>
          <span className="v3-directory-option-label">{scope === option.id ? <Check size={15} aria-hidden="true" /> : null}{option.label}</span><span>{option.count}</span>
        </button>
      ))}
    </aside>
  );
}

function EditionMobileRow({ card }: { card: EditionCard }) {
  return (
    <Link to="/editions/$slug" params={{ slug: card.edition.slug }} className="v3-directory-mobile-row">
      <span className="min-w-0 flex-1">
        <strong>{editionLabel(card.edition)}</strong>
        <span>{card.editionShows.length} public show{card.editionShows.length === 1 ? "" : "s"} · <HostLine hosts={card.hosts} /></span>
      </span>
      <ChevronRight size={19} aria-hidden="true" />
    </Link>
  );
}

function EditionDesktopCard({ card }: { card: EditionCard }) {
  return (
    <Link to="/editions/$slug" params={{ slug: card.edition.slug }} className="v3-directory-desktop-card">
      <span className="v3-directory-eyebrow">SSC {card.edition.edition_number ?? "archive"}</span>
      <span className="v3-directory-card-top">
        <strong>{editionLabel(card.edition)}</strong>
        <ChevronRight size={19} aria-hidden="true" />
      </span>
      <span className="v3-directory-card-description">{card.editionShows.length} published show{card.editionShows.length === 1 ? "" : "s"}</span>
      <span className="v3-directory-card-description">Host: <HostLine hosts={card.hosts} /></span>
      <span className="v3-directory-card-description">Winner: <WinnerLine winner={card.winner} points={card.winnerResult?.total_points} readState={card.winnerReadState} /></span>
    </Link>
  );
}

function EditionDirectoryEmpty({ onReset, hasPublishedEditions }: {
  onReset: () => void;
  hasPublishedEditions: boolean;
}) {
  return hasPublishedEditions ? (
    <AppEmptyState
      title="No matching editions"
      description="Try another edition number, country or host city."
      action={<button type="button" onClick={onReset} className="solaris-app-empty-action">Clear filters</button>}
    />
  ) : (
    <AppEmptyState
      title="No public editions yet"
      description="Published editions will appear in this historical collection when they are released."
    />
  );
}

function HostLine({ hosts }: { hosts: HostLocation[] }) {
  if (!hosts.length) return <span className="text-muted-foreground">Host TBC</span>;
  return (
    <span className="inline-flex min-w-0 flex-wrap items-center gap-1.5">
      {hosts.slice(0, 2).map((host, index) => (
        <span key={host.key} className="inline-flex min-w-0 items-center gap-1.5">
          {host.country ? (
            <FlagChip
              code={host.country.short_code}
              color={host.country.accent_color}
              image={host.country.flag_image}
              size="sm"
            />
          ) : null}
          <span className="truncate">
            {[host.city, host.country?.name].filter(Boolean).join(", ") || "TBC"}
          </span>
          {index < Math.min(hosts.length, 2) - 1 ? <span aria-hidden="true">·</span> : null}
        </span>
      ))}
      {hosts.length > 2 ? <span className="text-muted-foreground">+{hosts.length - 2}</span> : null}
    </span>
  );
}

function WinnerLine({ winner, points, readState = "ready" }: {
  winner: any;
  points?: number | null;
  readState?: EditionCard["winnerReadState"];
}) {
  if (readState === "loading") return <span className="text-muted-foreground">Checking published winner…</span>;
  if (readState === "error") return <span className="text-muted-foreground">Winner details temporarily unavailable</span>;
  if (!winner) return <span className="text-muted-foreground">Result not public yet</span>;
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <FlagChip
        code={winner.short_code}
        color={winner.accent_color}
        image={winner.flag_image}
        size="sm"
      />
      <span className="truncate">{winner.name}</span>
      {points != null ? <span className="numeric text-muted-foreground">· {points} pts</span> : null}
    </span>
  );
}

function LatestEdition({ card, appMode = false }: { card: EditionCard; appMode?: boolean }) {
  const { edition, editionShows, winner, winnerResult, winnerReadState, hosts } = card;

  return (
    <section aria-labelledby="current-edition-heading">
      <p className="mb-2 text-[10px] font-black uppercase tracking-[0.16em] text-primary">
        {edition.status === "active" ? "Current edition" : "Latest published edition"}
      </p>
      <Link
        to="/editions/$slug"
        params={{ slug: edition.slug }}
        className={appMode ? "v3-editions-feature solaris-app-card solaris-app-edition-current group block" : "v3-editions-feature group block rounded-2xl border border-primary/20 bg-surface p-4 transition-colors hover:bg-surface-strong sm:p-5"}
      >
        <div className="flex min-w-0 items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-muted-foreground">
              {edition.status === "completed" ? "Completed" : "Published edition"}
            </p>
            <h2 id="current-edition-heading" className={appMode ? "mt-1 break-words text-xl font-bold tracking-[-.025em]" : "mt-1 break-words text-2xl font-bold tracking-[-.035em] sm:text-3xl"}>
              {editionLabel(edition)}
            </h2>
          </div>
          <span className="shrink-0 text-lg font-semibold text-primary transition-transform group-hover:translate-x-0.5">→</span>
        </div>

        <div className="v3-editions-feature-meta mt-3 grid gap-1.5 border-t border-border/60 pt-3 text-sm sm:grid-cols-3">
          <p><span className="text-muted-foreground">Shows:</span> {editionShows.length}</p>
          <p className="min-w-0"><span className="text-muted-foreground">Host:</span> <HostLine hosts={hosts} /></p>
          {winner ? <p className="min-w-0"><span className="text-muted-foreground">Winner:</span> <WinnerLine winner={winner} points={winnerResult?.total_points} readState={winnerReadState} /></p> : null}
        </div>
      </Link>
    </section>
  );
}

function ArchiveEdition({ card, appMode = false }: { card: EditionCard; appMode?: boolean }) {
  const { edition, editionShows, winner, winnerResult, winnerReadState, hosts } = card;

  return (
    <Link
      to="/editions/$slug"
      params={{ slug: edition.slug }}
      className={appMode ? "solaris-app-edition-row group" : "group grid min-w-0 gap-2 px-4 py-4 transition-colors hover:bg-surface sm:grid-cols-[5rem_minmax(0,1fr)_minmax(12rem,.8fr)_auto] sm:items-center sm:gap-4 sm:px-5"}
    >
      {appMode ? (
        <>
          <div className="min-w-0">
            <p className="truncate text-base font-semibold">{editionLabel(edition)}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {editionShows.length} public show{editionShows.length === 1 ? "" : "s"}
            </p>
            <p className="mt-1 min-w-0 text-xs"><span className="text-muted-foreground">Winner:</span> <WinnerLine winner={winner} points={winnerResult?.total_points} readState={winnerReadState} /></p>
          </div>
          <span className="shrink-0 text-primary" aria-hidden="true">›</span>
        </>
      ) : (
        <>
          <div className="flex items-baseline gap-2 sm:block">
            <p className="numeric text-lg font-bold text-foreground">{edition.edition_number ?? "—"}</p>
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground sm:mt-0.5">SSC</p>
          </div>

          <div className="min-w-0">
            <p className="truncate text-base font-semibold">{editionLabel(edition)}</p>
            <p className="mt-1 text-xs text-muted-foreground">{editionShows.length} public show{editionShows.length === 1 ? "" : "s"}</p>
          </div>

          <div className="min-w-0 space-y-1 text-xs">
            <p className="min-w-0"><span className="text-muted-foreground">Host:</span> <HostLine hosts={hosts} /></p>
            <p className="min-w-0"><span className="text-muted-foreground">Winner:</span> <WinnerLine winner={winner} points={winnerResult?.total_points} readState={winnerReadState} /></p>
          </div>

          <span className="hidden shrink-0 text-base font-semibold text-primary transition-transform group-hover:translate-x-0.5 sm:block">→</span>
        </>
      )}
    </Link>
  );
}

