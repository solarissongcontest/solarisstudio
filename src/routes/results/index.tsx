import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, BarChart3, Beaker, ChevronRight, GitCompareArrows, Table2, Trophy } from "lucide-react";
import { useMemo } from "react";

import { AppShell, Panel, StatTile } from "@/components/AppShell";
import { useSolarisApp } from "@/components/app/AppRuntime";
import { AppCard, AppGroupedList, AppScreen, AppSectionHeader } from "@/components/app/AppPrimitives";
import { PublicAdvancedDisclosure } from "@/components/public/PublicAdvancedDisclosure";
import { PublicDataState } from "@/components/public/PublicDataState";
import { PublicDestinationGrid } from "@/components/public/PublicDestinationGrid";
import { PublicHubHero } from "@/components/public/PublicHubHero";
import { PublicPrimaryAction } from "@/components/public/PublicPrimaryAction";
import { PublicSecondaryLinks } from "@/components/public/PublicSecondaryLinks";
import { ArchiveDataError, ArchiveDataLoading, archiveHasError, archiveIsLoading } from "@/components/ArchiveDataState";
import { FlagChip } from "@/components/FlagChip";
import { useAppExperiencePreferences } from "@/lib/app-experience";
import {
  editionLabel,
  useAllContestEntities,
  useAllParticipants,
  useAllResults,
  useAllShows,
  useCountries,
  useEditions,
} from "@/lib/data";
import { entityDisplayMap } from "@/lib/entities";
import {
  filterResultsToCompetingParticipants,
  type ParticipationAwareParticipant,
} from "@/lib/participation-status";
import { isShowPublic, resolveShowPublication } from "@/lib/publication";
import { useV3EditionRolloutProbe, useV3RolloutProbe } from "@/lib/v3-primary-runtime";
import { V3AppShell } from "@/components/v3/V3AppShell";
import { V3ResultsScreen } from "@/components/v3/V3ResultsScreen";
import { V3Screen } from "@/components/v3/V3Foundation";
import { useNotificationPreferences } from "@/lib/engagement-data";
import { resolveV3ResultsSpoilerProtection } from "@/lib/v3-results";

export const Route = createFileRoute("/results/")({
  head: () => ({
    meta: [
      { title: "Results — Solaris Studio" },
      {
        name: "description",
        content: "Start with the latest SSC result, then open scorecharts, comparisons and deeper result tools.",
      },
    ],
  }),
  component: ResultsOverviewPage,
});

