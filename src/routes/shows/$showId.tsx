import { createFileRoute, Link } from "@tanstack/react-router";

import { useEffect, useMemo, useState } from "react";

import { AppShell, PageHeader, Panel, StatTile } from "@/components/AppShell";
import { FlagChip } from "@/components/FlagChip";
import { FollowButton } from "@/components/FollowButton";
import { JuryTelevoteComparison } from "@/components/JuryTelevoteComparison";
import { RadialPointsView } from "@/components/RadialPointsView";
import { ResponsiveTabs, type ResponsiveTabOption } from "@/components/ResponsiveTabs";
import { ScoreboardStage } from "@/components/ScoreboardStage";
import { StoryCards } from "@/components/StoryCards";
import { VotingMatrix } from "@/components/VotingMatrix";

import {
  useContestEntities,
  useAllResults,
  useAllShows,
  useCountries,
  useJuryVotes,
  useResults,
  useShow,
  useShowParticipants,
  useShowVoters,
  useTelevotes,
  useThemes,
} from "@/lib/data";
import { entityDisplayMap } from "@/lib/entities";
import { isShowPublic, resolveShowPublication } from "@/lib/publication";
import { resolveTheme } from "@/lib/theme";
import { resolveVoting } from "@/lib/voting";
import type { Standing } from "@/lib/analysis";
import { buildShowStories } from "@/lib/stories";

type Tab = "stories" | "scoreboard" | "points" | "split" | "matrix" | "lineup";

const TAB_VALUES = new Set<Tab>(["stories", "scoreboard", "points", "split", "matrix", "lineup"]);

type ShowSearch = {
  tab?: Tab;
  story?: string;
};

export const Route = createFileRoute("/shows/$showId")({
  head: () => ({
    meta: [{ title: "Show — Solaris Song Contest" }],
  }),
  validateSearch: (search: Record<string, unknown>): ShowSearch => {
    const validated: ShowSearch = {};

    if (typeof search.tab === "string" && TAB_VALUES.has(search.tab as Tab)) {
      validated.tab = search.tab as Tab;
    }

    if (typeof search.story === "string") {
      validated.story = search.story;
    }

    return validated;
  },
  component: ShowPage,
});

