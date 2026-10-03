import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { useMemo } from "react";

import { AppShell, PageHeader } from "@/components/AppShell";
import { useSolarisApp } from "@/components/app/AppRuntime";
import {
  AppEmptyState,
  AppGroupedList,
  AppScreen,
  AppSectionHeader,
} from "@/components/app/AppPrimitives";
import { ArchiveDataError, ArchiveDataLoading, archiveHasError, archiveIsLoading } from "@/components/ArchiveDataState";
import { BackgroundFlag } from "@/components/BackgroundFlag";
import { FlagChip } from "@/components/FlagChip";
import {
  editionLabel,
  useAllResults,
  useAllShows,
  useCountries,
  useEditions,
} from "@/lib/data";
import { isShowPublic, showPublishesResults } from "@/lib/publication";

export const Route = createFileRoute("/shows/")({
  head: () => ({
    meta: [
      { title: "Shows — Solaris Song Contest" },
      {
        name: "description",
        content:
          "Browse published Solaris Song Contest semi-finals, finals and result broadcasts across every edition.",
      },
    ],
    links: [
      {
        rel: "canonical",
        href: "https://studio.solaris-song-contest.workers.dev/shows",
      },
    ],
  }),
  component: ShowsPage,
});

type ShowCard = {
  show: any;
  edition: any;
  winner: any | null;
  winnerPoints: number | null;
  entryCount: number;
  hasResults: boolean;
};

function ShowsPage() {
  const { isAppMode } = useSolarisApp();
  return isAppMode ? <AppShowsPage /> : <WebShowsPage />;
}

function AppShowsPage() {
  const editionsQuery = useEditions();
  const showsQuery = useAllShows();
  const { data: editions } = editionsQuery;
  const { data: shows } = showsQuery;

  const editionMap = useMemo(
    () => new Map((editions ?? []).map((edition) => [edition.id, edition])),
    [editions],
  );

  const groups = useMemo(() => {
    const map = new Map<string, { edition: any; shows: any[] }>();
    for (const show of shows ?? []) {
      if (!isShowPublic(show)) continue;
      const edition = editionMap.get(show.edition_id);
      if (!edition?.published) continue;
      const current = map.get(edition.id) ?? { edition, shows: [] };
      current.shows.push(show);
      map.set(edition.id, current);
    }

    return [...map.values()]
      .map((group) => ({
        ...group,
        shows: [...group.shows].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
      }))
      .sort((a, b) => (b.edition.edition_number ?? -1) - (a.edition.edition_number ?? -1));
  }, [editionMap, shows]);

  if (archiveIsLoading(editionsQuery, showsQuery)) {
    return <AppShell><ArchiveDataLoading label="Loading shows…" /></AppShell>;
  }
  if (archiveHasError(editionsQuery, showsQuery)) {
    return <AppShell><ArchiveDataError /></AppShell>;
  }

  return (
    <AppShell>
      <AppScreen>
        {groups.map((group) => (
          <section key={group.edition.id} aria-labelledby={`app-shows-${group.edition.id}`}>
            <AppSectionHeader
              eyebrow={`${group.shows.length} show${group.shows.length === 1 ? "" : "s"}`}
              title={editionLabel(group.edition)}
              id={`app-shows-${group.edition.id}`}
            />
            <AppGroupedList>
              {group.shows.map((show) => (
                <Link
                  key={show.id}
                  to="/shows/$showId"
                  params={{ showId: show.id }}
                  className="solaris-app-list-row"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{show.name}</span>
                    <span className="mt-0.5 block text-xs capitalize text-muted-foreground">
                      {showKindLabel(show.kind)}
                    </span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                </Link>
              ))}
            </AppGroupedList>
          </section>
        ))}

        {!groups.length ? (
          <AppEmptyState
            title="No public shows yet"
            description="Published shows will appear here when their public pages become available."
            action={
              <Link to="/editions" className="solaris-app-empty-action">
                Browse editions
              </Link>
            }
          />
        ) : null}
      </AppScreen>
    </AppShell>
  );
}

