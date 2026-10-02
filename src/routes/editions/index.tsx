import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";

import { AppShell, PageHeader } from "@/components/AppShell";
import { useSolarisApp } from "@/components/app/AppRuntime";
import { ArchiveDataError, ArchiveDataLoading, archiveHasError, archiveIsLoading } from "@/components/ArchiveDataState";
import { FlagChip } from "@/components/FlagChip";
import {
  editionLabel,
  useAllResults,
  useAllShows,
  useCountries,
  useEditions,
} from "@/lib/data";
import { isShowPublic, resolveShowPublication } from "@/lib/publication";

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
  hosts: HostLocation[];
};

function EditionsPage() {
  const { isAppMode } = useSolarisApp();
  const editionsQuery = useEditions();
  const showsQuery = useAllShows();
  const resultsQuery = useAllResults();
  const countriesQuery = useCountries();
  const { data: editions } = editionsQuery;
  const { data: shows } = showsQuery;
  const { data: results } = resultsQuery;
  const { data: countries } = countriesQuery;

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
          hosts: [...hostMap.values()],
        };
      }),
    [editionList, shows, results, countryMap],
  );

  const latest = cards[0] ?? null;
  const archive = cards.slice(1);
  const archiveQueries = [editionsQuery, showsQuery, resultsQuery, countriesQuery];

  if (archiveIsLoading(...archiveQueries)) return <AppShell><PageHeader eyebrow="Contest archive" title="Editions" description="Every published Solaris chapter, from the latest contest back through the archive." /><ArchiveDataLoading label="Loading editions and results…" /></AppShell>;
  if (archiveHasError(...archiveQueries)) return <AppShell><PageHeader eyebrow="Contest archive" title="Editions" description="Every published Solaris chapter, from the latest contest back through the archive." /><ArchiveDataError /></AppShell>;

  return (
    <AppShell>
      <PageHeader
        eyebrow="Contest archive"
        title="Editions"
        description="Every published Solaris chapter, from the latest contest back through the archive."
      />

      {latest && <LatestEdition card={latest} appMode={isAppMode} />}

      {archive.length > 0 && (
        <section className="mt-7 sm:mt-9">
          <div className="mb-4 flex items-end justify-between gap-4 border-b border-border/60 pb-3">
            <div className="min-w-0">
              <p className="text-[9px] font-black uppercase tracking-[0.22em] text-primary">Archive desk</p>
              <h2 className="display-headline mt-1 text-xl sm:text-2xl">Past editions</h2>
            </div>
            <p className="numeric shrink-0 text-xs text-muted-foreground">{cards.length} editions</p>
          </div>

          <div className="overflow-hidden rounded-2xl border border-border/70 bg-surface/55 divide-y divide-border/60">
            {archive.map((card) => (
              <ArchiveEdition key={card.edition.id} card={card} appMode={isAppMode} />
            ))}
          </div>
        </section>
      )}

      {cards.length === 0 && (
        <div className="glass p-5 text-sm text-muted-foreground">No editions are public yet.</div>
      )}
    </AppShell>
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

function WinnerLine({ winner, points }: { winner: any; points?: number | null }) {
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
  const { edition, editionShows, winner, winnerResult, hosts } = card;

  return (
    <section aria-labelledby="current-edition-heading">
      <p className="mb-2 text-[10px] font-black uppercase tracking-[0.16em] text-primary">
        {edition.status === "completed" ? "Latest published edition" : "Current edition"}
      </p>
      <Link
        to="/editions/$slug"
        params={{ slug: edition.slug }}
        className={appMode ? "solaris-app-edition-current group block" : "group block rounded-2xl border border-primary/20 bg-surface p-4 transition-colors hover:bg-surface-strong sm:p-5"}
      >
        <div className="flex min-w-0 items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-muted-foreground">
              {edition.status === "completed" ? "Completed" : "In progress"}
            </p>
            <h2 id="current-edition-heading" className={appMode ? "mt-1 break-words text-xl font-bold tracking-[-.025em]" : "mt-1 break-words text-2xl font-bold tracking-[-.035em] sm:text-3xl"}>
              {editionLabel(edition)}
            </h2>
          </div>
          <span className="shrink-0 text-lg font-semibold text-primary transition-transform group-hover:translate-x-0.5">→</span>
        </div>

        <div className="mt-4 grid gap-2 border-t border-border/60 pt-4 text-sm sm:grid-cols-3">
          <p><span className="text-muted-foreground">Shows:</span> {editionShows.length}</p>
          <p className="min-w-0"><span className="text-muted-foreground">Host:</span> <HostLine hosts={hosts} /></p>
          <p className="min-w-0"><span className="text-muted-foreground">Winner:</span> <WinnerLine winner={winner} points={winnerResult?.total_points} /></p>
        </div>
      </Link>
    </section>
  );
}

function ArchiveEdition({ card, appMode = false }: { card: EditionCard; appMode?: boolean }) {
  const { edition, editionShows, winner, winnerResult, hosts } = card;

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
            <p className="mt-1 min-w-0 text-xs"><span className="text-muted-foreground">Winner:</span> <WinnerLine winner={winner} points={winnerResult?.total_points} /></p>
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
            <p className="min-w-0"><span className="text-muted-foreground">Winner:</span> <WinnerLine winner={winner} points={winnerResult?.total_points} /></p>
          </div>

          <span className="hidden shrink-0 text-base font-semibold text-primary transition-transform group-hover:translate-x-0.5 sm:block">→</span>
        </>
      )}
    </Link>
  );
}

