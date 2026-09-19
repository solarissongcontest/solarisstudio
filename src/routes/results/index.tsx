import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, BarChart3, Beaker, GitCompareArrows, Table2, Trophy } from "lucide-react";
import { useMemo } from "react";

import { AppShell, PageHeader, Panel, StatTile } from "@/components/AppShell";
import { ArchiveDataError, ArchiveDataLoading, archiveHasError, archiveIsLoading } from "@/components/ArchiveDataState";
import { FlagChip } from "@/components/FlagChip";
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
        .filter((show) => isShowPublic(show) && resolveShowPublication(show).results)
        .sort((a, b) => {
          const aEdition = editionMap.get(a.edition_id)?.edition_number ?? -1;
          const bEdition = editionMap.get(b.edition_id)?.edition_number ?? -1;
          if (aEdition !== bEdition) return bEdition - aEdition;
          if (a.kind === "grand-final" || a.kind === "final") return -1;
          if (b.kind === "grand-final" || b.kind === "final") return 1;
          return b.sort_order - a.sort_order;
        }),
    [shows, editionMap],
  );

  const latestShow = resultShows[0] ?? null;
  const latestEdition = latestShow ? editionMap.get(latestShow.edition_id) ?? null : null;
  const latestRows = latestShow
    ? competingResults
        .filter((row) => row.show_id === latestShow.id && row.final_rank != null)
        .sort((a, b) => (a.final_rank ?? 999) - (b.final_rank ?? 999))
    : [];
  const winnerRow = latestRows[0] ?? null;
  const runnerUp = latestRows[1] ?? null;
  const winner = winnerRow ? displayMap.get(winnerRow.country_id) ?? null : null;
  const margin = winnerRow && runnerUp ? winnerRow.total_points - runnerUp.total_points : null;
  const publication = latestShow ? resolveShowPublication(latestShow) : null;
  const archiveQueries = [editionsQuery, showsQuery, resultsQuery, participantsQuery, countriesQuery, entitiesQuery];

  if (archiveIsLoading(...archiveQueries)) return <AppShell><PageHeader eyebrow="Results overview" title="Results" description="Published rankings, voting splits and scorecharts." /><ArchiveDataLoading label="Loading published results…" /></AppShell>;
  if (archiveHasError(...archiveQueries)) return <AppShell><PageHeader eyebrow="Results overview" title="Results" description="Published rankings, voting splits and scorecharts." /><ArchiveDataError /></AppShell>;

  return (
    <AppShell>
      <PageHeader
        eyebrow="Results overview"
        title="Results"
        description="Start with the result itself, then choose how deep you want to go. Overall is the final ranking, Jury vs Televote compares the two voting halves, and Full Scorecharts show individual voting where published."
      />

      {latestShow && latestEdition && winner && winnerRow ? (
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
        <Panel className="mb-5">
          <p className="text-sm text-muted-foreground">
            No public result is available yet. As soon as a show publishes results, the newest one will appear here automatically.
          </p>
        </Panel>
      )}

      <section className="mb-6" aria-labelledby="results-browse-title">
        <div className="mb-3 border-b border-border/60 pb-3">
          <p className="text-[9px] font-black uppercase tracking-[0.18em] text-primary">Start here</p>
          <h2 id="results-browse-title" className="mt-1 font-display text-xl font-bold sm:text-2xl">
            Browse results
          </h2>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground">
            Open the result itself or inspect the detailed scorechart. The specialist tools come after the basic answer, as nature intended.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <ResultPath
            to={latestShow ? `/shows/${latestShow.id}` : "/editions"}
            icon={Trophy}
            title="Latest result"
            description="Open the newest published ranking and the result views available for that show."
          />
          <ResultPath
            to="/scorecharts"
            icon={Table2}
            title="Full scorecharts"
            description="See detailed published jury voting and point-by-point breakdowns."
          />
        </div>
      </section>

      <section className="mb-6" aria-labelledby="results-understand-title">
        <div className="mb-3 border-b border-border/60 pb-3">
          <p className="text-[9px] font-black uppercase tracking-[0.18em] text-muted-foreground">
            Understand the result
          </p>
          <h2 id="results-understand-title" className="mt-1 font-display text-xl font-bold">
            Why did it happen?
          </h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <ResultPath
            to="/analysis"
            icon={BarChart3}
            title="Analysis"
            description="Read voting splits, result patterns and contest statistics."
          />
          <ResultPath
            to="/records"
            icon={Trophy}
            title="Records"
            description="Explore all-time records, milestones and historical extremes."
          />
          <ResultPath
            to="/relationships"
            icon={GitCompareArrows}
            title="Voting relationships"
            description="See countries that repeatedly support or resemble one another."
          />
        </div>
      </section>

      <section className="mb-6" aria-labelledby="results-experiment-title">
        <div className="mb-3 border-b border-border/60 pb-3">
          <p className="text-[9px] font-black uppercase tracking-[0.18em] text-muted-foreground">
            Explore further
          </p>
          <h2 id="results-experiment-title" className="mt-1 font-display text-xl font-bold">
            Experiment, compare and replay
          </h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <ResultPath
            to="/compare"
            icon={GitCompareArrows}
            title="Compare countries"
            description="Put two delegations side by side across their SSC history."
          />
          <ResultPath
            to="/result-lab"
            icon={Beaker}
            title="Result Lab"
            description="Test different jury and televote scenarios without changing the official result."
          />
          <ResultPath
            to="/predictions"
            icon={Trophy}
            title="Predictions"
            description="Build and revisit predictions for available contest rounds."
          />
          <ResultPath
            to="/taste-dna"
            icon={BarChart3}
            title="Explore your voting taste"
            description="Taste DNA compares your ranking with published voting groups and results."
          />
          <ResultPath
            to="/broadcast-intelligence"
            icon={Table2}
            title="Replay the voting"
            description="Broadcast Intelligence replays the biggest lead changes and result turning points."
          />
        </div>
      </section>

      {latestShow && latestRows.length > 0 && (
        <Panel
          title="Latest top five"
          description="A quick overview before opening the full scoreboard"
          actions={
            <Link
              to="/shows/$showId"
              params={{ showId: latestShow.id }}
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

function ResultPath({
  to,
  icon: Icon,
  title,
  description,
}: {
  to: string;
  icon: typeof Trophy;
  title: string;
  description: string;
}) {
  return (
    <Link
      to={to as any}
      className="group rounded-2xl border border-border/70 bg-surface/70 p-4 transition hover:border-primary/30 hover:bg-surface-strong"
    >
      <span className="grid size-9 place-items-center rounded-xl border border-primary/15 bg-primary/[0.08] text-primary">
        <Icon className="size-4" />
      </span>
      <h3 className="mt-3 text-sm font-semibold">{title}</h3>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>
      <span className="mt-3 inline-flex items-center gap-1 text-[10px] font-semibold text-primary">
        Open <ArrowRight className="size-3" />
      </span>
    </Link>
  );
}
