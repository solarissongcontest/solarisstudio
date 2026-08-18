import { createFileRoute, Link } from "@tanstack/react-router";

import { AppShell, Panel, StatTile } from "@/components/AppShell";

import { FlagChip } from "@/components/FlagChip";

import { FollowButton } from "@/components/FollowButton";

import { StoryCards } from "@/components/StoryCards";

import {
  editionLabel,
  useAllResults,
  useAllShows,
  useContestEntities,
  useCountries,
  useEdition,
  useParticipants,
  useShows,
} from "@/lib/data";

import { entityDisplayMap, type EntityDisplay } from "@/lib/entities";

import { isShowPublic, resolveShowPublication } from "@/lib/publication";

import { buildShowStories } from "@/lib/stories";

export const Route = createFileRoute("/editions/$slug")({
  head: ({ params }) => ({
    meta: [
      {
        title: `${params.slug} — Solaris Song Contest`,
      },
    ],
  }),

  component: EditionPage,
});

function EditionPage() {
  const { slug } = Route.useParams();

  const { data: edition, isLoading } = useEdition(slug);

  const { data: shows } = useShows(edition?.id);

  const { data: participants } = useParticipants(edition?.id);

  const { data: countries } = useCountries();

  const { data: entities } = useContestEntities(edition?.id);

  const { data: allResults } = useAllResults();

  const { data: allShows } = useAllShows();

  if (isLoading) {
    return (
      <AppShell>
        <p className="text-sm text-muted-foreground">Loading edition…</p>
      </AppShell>
    );
  }

  if (!edition) {
    return (
      <AppShell>
        <div className="glass p-6">
          <h1 className="font-display text-2xl font-bold">Edition not found</h1>

          <Link to="/editions" className="mt-4 inline-block text-sm text-primary">
            ← Editions
          </Link>
        </div>
      </AppShell>
    );
  }

  if (!edition.published) {
    return (
      <AppShell>
        <div className="mx-auto max-w-2xl py-12">
          <Panel>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">
              Solaris Song Contest
            </p>

            <h1 className="mt-2 font-display text-3xl font-bold">{editionLabel(edition)}</h1>

            <p className="mt-3 text-sm text-muted-foreground">
              This edition has not been published yet.
            </p>

            <Link to="/editions" className="mt-5 inline-flex text-sm font-semibold text-primary">
              ← Back to editions
            </Link>
          </Panel>
        </div>
      </AppShell>
    );
  }

  const showList = shows ?? [];

  const participantList = participants ?? [];

  const displayMap = entityDisplayMap(entities, countries);

  const resultList = (allResults ?? []).filter((result) => result.edition_id === edition.id);

  const publicShows = showList
    .filter((show) => isShowPublic(show))
    .sort((a, b) => a.sort_order - b.sort_order);

  const publishedParticipantRows = participantList.filter((participant) => {
    if (!participant.show_id) {
      return false;
    }

    const show = publicShows.find((item) => item.id === participant.show_id);

    if (!show) {
      return false;
    }

    return resolveShowPublication(show).participants;
  });

  const nationIds = [
    ...new Set(publishedParticipantRows.map((participant) => participant.country_id)),
  ];

  const participatingCountries = nationIds
    .map((id) => displayMap.get(id))
    .filter((country): country is EntityDisplay => !!country);

  const grandFinal =
    publicShows.find((show) => show.kind === "grand-final" || show.kind === "final") ?? null;

  const grandFinalPublication = grandFinal ? resolveShowPublication(grandFinal) : null;

  const finalResults =
    grandFinal && grandFinalPublication?.results
      ? resultList
          .filter((result) => result.show_id === grandFinal.id && result.final_rank != null)
          .sort((a, b) => (a.final_rank ?? 999) - (b.final_rank ?? 999))
      : [];

  const winnerResult =
    finalResults.find((result) => result.final_rank === 1) ?? finalResults[0] ?? null;

  const winner = winnerResult ? (displayMap.get(winnerResult.country_id) ?? null) : null;

  const juryWinnerResult =
    grandFinalPublication?.jury_results && finalResults.length
      ? [...finalResults].sort((a, b) => b.jury_points - a.jury_points)[0]
      : null;

  const juryWinner = juryWinnerResult
    ? (displayMap.get(juryWinnerResult.country_id) ?? null)
    : null;

  const teleWinnerResult =
    grandFinalPublication?.televote_results && finalResults.length
      ? [...finalResults].sort((a, b) => b.televote_points - a.televote_points)[0]
      : null;

  const teleWinner = teleWinnerResult
    ? (displayMap.get(teleWinnerResult.country_id) ?? null)
    : null;

  const semiFinals = publicShows.filter(
    (show) => show.kind === "semi-final" || show.kind === "semi",
  );

  const finalistCount =
    grandFinal && grandFinalPublication?.participants
      ? participantList.filter((participant) => participant.show_id === grandFinal.id).length
      : null;

  const editionStories = grandFinal
    ? buildShowStories({
        show: grandFinal,
        results: resultList,
        jury: [],
        labels: new Map([...displayMap.entries()].map(([id, display]) => [id, display.name])),
        allResults: allResults ?? [],
        allShows: allShows ?? [],
      })
    : [];

  return (
    <AppShell>
      <div className="space-y-5 sm:space-y-7">
        <div className="flex items-start justify-between gap-4">
          <Link
            to="/editions"
            className="text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            ← Editions
          </Link>
          <FollowButton entityType="edition" entityId={edition.id} label={editionLabel(edition)} />
        </div>

        <section className="relative overflow-hidden rounded-[2rem] border border-primary/20 bg-surface/80 shadow-2xl">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_82%_18%,rgb(var(--solaris-bg-primary)/0.18),transparent_42%),linear-gradient(145deg,rgb(var(--solaris-bg-deep-2)/0.94),rgb(var(--solaris-bg-deep)/0.88))]" />

          <div className="relative z-20 flex flex-col gap-10 p-5 sm:p-8 lg:p-10">
            <span className="w-fit rounded-full border border-primary/30 bg-primary/10 px-3 py-1.5 text-[9px] font-bold uppercase tracking-[0.18em] text-primary">
              {edition.status === "completed" ? "Completed edition" : "Current edition"}
            </span>

            <div className="max-w-3xl">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
                {edition.host_city ?? "Solaris Song Contest"}
              </p>

              <h1 className="mt-2 font-display text-5xl font-bold leading-[0.9] tracking-[-0.055em] text-white sm:text-7xl">
                {editionLabel(edition)}
              </h1>

              {edition.name !== editionLabel(edition) && (
                <p className="mt-3 text-lg font-medium text-white/80 sm:text-2xl">{edition.name}</p>
              )}

              {edition.description && (
                <p className="mt-4 max-w-xl text-sm leading-relaxed text-white/60">
                  {edition.description}
                </p>
              )}

              {winner && winnerResult && grandFinalPublication?.results && (
                <div className="mt-7 flex items-center gap-4">
                  <FlagChip
                    code={winner.short_code}
                    color={winner.accent_color}
                    image={winner.flag_image}
                    size="xl"
                  />

                  <div>
                    <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-white/50">
                      Winner
                    </p>

                    <p className="mt-1 font-display text-xl font-bold text-white">{winner.name}</p>

                    <p className="numeric mt-1 text-xs text-white/55">
                      {winnerResult.total_points} points
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        {edition.logo && (
          <section className="overflow-hidden rounded-[1.75rem] border border-primary/20 bg-surface/72 shadow-xl">
            <div className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-3 sm:px-5">
              <div>
                <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-primary">
                  Official artwork
                </p>
                <h2 className="mt-1 text-sm font-semibold text-foreground">{editionLabel(edition)}</h2>
              </div>
              <span className="text-[10px] text-muted-foreground">Shown uncropped</span>
            </div>

            <div className="grid place-items-center bg-black/10 p-3 sm:p-5 lg:p-6">
              <img
                src={edition.logo}
                alt={`${editionLabel(edition)} official artwork`}
                className="block h-auto max-h-[78vh] w-auto max-w-full rounded-xl object-contain"
                loading="eager"
                decoding="async"
              />
            </div>
          </section>
        )}

        <Panel>
          <div className="grid grid-cols-2 gap-5 sm:grid-cols-4">
            <StatTile
              label="Edition"
              value={edition.edition_number != null ? `SSC ${edition.edition_number}` : "—"}
            />

            <StatTile label="Countries" value={participatingCountries.length || "—"} />

            <StatTile label="Semi-finals" value={semiFinals.length || "—"} />

            <StatTile label="Finalists" value={finalistCount ?? "—"} />
          </div>
        </Panel>

        {grandFinalPublication?.results && !finalResults.length && (
          <Panel>
            <p className="text-sm text-muted-foreground">
              Grand Final results are not available in the public archive yet.
            </p>
          </Panel>
        )}

        {grandFinalPublication?.results && finalResults.length > 0 && (
          <section className="grid gap-5 lg:grid-cols-[.85fr_1.15fr]">
            <div className="glass relative overflow-hidden p-5">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">
                {editionLabel(edition)} winner
              </p>

              {winner && (
                <>
                  <div className="mt-5 flex items-center gap-4">
                    <FlagChip
                      code={winner.short_code}
                      color={winner.accent_color}
                      image={winner.flag_image}
                      size="xl"
                    />

                    <div>
                      <h2 className="font-display text-2xl font-bold">{winner.name}</h2>

                      <p className="numeric mt-1 text-sm text-muted-foreground">
                        {winnerResult?.total_points} points
                      </p>
                    </div>
                  </div>

                  {grandFinal && (
                    <Link
                      to="/shows/$showId"
                      params={{
                        showId: grandFinal.id,
                      }}
                      className="mt-6 inline-flex min-h-11 items-center rounded-xl bg-aurora px-4 text-sm font-semibold text-primary-foreground"
                    >
                      Grand Final results →
                    </Link>
                  )}
                </>
              )}
            </div>

            <Panel title={`${editionLabel(edition)} Grand Final`} description="Top five">
              <div className="divide-y divide-border/60">
                {finalResults.slice(0, 5).map((result, index) => {
                  const country = displayMap.get(result.country_id);

                  if (!country) {
                    return null;
                  }

                  const content = (
                    <>
                      <span className="numeric text-xs text-muted-foreground">
                        #{result.final_rank ?? index + 1}
                      </span>

                      <FlagChip
                        code={country.short_code}
                        color={country.accent_color}
                        image={country.flag_image}
                        size="sm"
                      />

                      <span className="truncate text-sm font-semibold">{country.name}</span>

                      <span className="numeric text-sm font-semibold">{result.total_points}</span>
                    </>
                  );

                  if (country.entityType === "global" && country.countryId) {
                    return (
                      <Link
                        key={result.id}
                        to="/countries/$code"
                        params={{
                          code: country.short_code,
                        }}
                        className="grid grid-cols-[32px_40px_1fr_auto] items-center gap-3 py-3"
                      >
                        {content}
                      </Link>
                    );
                  }

                  return (
                    <div
                      key={result.id}
                      className="grid grid-cols-[32px_40px_1fr_auto] items-center gap-3 py-3"
                    >
                      {content}
                    </div>
                  );
                })}
              </div>
            </Panel>
          </section>
        )}

        {grandFinalPublication?.results && editionStories.length > 0 && (
          <Panel
            title="Story of the result"
            description="The most important patterns found in the archived Grand Final result."
            actions={
              grandFinal ? (
                <Link
                  to="/shows/$showId"
                  params={{
                    showId: grandFinal.id,
                  }}
                  search={{
                    tab: "stories",
                  }}
                  className="text-xs font-semibold text-primary"
                >
                  View all →
                </Link>
              ) : null
            }
          >
            <StoryCards stories={editionStories} limit={3} />
          </Panel>
        )}

        {(juryWinner || teleWinner) && (
          <section>
            <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
              Voting highlights
            </p>

            <div className="grid gap-3 sm:grid-cols-2">
              {grandFinalPublication?.jury_results && juryWinner && juryWinnerResult && (
                <VotingWinner
                  label="Jury winner"
                  country={juryWinner}
                  points={juryWinnerResult.jury_points}
                />
              )}

              {grandFinalPublication?.televote_results && teleWinner && teleWinnerResult && (
                <VotingWinner
                  label="Televote winner"
                  country={teleWinner}
                  points={teleWinnerResult.televote_points}
                />
              )}
            </div>
          </section>
        )}

        {!!publicShows.length && (
          <section>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
              {editionLabel(edition)}
            </p>

            <h2 className="mt-1 font-display text-2xl font-bold">Shows</h2>

            <div className="mt-3 grid gap-3 md:grid-cols-2">
              {publicShows.map((show) => {
                const publication = resolveShowPublication(show);

                const line = publication.participants
                  ? participantList.filter((participant) => participant.show_id === show.id)
                  : [];

                const showResults = publication.results
                  ? resultList.filter(
                      (result) => result.show_id === show.id && result.final_rank != null,
                    )
                  : [];

                return (
                  <Link
                    key={show.id}
                    to="/shows/$showId"
                    params={{
                      showId: show.id,
                    }}
                    className="glass group block p-4 sm:p-5"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-primary">
                          {show.kind.replace("-", " ")}
                        </p>

                        <h3 className="mt-1 font-display text-lg font-bold">{show.name}</h3>

                        {publication.results && showResults.length ? (
                          <p className="mt-1 text-xs text-muted-foreground">Results available</p>
                        ) : publication.participants ? (
                          <p className="mt-1 text-xs text-muted-foreground">
                            {line.length} entries
                          </p>
                        ) : (
                          <p className="mt-1 text-xs text-muted-foreground">
                            Information published
                          </p>
                        )}
                      </div>

                      <span className="text-primary">→</span>
                    </div>

                    {publication.participants && !!line.length && (
                      <div className="mt-4 flex flex-wrap gap-1.5">
                        {line.slice(0, 14).map((participant) => {
                          const country = displayMap.get(participant.country_id);

                          return country ? (
                            <FlagChip
                              key={participant.id}
                              code={country.short_code}
                              color={country.accent_color}
                              image={country.flag_image}
                              size="sm"
                            />
                          ) : null;
                        })}
                      </div>
                    )}
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        {!!participatingCountries.length && (
          <section>
            <div className="flex items-end justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                  Delegations
                </p>

                <h2 className="mt-1 font-display text-2xl font-bold">Participating countries</h2>
              </div>
            </div>

            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {participatingCountries.map((country) => {
                const card = (
                  <div className="glass flex items-center gap-3 p-3">
                    <FlagChip
                      code={country.short_code}
                      color={country.accent_color}
                      image={country.flag_image}
                      size="md"
                    />

                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{country.name}</p>

                      <p className="mt-0.5 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                        {country.short_code}
                      </p>
                    </div>
                  </div>
                );

                if (country.entityType === "global" && country.countryId) {
                  return (
                    <Link
                      key={country.id}
                      to="/countries/$code"
                      params={{
                        code: country.short_code,
                      }}
                    >
                      {card}
                    </Link>
                  );
                }

                return <div key={country.id}>{card}</div>;
              })}
            </div>
          </section>
        )}

        {!publicShows.length && (
          <Panel>
            <p className="text-sm text-muted-foreground">
              No individual show information is available publicly for this edition yet.
            </p>
          </Panel>
        )}
      </div>
    </AppShell>
  );
}

function VotingWinner({
  label,
  country,
  points,
}: {
  label: string;
  country: EntityDisplay;
  points: number;
}) {
  return (
    <div className="glass flex items-center gap-4 p-4">
      <FlagChip
        code={country.short_code}
        color={country.accent_color}
        image={country.flag_image}
        size="lg"
      />

      <div className="min-w-0">
        <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-primary">{label}</p>

        <p className="mt-1 truncate font-display text-lg font-bold">{country.name}</p>

        <p className="numeric mt-1 text-xs text-muted-foreground">{points} points</p>
      </div>
    </div>
  );
}