function ShowPage() {
  const { showId } = Route.useParams();
  const search = Route.useSearch();
  const { data: show, isLoading } = useShow(showId);
  const { data: participants } = useShowParticipants(showId);
  const { data: archivedResults } = useResults(showId);
  const { data: jury } = useJuryVotes(showId);
  const { data: tele } = useTelevotes(showId);
  const { data: voters } = useShowVoters(showId);
  const { data: countries } = useCountries();
  const { data: allResults } = useAllResults();
  const { data: allShows } = useAllShows();
  const { data: themes } = useThemes();
  const { data: entities } = useContestEntities(show?.edition_id);

  const publication = useMemo(
    () => resolveShowPublication(show),
    [show?.published, show?.publication_config],
  );

  const showIsPublic = isShowPublic(show);
  const displayMap = useMemo(() => entityDisplayMap(entities, countries), [entities, countries]);
  const participantMap = useMemo(
    () => new Map((participants ?? []).map((participant) => [participant.country_id, participant])),
    [participants],
  );
  const theme = useMemo(
    () => resolveTheme((themes ?? []).find((item) => item.id === show?.theme_id)?.config),
    [themes, show?.theme_id],
  );

  const publicTheme = useMemo(
    () => ({
      ...theme,
      layout: {
        ...theme.layout,
        showArtist: theme.layout.showArtist && (publication.artists || publication.songs),
        showSplit: theme.layout.showSplit && publication.jury_results && publication.televote_results,
      },
    }),
    [
      theme,
      publication.artists,
      publication.songs,
      publication.jury_results,
      publication.televote_results,
    ],
  );

  const voting = useMemo(() => resolveVoting(show?.voting_config), [show?.voting_config]);

  const stories = useMemo(
    () =>
      show
        ? buildShowStories({
            show,
            results: archivedResults ?? [],
            jury: jury ?? [],
            labels: new Map([...displayMap.entries()].map(([id, display]) => [id, display.name])),
            allResults: allResults ?? [],
            allShows: allShows ?? [],
          })
        : [],
    [show, archivedResults, jury, displayMap, allResults, allShows],
  );

  const standings = useMemo<Standing[]>(
    () =>
      (archivedResults ?? [])
        .filter((result) => result.final_rank != null)
        .sort((a, b) => (a.final_rank ?? 999) - (b.final_rank ?? 999))
        .map((result) => ({
          countryId: result.country_id,
          jury: publication.jury_results ? result.jury_points : 0,
          televote: publication.televote_results ? result.televote_points : 0,
          total: publication.results ? result.total_points : 0,
          rank: result.final_rank ?? 0,
          topPoints: 0,
        })),
    [archivedResults, publication.results, publication.jury_results, publication.televote_results],
  );

  const tabOptions = useMemo<ResponsiveTabOption<Tab>[]>(() => {
    const options: ResponsiveTabOption<Tab>[] = [];

    // Beta feedback repeatedly asked for Jury / Televote / Overall to be
    // immediately understandable. Keep result views first and label the
    // combined scoreboard by what it actually represents.
    if (publication.results) {
      options.push({ value: "scoreboard", label: "Overall results" });
    }

    if (publication.jury_results || publication.televote_results) {
      options.push({ value: "split", label: "Jury / Televote" });
    }

    if (publication.results && stories.length) {
      options.push({ value: "stories", label: "Result stories" });
    }

    if (publication.detailed_voting) {
      options.push({ value: "points", label: "Detailed points" });
      options.push({ value: "matrix", label: "Voting matrix" });
    }

    if (publication.participants) {
      options.push({
        value: "lineup",
        label: publication.running_order ? "Running order" : "Line-up",
      });
    }

    return options;
  }, [publication, stories.length]);

  const defaultTab: Tab = publication.results ? "scoreboard" : "lineup";
  const [tab, setTab] = useState<Tab>(search.story ? "stories" : (search.tab ?? defaultTab));

  useEffect(() => {
    if (search.story) {
      setTab("stories");
    } else if (search.tab) {
      setTab(search.tab);
    }
  }, [search.story, search.tab]);

  useEffect(() => {
    if (!search.story || tab !== "stories") return;

    window.requestAnimationFrame(() => {
      document.getElementById(`story-${search.story}`)?.scrollIntoView({ block: "center" });
    });
  }, [search.story, tab, stories.length]);

  useEffect(() => {
    if (!tabOptions.length) return;

    const valid = tabOptions.some((option) => option.value === tab);
    if (!valid) setTab(tabOptions[0].value);
  }, [tab, tabOptions]);

  if (isLoading) {
    return (
      <AppShell>
        <p className="text-sm text-muted-foreground">Loading show…</p>
      </AppShell>
    );
  }

  if (!show) {
    return (
      <AppShell>
        <PageHeader title="Show unavailable" />
        <Link to="/editions" className="text-sm text-primary">← Editions</Link>
      </AppShell>
    );
  }

  if (!showIsPublic) {
    return (
      <AppShell>
        <div className="mx-auto max-w-2xl py-12">
          <Panel>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">
              Solaris Song Contest
            </p>
            <h1 className="mt-2 font-display text-3xl font-bold">{show.name}</h1>
            <p className="mt-3 text-sm text-muted-foreground">This show has not been published yet.</p>
            <Link to="/editions" className="mt-5 inline-flex text-sm font-semibold text-primary">
              ← Back to editions
            </Link>
          </Panel>
        </div>
      </AppShell>
    );
  }

  const winnerStanding = publication.results
    ? (standings.find((standing) => standing.rank === 1) ?? standings[0] ?? null)
    : null;
  const winner = winnerStanding ? (displayMap.get(winnerStanding.countryId) ?? null) : null;
  const juryTotal = publication.jury_results
    ? standings.reduce((total, row) => total + row.jury, 0)
    : null;
  const televoteTotal = publication.televote_results
    ? standings.reduce((total, row) => total + row.televote, 0)
    : null;

  return (
    <AppShell>
      <PageHeader
        eyebrow={show.kind.replace("-", " ")}
        title={show.name}
        description={
          winner && winnerStanding && publication.results
            ? `${winner.name} won with ${winnerStanding.total} points.`
            : publication.participants
              ? "Entries and show information."
              : "Published show information."
        }
        actions={
          <div className="flex flex-wrap justify-end gap-2">
            <FollowButton entityType="show" entityId={show.id} label={show.name} />
            <Link to="/editions" className="rounded-xl border border-border px-4 py-2.5 text-sm">
              ← Editions
            </Link>
          </div>
        }
      />

      <Panel className="mb-5">
        <div className="grid grid-cols-2 gap-5 sm:grid-cols-4">
          {publication.participants && <StatTile label="Entries" value={participants?.length ?? 0} />}
          {publication.results && <StatTile label="Results" value={standings.length} />}
          {publication.jury_results && <StatTile label="Jury points" value={juryTotal ?? 0} />}
          {publication.televote_results && <StatTile label="Televote points" value={televoteTotal ?? 0} />}
        </div>
      </Panel>

      {publication.results && !standings.length && (
        <Panel className="mb-5">
          <p className="text-sm text-muted-foreground">
            Results are public, but no saved result archive exists for this show yet. Save the show
            results once in Studio and they will appear here.
          </p>
        </Panel>
      )}

      {!!tabOptions.length && (
        <div className="mb-5 space-y-2">
          {(publication.results || publication.jury_results || publication.televote_results) && (
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Switch result view
            </p>
          )}
          <ResponsiveTabs value={tab} options={tabOptions} onChange={setTab} label="Show view" />
        </div>
      )}

      {tab === "stories" && publication.results && (
        <Panel
          title="Story of the result"
          description="Every statement below is generated from the archived scoreboard and links to an exact, reproducible metric."
        >
          {stories.length ? (
            <StoryCards stories={stories} selectedStory={search.story} />
          ) : (
            <p className="text-sm text-muted-foreground">
              There is not enough archived result data to build stories for this show yet.
            </p>
          )}
        </Panel>
      )}

      {tab === "scoreboard" && publication.results && (
        <>
          <Panel
            className="mb-4"
            title="Overall results"
            description="Final combined ranking. Use Jury / Televote above to compare the two voting components."
          />
          {standings.length ? (
            <ScoreboardStage
              theme={publicTheme}
              standings={standings}
              countries={displayMap}
              participants={participantMap}
              qualifiers={publication.qualifiers ? show.qualifier_count : null}
            />
          ) : (
            <Panel><p className="text-sm text-muted-foreground">Results are not available yet.</p></Panel>
          )}
        </>
      )}

      {tab === "points" && publication.detailed_voting && (
        <RadialPointsView
          participants={participants ?? []}
          countries={displayMap}
          jury={jury ?? []}
          televote={tele ?? []}
          voters={voters}
        />
      )}

      {tab === "split" && (publication.jury_results || publication.televote_results) && (
        <>
          {publication.jury_results && publication.televote_results ? (
            <JuryTelevoteComparison standings={standings} countries={displayMap} />
          ) : (
            <Panel title={publication.jury_results ? "Jury results" : "Televote results"}>
              <div className="divide-y divide-border/60">
                {standings.map((standing) => {
                  const country = displayMap.get(standing.countryId);
                  if (!country) return null;

                  const points = publication.jury_results ? standing.jury : standing.televote;
                  return (
                    <div
                      key={standing.countryId}
                      className="grid grid-cols-[42px_1fr_auto] items-center gap-3 py-3"
                    >
                      <FlagChip
                        code={country.short_code}
                        color={country.accent_color}
                        image={country.flag_image}
                        size="sm"
                      />
                      <span className="truncate text-sm font-semibold">{country.name}</span>
                      <span className="numeric text-sm font-bold">{points}</span>
                    </div>
                  );
                })}
              </div>
            </Panel>
          )}
        </>
      )}

      {tab === "matrix" && publication.detailed_voting && (
        <Panel title="Voting matrix" description="Rows receive points, columns give them.">
          <VotingMatrix
            votes={jury ?? []}
            countries={displayMap}
            order={(participants ?? []).map((participant) => participant.country_id)}
            topPoint={voting.juryPoints[0] ?? 12}
            voters={voters}
          />
        </Panel>
      )}

      {tab === "lineup" && publication.participants && (
        <Panel title={publication.running_order ? "Running order" : "Line-up"}>
          <div className="divide-y divide-border/60">
            {(participants ?? []).map((participant, index) => {
              const country = displayMap.get(participant.country_id);
              if (!country) return null;

              return (
                <div
                  key={participant.id}
                  className="grid grid-cols-[40px_42px_1fr_auto] items-center gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <span className="numeric text-sm text-muted-foreground">
                    {publication.running_order ? (participant.running_order ?? "—") : index + 1}
                  </span>
                  <FlagChip
                    code={country.short_code}
                    color={country.accent_color}
                    image={country.flag_image}
                    size="sm"
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{country.name}</p>
                    {(publication.artists || publication.songs) && (
                      <p className="mt-1 truncate text-[11px] text-muted-foreground">
                        {[
                          publication.artists ? participant.artist : null,
                          publication.songs ? participant.song : null,
                        ]
                          .filter(Boolean)
                          .join(" · ") || "Entry details not announced"}
                      </p>
                    )}
                    {publication.semi_split && participant.semi_final && (
                      <p className="mt-1 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                        {participant.semi_final}
                      </p>
                    )}
                  </div>

                  {publication.qualifiers && participant.qualified != null && (
                    <span
                      className={
                        participant.qualified
                          ? "rounded-full bg-primary/10 px-2 py-1 text-[10px] font-semibold uppercase text-primary"
                          : "rounded-full bg-surface px-2 py-1 text-[10px] font-semibold uppercase text-muted-foreground"
                      }
                    >
                      {participant.qualified ? "Qualified" : "Not qualified"}
                    </span>
                  )}
                </div>
              );
            })}

            {!(participants ?? []).length && (
              <p className="py-4 text-sm text-muted-foreground">No entries have been published.</p>
            )}
          </div>
        </Panel>
      )}
    </AppShell>
  );
}