function WebShowsPage() {
  const editionsQuery = useEditions();
  const showsQuery = useAllShows();
  const countriesQuery = useCountries();
  const resultsQuery = useAllResults();
  const { data: editions } = editionsQuery;
  const { data: shows } = showsQuery;
  const { data: countries } = countriesQuery;
  const { data: results } = resultsQuery;

  const editionMap = useMemo(
    () => new Map((editions ?? []).map((edition) => [edition.id, edition])),
    [editions],
  );
  const countryMap = useMemo(
    () => new Map((countries ?? []).map((country) => [country.id, country])),
    [countries],
  );

  const cards = useMemo<ShowCard[]>(() => {
    return (shows ?? [])
      .filter(isShowPublic)
      .flatMap<ShowCard>((show) => {
        const edition = editionMap.get(show.edition_id);
        if (!edition?.published) return [];

        const showResults = (results ?? [])
          .filter((result) => result.show_id === show.id && result.final_rank != null)
          .sort((a, b) => (a.final_rank ?? 999) - (b.final_rank ?? 999));
        const winnerResult =
          showResults.find((result) => result.final_rank === 1) ?? showResults[0] ?? null;

        const card: ShowCard = {
          show,
          edition,
          winner: winnerResult ? countryMap.get(winnerResult.country_id) ?? null : null,
          winnerPoints: winnerResult ? winnerResult.total_points : null,
          entryCount: showResults.length,
          hasResults: showPublishesResults(show) && showResults.length > 0,
        };

        return [card];
      })
      .sort((a, b) => {
        const editionDiff =
          (b.edition.edition_number ?? -1) - (a.edition.edition_number ?? -1);
        if (editionDiff !== 0) return editionDiff;
        return (a.show.sort_order ?? 0) - (b.show.sort_order ?? 0);
      });
  }, [shows, results, editionMap, countryMap]);

  const latestEditionNumber = cards[0]?.edition.edition_number ?? null;
  const latestCards = cards.filter(
    (card) => card.edition.edition_number === latestEditionNumber,
  );
  const archiveCards = cards.filter(
    (card) => card.edition.edition_number !== latestEditionNumber,
  );
  const archiveGroups = useMemo(() => {
    const groups = new Map<string, ShowCard[]>();
    archiveCards.forEach((card) => {
      groups.set(card.edition.id, [...(groups.get(card.edition.id) ?? []), card]);
    });
    return [...groups.values()];
  }, [archiveCards]);
  const completedCount = cards.filter((card) => card.hasResults).length;
  const grandFinalCount = cards.filter(
    (card) => card.show.kind === "grand-final" || card.show.kind === "final",
  ).length;
  const archiveQueries = [editionsQuery, showsQuery, countriesQuery, resultsQuery];
  const loading = archiveIsLoading(...archiveQueries);

  if (loading) return <AppShell><PageHeader eyebrow="Broadcast archive" title="Shows" description="Semi-finals, finals and result nights in one broadcast-first archive." /><ArchiveDataLoading label="Loading shows and published results…" /></AppShell>;
  if (archiveHasError(...archiveQueries)) return <AppShell><PageHeader eyebrow="Broadcast archive" title="Shows" description="Semi-finals, finals and result nights in one broadcast-first archive." /><ArchiveDataError /></AppShell>;

  return (
    <AppShell>
      <PageHeader
        eyebrow="Broadcast archive"
        title="Shows"
        description="Semi-finals, finals and result nights in one broadcast-first archive. Open a show for its field, scoreboard and published result."
      />

      {!loading && cards.length > 0 && (
        <>
          <section className="mb-7 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border/60 bg-border/60 sm:grid-cols-4">
            <ArchiveStat label="Public shows" value={cards.length} />
            <ArchiveStat label="With results" value={completedCount} />
            <ArchiveStat label="Grand finals" value={grandFinalCount} />
            <ArchiveStat
              label="Latest edition"
              value={latestEditionNumber == null ? "—" : `#${latestEditionNumber}`}
            />
          </section>

          {latestCards.length > 0 && (
            <section>
              <SectionHeading
                kicker="On the current desk"
                title={editionLabel(latestCards[0].edition)}
                count={`${latestCards.length} show${latestCards.length === 1 ? "" : "s"}`}
              />
              <div className="mt-3 grid gap-3 lg:grid-cols-2">
                {latestCards.map((card, index) => (
                  <FeaturedShow key={card.show.id} card={card} priority={index === 0} />
                ))}
              </div>
            </section>
          )}

          {archiveCards.length > 0 && (
            <section className="mt-8 sm:mt-10">
              <SectionHeading
                kicker="Broadcast archive"
                title="Earlier shows"
                count={`${archiveCards.length} archived`}
              />
              <div className="mt-3 space-y-2">
                {archiveGroups.map((group, index) => (
                  <ArchiveEditionGroup key={group[0]!.edition.id} cards={group} defaultOpen={index === 0} />
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {!loading && cards.length === 0 && (
        <div className="rounded-2xl border border-border/70 bg-surface p-6 text-sm text-muted-foreground">
          No public shows are available yet.
        </div>
      )}
    </AppShell>
  );
}

function ArchiveEditionGroup({ cards, defaultOpen }: { cards: ShowCard[]; defaultOpen?: boolean }) {
  const edition = cards[0]!.edition;
  const resultCount = cards.filter((card) => card.hasResults).length;

  return (
    <details open={defaultOpen} className="group overflow-hidden rounded-2xl border border-border/65 bg-surface/25">
      <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 marker:hidden sm:px-5 [&::-webkit-details-marker]:hidden">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold sm:text-base">{editionLabel(edition)}</p>
          <p className="mt-0.5 text-[10px] text-muted-foreground">{cards.length} show{cards.length === 1 ? "" : "s"} · {resultCount} result{resultCount === 1 ? "" : "s"}</p>
        </div>
        <span className="shrink-0 text-xs font-semibold text-primary group-open:hidden">Open ↓</span>
        <span className="hidden shrink-0 text-xs font-semibold text-primary group-open:inline">Close ↑</span>
      </summary>
      <div className="grid gap-2 border-t border-border/55 p-2 sm:grid-cols-2 sm:p-3 xl:grid-cols-3">
        {cards.map((card) => <ArchiveShow key={card.show.id} card={card} />)}
      </div>
    </details>
  );
}

function FeaturedShow({ card, priority }: { card: ShowCard; priority?: boolean }) {
  const { show, edition, winner, winnerPoints, entryCount, hasResults } = card;

  return (
    <Link
      to="/shows/$showId"
      params={{ showId: show.id }}
      className={`solaris-family-card group relative min-w-0 overflow-hidden rounded-2xl border ${priority ? "min-h-[250px]" : "min-h-[220px]"}`}
    >
      <BackgroundFlag
        image={winner?.flag_image}
        className="-right-[28%] top-1/2 w-[105%] -translate-y-1/2 sm:-right-[14%] sm:w-[72%]"
        opacity={0.2}
      />
      <div className="solaris-family-card-overlay absolute inset-0" />

      <div className="relative z-10 flex min-h-[inherit] h-full flex-col justify-between p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            <span className="rounded-md bg-primary px-2 py-1 text-[10px] font-black uppercase tracking-[0.15em] text-primary-foreground">
              {showKindLabel(show.kind)}
            </span>
            <span className="rounded-md border border-white/15 bg-black/20 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.13em] text-white/65">
              {editionLabel(edition)}
            </span>
          </div>
          <span className="text-primary transition-transform group-hover:translate-x-1">→</span>
        </div>

        <div className="mt-8 min-w-0">
          <p className="text-[9px] font-black uppercase tracking-[0.2em] text-primary">
            {hasResults ? "Result published" : "Broadcast page"}
          </p>
          <h2 className={`mt-2 break-words font-bold leading-tight tracking-[-0.025em] text-white ${priority ? "text-2xl sm:text-3xl" : "text-xl sm:text-2xl"}`}>
            {show.name}
          </h2>

          <div className="mt-5 flex flex-wrap items-center gap-3 text-xs text-white/55">
            {winner ? (
              <div className="flex min-w-0 items-center gap-2 rounded-xl border border-white/12 bg-black/20 px-3 py-2">
                <FlagChip
                  code={winner.short_code}
                  color={winner.accent_color}
                  image={winner.flag_image}
                  size="sm"
                />
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/45">Winner</p>
                  <p className="truncate font-semibold text-white">
                    {winner.name}{winnerPoints != null ? ` · ${winnerPoints} pts` : ""}
                  </p>
                </div>
              </div>
            ) : (
              <span>{hasResults ? "Result available" : "Results not published"}</span>
            )}
            {entryCount > 0 && <span className="numeric">{entryCount} ranked entries</span>}
          </div>
        </div>
      </div>
    </Link>
  );
}

function ArchiveShow({ card }: { card: ShowCard }) {
  const { show, edition, winner, winnerPoints, hasResults } = card;

  return (
    <Link
      to="/shows/$showId"
      params={{ showId: show.id }}
      className="solaris-family-card group min-w-0 rounded-2xl border p-4 transition-[background-color,border-color,box-shadow,transform] duration-150 ease-out hover:-translate-y-0.5"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.17em] text-primary">
            {editionLabel(edition)} · {showKindLabel(show.kind)}
          </p>
          <h3 className="mt-1 break-words text-base font-bold tracking-[-0.02em] sm:text-lg">
            {show.name}
          </h3>
        </div>
        <span className="shrink-0 text-primary transition-transform group-hover:translate-x-1">→</span>
      </div>

      <div className="mt-5 border-t border-border/55 pt-3">
        {winner ? (
          <div className="flex min-w-0 items-center gap-2.5">
            <FlagChip
              code={winner.short_code}
              color={winner.accent_color}
              image={winner.flag_image}
              size="sm"
            />
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-muted-foreground">Winner</p>
              <p className="truncate text-xs font-semibold">{winner.name}</p>
            </div>
            {winnerPoints != null && (
              <span className="numeric shrink-0 text-[10px] font-semibold text-muted-foreground">
                {winnerPoints} pts
              </span>
            )}
          </div>
        ) : (
          <p className="text-[10px] text-muted-foreground">
            {hasResults ? "Published result" : "No public result yet"}
          </p>
        )}
      </div>
    </Link>
  );
}

function ArchiveStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-surface px-4 py-4 sm:px-5">
      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
      <p className="numeric mt-1.5 text-xl font-black tracking-[-0.03em] sm:text-2xl">{value}</p>
    </div>
  );
}

function SectionHeading({ kicker, title, count }: { kicker: string; title: string; count: string }) {
  return (
    <div className="flex items-end justify-between gap-4 border-b border-border/60 pb-3">
      <div className="min-w-0">
        <p className="text-[9px] font-black uppercase tracking-[0.22em] text-primary">{kicker}</p>
        <h2 className="mt-1 break-words text-lg font-bold tracking-[-0.02em] sm:text-xl">{title}</h2>
      </div>
      <p className="numeric shrink-0 text-xs text-muted-foreground">{count}</p>
    </div>
  );
}

function showKindLabel(kind: string | null | undefined) {
  if (!kind) return "Show";
  return kind.replaceAll("-", " ");
}