function ResultsOverviewPage() {
  const { isAppMode, platformResolved } = useSolarisApp();
  const { preferences } = useAppExperiencePreferences();
  const editionsQuery = useEditions();
  const showsQuery = useAllShows();
  const resultsQuery = useAllResults();
  const participantsQuery = useAllParticipants();
  const countriesQuery = useCountries();
  const entitiesQuery = useAllContestEntities();
  const { data: editions } = editionsQuery;
  const { data: shows } = showsQuery;
  const { data: results } = resultsQuery;
  const { data: participants } = participantsQuery;
  const { data: countries } = countriesQuery;
  const { data: entities } = entitiesQuery;

  const displayMap = useMemo(
    () => entityDisplayMap(entities ?? [], countries ?? []),
    [entities, countries],
  );
  const editionMap = useMemo(
    () => new Map((editions ?? []).map((edition) => [edition.id, edition])),
    [editions],
  );
  const competingResults = useMemo(
    () => filterResultsToCompetingParticipants(
      results ?? [],
      (participants ?? []) as ParticipationAwareParticipant[],
    ),
    [results, participants],
  );

  const resultShows = useMemo(
    () =>
      (shows ?? [])
        .filter((show) => editionMap.get(show.edition_id)?.published === true && isShowPublic(show) && resolveShowPublication(show).results)
        .sort((a, b) => {
          const aEdition = editionMap.get(a.edition_id)?.edition_number ?? -1;
          const bEdition = editionMap.get(b.edition_id)?.edition_number ?? -1;
          if (aEdition !== bEdition) return bEdition - aEdition;
          const aFinal = a.kind === "grand-final" || a.kind === "final";
          const bFinal = b.kind === "grand-final" || b.kind === "final";
          if (aFinal !== bFinal) return aFinal ? -1 : 1;
          return b.sort_order - a.sort_order || a.id.localeCompare(b.id);
        }),
    [shows, editionMap],
  );

  const latestShow = resultShows[0] ?? null;
  const latestEdition = latestShow ? editionMap.get(latestShow.edition_id) ?? null : null;
  const latestRows = latestShow
    ? competingResults
        .filter((row) => row.show_id === latestShow.id && row.final_rank != null && row.final_rank > 0)
        .sort((a, b) => (a.final_rank ?? 999) - (b.final_rank ?? 999))
    : [];
  const winnerRow = latestRows.find((row) => row.final_rank === 1) ?? null;
  const runnerUp = latestRows.find((row) => row.final_rank === 2) ?? null;
  const winner = winnerRow ? displayMap.get(winnerRow.country_id) ?? null : null;
  const margin = winnerRow && runnerUp ? winnerRow.total_points - runnerUp.total_points : null;
  const publication = latestShow ? resolveShowPublication(latestShow) : null;
  const archiveQueries = [editionsQuery, showsQuery, resultsQuery, participantsQuery, countriesQuery, entitiesQuery];

  // Cohorts are evaluated against the edition of the actual result, not an
  // unrelated active edition. Empty states use the current-edition probe.
  const editionProbe = useV3EditionRolloutProbe(
    latestEdition?.slug ?? "",
    platformResolved && isAppMode && Boolean(latestEdition?.slug),
  );
  const currentProbe = useV3RolloutProbe(
    platformResolved && isAppMode && !latestEdition?.slug,
  );
  const rollout = latestEdition?.slug ? editionProbe : currentProbe;
  const serverPreferences = useNotificationPreferences(rollout.data?.userId ?? undefined);
  const hideSpoilers = isAppMode && resolveV3ResultsSpoilerProtection({
    localSpoilerFree: preferences.spoilerFree,
    viewerResolved: Boolean(rollout.data),
    viewerId: rollout.data?.userId ?? null,
    serverPending: serverPreferences.isPending,
    serverError: serverPreferences.isError,
    serverSpoilerFree: serverPreferences.data?.spoiler_free ?? null,
  });
  const v3Enabled = isAppMode && !rollout.isError && rollout.data?.enabled === true && rollout.data?.resultsEnabled === true;

  if (!platformResolved || (isAppMode && rollout.isLoading)) {
    return <main className="mx-auto max-w-3xl px-4 py-10" data-v3-results-boot=""><h1 className="text-3xl font-bold">Results</h1><p role="status" className="mt-3">Opening published results…</p></main>;
  }

  if (archiveIsLoading(...archiveQueries)) {
    if (v3Enabled) return <V3AppShell editionLabel="Solaris Studio" phaseLabel="Results"><V3Screen><ArchiveDataLoading label="Loading published results…" /></V3Screen></V3AppShell>;
    return (
      <AppShell>
        <ArchiveDataLoading label="Loading published results…" />
      </AppShell>
    );
  }
  if (archiveHasError(...archiveQueries)) {
    if (v3Enabled) return <V3AppShell editionLabel="Solaris Studio" phaseLabel="Results"><V3Screen><ArchiveDataError /></V3Screen></V3AppShell>;
    return (
      <AppShell>
        <ArchiveDataError />
      </AppShell>
    );
  }

  if (v3Enabled) {
    const resultCountries = entityDisplayMap(
      (entities ?? []).filter((entity) => entity.edition_id === latestEdition?.id),
      countries,
    );
    return (
      <V3AppShell editionLabel={latestEdition ? editionLabel(latestEdition) : "Solaris Studio"} phaseLabel="Results" activeArea="results">
        <V3ResultsScreen
          key={`${rollout.data?.userId ?? "anonymous"}:${latestShow?.id ?? "none"}:${hideSpoilers}`}
          countries={resultCountries}
          hideSpoilers={hideSpoilers}
          input={{
            editionId: latestEdition?.id ?? "", editionName: latestEdition ? editionLabel(latestEdition) : "Solaris Studio",
            showId: latestShow?.id ?? "", showName: latestShow?.name ?? "",
            publication: latestShow && publication?.results ? "published" : "hidden",
            disclosure: "withheld",
            rows: latestRows.map((row) => ({
              countryId: row.country_id, countryName: resultCountries.get(row.country_id)?.name ?? "Unknown country",
              flagUrl: resultCountries.get(row.country_id)?.flag_image ?? null,
              rank: row.final_rank!, points: row.total_points,
              juryPoints: publication?.jury_results ? row.jury_points : null,
              televotePoints: publication?.televote_results ? row.televote_points : null,
            })),
            juryPublished: publication?.jury_results === true,
            televotePublished: publication?.televote_results === true,
            userDelegationCountryId: null,
            resultTools: [{ key: "scorecharts", label: "Full scorecharts", href: "/scorecharts" }],
            advancedTools: [
              { key: "analysis", label: "Analysis", href: "/analysis" },
              { key: "records", label: "Records", href: "/records" },
              { key: "relationships", label: "Voting relationships", href: "/relationships" },
              { key: "lab", label: "Result Lab", href: "/result-lab" },
            ],
          }}
        />
      </V3AppShell>
    );
  }

  if (isAppMode) {
    const appDestinations = [
      {
        to: latestShow ? `/shows/${latestShow.id}?from=results` : "/editions",
        title: "Latest result",
        description: latestShow && latestEdition
          ? `${editionLabel(latestEdition)} · ${latestShow.name}`
          : "Open the newest published ranking.",
        icon: Trophy,
      },
      {
        to: "/scorecharts",
        title: "Full scorecharts",
        description: "Published ballots, points and detailed voting.",
        icon: Table2,
      },
      {
        to: "/analysis",
        title: "Analysis",
        description: "Voting splits, patterns and contest statistics.",
        icon: BarChart3,
      },
      {
        to: "/records",
        title: "Records",
        description: "All-time records, milestones and historical extremes.",
        icon: Trophy,
      },
      {
        to: "/relationships",
        title: "Voting relationships",
        description: "See countries that repeatedly support or resemble one another.",
        icon: GitCompareArrows,
      },
      {
        to: "/result-lab",
        title: "Result Lab",
        description: "Test alternate voting scenarios without changing official results.",
        icon: Beaker,
      },
    ] as const;

    return (
      <AppShell>
        <AppScreen>
          {hideSpoilers && latestShow && latestEdition ? (
            <AppCard tone="accent" className="solaris-app-result-hero">
              <p className="solaris-app-result-kicker">Latest result</p>
              <h2>Results are available</h2>
              <p>{editionLabel(latestEdition)} · {latestShow.name}</p>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                Spoiler-free mode is on. Winner and score previews stay hidden until you open the result.
              </p>
              <Link
                to="/shows/$showId"
                params={{ showId: latestShow.id }}
                search={{ from: "results" }}
                className="solaris-app-primary-action mt-4"
              >
                Reveal official result
              </Link>
            </AppCard>
          ) : latestShow && latestEdition && winner && winnerRow ? (
            <AppCard tone="accent" className="solaris-app-result-hero">
              <p className="solaris-app-result-kicker">Latest published result</p>
              <p className="text-xs text-muted-foreground">{editionLabel(latestEdition)} · {latestShow.name}</p>
              <div className="mt-3 flex min-w-0 items-center gap-3">
                <FlagChip
                  code={winner.short_code}
                  color={winner.accent_color}
                  image={winner.flag_image}
                  size="lg"
                />
                <div className="min-w-0">
                  <h2 className="truncate text-xl font-bold">{winner.name}</h2>
                  <p className="numeric mt-1 text-sm text-muted-foreground">{winnerRow.total_points} points</p>
                </div>
              </div>
              <Link
                to="/shows/$showId"
                params={{ showId: latestShow.id }}
                search={{ from: "results" }}
                className="solaris-app-primary-action mt-4"
              >
                Open full result
              </Link>
            </AppCard>
          ) : (
            <PublicDataState
              kind="empty"
              title="No public result yet"
              description="The newest result will appear here automatically when a show publishes its ranking."
              compact
            />
          )}

          <section aria-labelledby="app-results-explore">
            <AppSectionHeader
              eyebrow="Explore results"
              title="Results & insights"
              id="app-results-explore"
            />
            <AppGroupedList>
              {appDestinations.map((item) => {
                const Icon = item.icon;
                return (
                  <Link key={item.to} to={item.to as any} className="solaris-app-list-row">
                    <span className="solaris-app-list-icon"><Icon className="size-4" aria-hidden="true" /></span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold">{item.title}</span>
                      <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{item.description}</span>
                    </span>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  </Link>
                );
              })}
            </AppGroupedList>
          </section>

          {!hideSpoilers && latestRows.length > 0 ? (
            <section aria-labelledby="app-results-top-five">
              <AppSectionHeader
                eyebrow="Latest scoreboard"
                title="Top five"
                id="app-results-top-five"
              />
              <AppGroupedList>
                {latestRows.slice(0, 5).map((row, index) => {
                  const country = displayMap.get(row.country_id);
                  if (!country) return null;
                  return (
                    <div key={row.id} className="solaris-app-score-row">
                      <span className="numeric text-xs text-muted-foreground">#{row.final_rank ?? index + 1}</span>
                      <FlagChip code={country.short_code} color={country.accent_color} image={country.flag_image} size="sm" />
                      <span className="min-w-0 truncate text-sm font-semibold">{country.name}</span>
                      <span className="numeric text-sm font-bold">{row.total_points}</span>
                    </div>
                  );
                })}
              </AppGroupedList>
            </section>
          ) : null}
        </AppScreen>
      </AppShell>
    );
  }

  return (
    <AppShell>
      {!isAppMode ? (
        <PublicHubHero
          eyebrow="Results"
          title="Results"
          description="Start with the official result, then move into scorecharts, analysis or specialist tools only when you need them."
        />
      ) : null}

      {hideSpoilers && latestShow && latestEdition ? (
        <Panel
          title="Results are available"
          description={`${editionLabel(latestEdition)} · ${latestShow.name}`}
          actions={
            <Link
              to="/shows/$showId"
              params={{ showId: latestShow.id }}
              search={{ from: "results" }}
              className="text-xs font-semibold text-primary"
            >
              Reveal official result →
            </Link>
          }
        >
          <div className="flex items-start gap-3 rounded-2xl border border-primary/20 bg-primary/[0.05] p-4">
            <Trophy className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
            <div>
              <p className="text-sm font-semibold">Spoiler-free mode is on</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Winner, ranking and score previews stay hidden until you deliberately open the result.
              </p>
            </div>
          </div>
        </Panel>
      ) : latestShow && latestEdition && winner && winnerRow ? (
        <section className="mb-5 grid gap-4 lg:grid-cols-[1.15fr_.85fr]">
          <Panel
            title="Latest published result"
            description={`${editionLabel(latestEdition)} · ${latestShow.name}`}
            actions={
              <Link
                to="/shows/$showId"
                params={{ showId: latestShow.id }}
                className="text-xs font-semibold text-primary"
              >
                Open full result →
              </Link>
            }
          >
            <div className="rounded-2xl border border-primary/20 bg-primary/[0.055] p-4 sm:p-5">
              <div className="flex min-w-0 items-center gap-4">
                <FlagChip
                  code={winner.short_code}
                  color={winner.accent_color}
                  image={winner.flag_image}
                  size="xl"
                />
                <div className="min-w-0">
                  <p className="text-[9px] font-black uppercase tracking-[0.16em] text-primary">Winner</p>
                  <h2 className="mt-1 truncate font-display text-2xl font-bold">{winner.name}</h2>
                  <p className="numeric mt-1 text-sm text-muted-foreground">{winnerRow.total_points} points</p>
                </div>
              </div>
              {margin != null && (
                <p className="mt-4 border-t border-border/55 pt-3 text-xs leading-relaxed text-muted-foreground">
                  {margin <= 5
                    ? `Only ${margin} point${margin === 1 ? "" : "s"} separated first and second. That was genuinely close.`
                    : `${margin} points separated first and second.`}
                </p>
              )}
            </div>
          </Panel>

          <Panel title="What can I inspect?" description="Pick the view that answers your question">
            <div className="grid grid-cols-2 gap-3">
              <StatTile label="Entries ranked" value={latestRows.length} />
              <StatTile
                label="Detailed voting"
                value={publication?.detailed_voting ? "Yes" : "No"}
              />
              <StatTile label="Jury" value={publication?.jury_results ? "Public" : "Hidden"} />
              <StatTile label="Televote" value={publication?.televote_results ? "Public" : "Hidden"} />
            </div>
          </Panel>
        </section>
      ) : (
        <div className="mb-5">
          <PublicDataState
            kind="empty"
            title="No public result yet"
            description="The newest result will appear here automatically when a show publishes its ranking."
            compact
          />
        </div>
      )}

      <section className="public-hub-section" aria-labelledby="results-browse-title">
        <div className="public-hub-section-heading">
          <p className="public-hub-eyebrow">Browse results</p>
          <h2 id="results-browse-title">Start with the answer</h2>
        </div>
        <PublicDestinationGrid columns={2}>
          <PublicPrimaryAction
            to={latestShow ? `/shows/${latestShow.id}?from=results` : "/editions"}
            icon={Trophy}
            eyebrow="Official result"
            title="Latest result"
            description="Open the newest published ranking and the result views available for that show."
          />
          <PublicPrimaryAction
            to="/scorecharts"
            icon={Table2}
            eyebrow="Detailed voting"
            title="Full scorecharts"
            description="See published jury ballots, points and voting breakdowns."
          />
        </PublicDestinationGrid>
      </section>

      <PublicSecondaryLinks
        eyebrow="Understand the result"
        title="Why did it happen?"
        items={[
          {
            to: "/analysis",
            icon: BarChart3,
            title: "Analysis",
            description: "Read voting splits, result patterns and contest statistics.",
          },
          {
            to: "/records",
            icon: Trophy,
            title: "Records",
            description: "Explore all-time records, milestones and historical extremes.",
          },
          {
            to: "/relationships",
            icon: GitCompareArrows,
            title: "Voting relationships",
            description: "See countries that repeatedly support or resemble one another.",
          },
        ]}
      />

      <PublicAdvancedDisclosure
        label="More result tools"
        description="Compare, simulate, predict, replay or explore your personal voting taste."
      >
        <PublicDestinationGrid columns={3}>
          <PublicPrimaryAction
            to="/compare"
            icon={GitCompareArrows}
            title="Compare countries"
            description="Put two delegations side by side across their SSC history."
          />
          <PublicPrimaryAction
            to="/result-lab"
            icon={Beaker}
            title="Result Lab"
            description="Test different jury and televote scenarios without changing the official result."
          />
          <PublicPrimaryAction
            to="/predictions"
            icon={Trophy}
            title="Predictions"
            description="Build and revisit predictions for available contest rounds."
          />
          <PublicPrimaryAction
            to="/taste-dna"
            icon={BarChart3}
            eyebrow="Taste DNA"
            title="Explore your voting taste"
            description="Compare your ranking with published voting groups and results."
          />
          <PublicPrimaryAction
            to="/broadcast-intelligence"
            icon={Table2}
            eyebrow="Broadcast Intelligence"
            title="Replay the voting"
            description="Replay the biggest lead changes and result turning points."
          />
        </PublicDestinationGrid>
      </PublicAdvancedDisclosure>

      {!hideSpoilers && latestShow && latestRows.length > 0 && (
        <Panel
          title="Latest top five"
          description="A quick overview before opening the full scoreboard"
          actions={
            <Link
              to="/shows/$showId"
              params={{ showId: latestShow.id }}
              search={{ from: "results" }}
              className="inline-flex items-center gap-1 text-xs font-semibold text-primary"
            >
              Full result <ArrowRight className="size-3.5" />
            </Link>
          }
        >
          <div className="divide-y divide-border/60">
            {latestRows.slice(0, 5).map((row, index) => {
              const country = displayMap.get(row.country_id);
              if (!country) return null;
              return (
                <div
                  key={row.id}
                  className="grid grid-cols-[34px_40px_minmax(0,1fr)_auto] items-center gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <span className="numeric text-xs text-muted-foreground">#{row.final_rank ?? index + 1}</span>
                  <FlagChip
                    code={country.short_code}
                    color={country.accent_color}
                    image={country.flag_image}
                    size="sm"
                  />
                  <span className="truncate text-sm font-semibold">{country.name}</span>
                  <span className="numeric text-sm font-bold">{row.total_points}</span>
                </div>
              );
            })}
          </div>
        </Panel>
      )}

    </AppShell>
  );
}
