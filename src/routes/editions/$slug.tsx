import { createFileRoute, Link } from "@tanstack/react-router";
import { Clock3, Radio, Trophy, Vote } from "lucide-react";

import { AppShell, Panel } from "@/components/AppShell";
import { ArchiveDataError, ArchiveDataLoading, archiveHasError, archiveIsLoading } from "@/components/ArchiveDataState";
import { EntryListenLinks } from "@/components/EntryListenLinks";
import { FlagChip } from "@/components/FlagChip";
import { FollowButton } from "@/components/FollowButton";
import {
  EditionEmptyState,
  EditionHero,
  EditionNavigation,
  EditionQuickFacts,
  EditionSection,
} from "@/components/edition/EditionPublicPrimitives";
import { PublicCurrentStatus } from "@/components/public/PublicCurrentStatus";
import { PublicStatus } from "@/components/public/PublicStatus";
import { StoryCards } from "@/components/StoryCards";
import {
  editionLabel,
  useAllResults,
  useAllShows,
  useContestEntities,
  useCountries,
  useEdition,
  useShows,
} from "@/lib/data";
import { resolvePublicEditionState } from "@/lib/current-contest-state";
import { meaningfulEditionSubtitle, resolveEditionPublicStyle } from "@/lib/edition-public-design";
import { canonicalEditionEntries } from "@/lib/entry-utils";
import { entityDisplayMap, type EntityDisplay } from "@/lib/entities";
import { isShowPublic, resolveShowPublication } from "@/lib/publication";
import { usePublicEditionParticipants } from "@/lib/public-participants";
import { buildShowStories } from "@/lib/stories";

export const Route = createFileRoute("/editions/$slug")({
  head: ({ params }) => {
    const url = `https://studio.solaris-song-contest.workers.dev/editions/${encodeURIComponent(params.slug)}`;
    return {
      meta: [
        { title: `${params.slug} — Solaris Song Contest` },
        {
          name: "description",
          content: "Edition overview, participants, entries, shows and published Solaris Song Contest results.",
        },
      ],
      links: [{ rel: "canonical", href: url }],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              {
                "@type": "ListItem",
                position: 1,
                name: "Editions",
                item: "https://studio.solaris-song-contest.workers.dev/editions",
              },
              {
                "@type": "ListItem",
                position: 2,
                name: params.slug,
                item: url,
              },
            ],
          }),
        },
      ],
    };
  },
  component: EditionPage,
});

function EditionPage() {
  const { slug } = Route.useParams();
  const editionQuery = useEdition(slug);
  const { data: edition } = editionQuery;
  const showsQuery = useShows(edition?.id);
  const participantsQuery = usePublicEditionParticipants(edition?.id);
  const countriesQuery = useCountries();
  const entitiesQuery = useContestEntities(edition?.id);
  const resultsQuery = useAllResults();
  const allShowsQuery = useAllShows();
  const { data: shows } = showsQuery;
  const { data: participants } = participantsQuery;
  const { data: countries } = countriesQuery;
  const { data: entities } = entitiesQuery;
  const { data: allResults } = resultsQuery;
  const { data: allShows } = allShowsQuery;
  const archiveQueries = [editionQuery, showsQuery, participantsQuery, countriesQuery, entitiesQuery, resultsQuery, allShowsQuery];
  const liquidGlass = resolveEditionPublicStyle(edition?.theme_colors) === "glass";

  if (archiveIsLoading(...archiveQueries)) return <AppShell><ArchiveDataLoading label="Loading edition…" /></AppShell>;
  if (archiveHasError(...archiveQueries)) return <AppShell><ArchiveDataError /></AppShell>;

  if (!edition) {
    return (
      <AppShell>
        <div className="glass p-6">
          <h1 className="font-display text-2xl font-bold">Edition not found</h1>
          <Link to="/editions" className="mt-4 inline-block text-sm text-primary">← Editions</Link>
        </div>
      </AppShell>
    );
  }

  if (!edition.published) {
    return (
      <AppShell>
        <div className="mx-auto max-w-2xl py-12">
          <Panel>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">Solaris Song Contest</p>
            <h1 className="mt-2 font-display text-3xl font-bold">{editionLabel(edition)}</h1>
            <p className="mt-3 text-sm text-muted-foreground">This edition has not been published yet.</p>
            <Link to="/editions" className="mt-5 inline-flex text-sm font-semibold text-primary">← Back to editions</Link>
          </Panel>
        </div>
      </AppShell>
    );
  }

  const showList = shows ?? [];
  const participantList = participants ?? [];
  const displayMap = entityDisplayMap(entities, countries);
  const resultList = (allResults ?? []).filter((result) => result.edition_id === edition.id);
  const editionState = resolvePublicEditionState({
    edition,
    shows: showList,
    results: resultList,
  });
  const editionStatusIcon =
    editionState.phase === "live"
      ? Radio
      : editionState.phase === "voting" || editionState.phase === "jury_voting"
        ? Vote
        : editionState.phase === "results_published" || editionState.phase === "post_edition"
          ? Trophy
          : Clock3;
  const editionStatusTone =
    editionState.phase === "live" ||
    editionState.phase === "voting" ||
    editionState.phase === "jury_voting"
      ? "active"
      : editionState.phase === "results_pending"
        ? "attention"
        : editionState.phase === "results_published" || editionState.phase === "post_edition"
          ? "complete"
          : "neutral";
  const publicShows = showList
    .filter((show) => isShowPublic(show))
    .sort((a, b) => a.sort_order - b.sort_order);

  const publishedParticipantRows = participantList.filter((participant) => {
    if (!participant.show_id) return false;
    const show = publicShows.find((item) => item.id === participant.show_id);
    return Boolean(show && resolveShowPublication(show).participants);
  });

  // The public-safe participant projection already redacts unrevealed artist,
  // song and listening-link data. Keep the listening section limited to rows
  // whose song has genuinely cleared that entry-level reveal gate.
  const publicEntryIds = new Set(publishedParticipantRows.map((participant) => participant.country_id));
  const publicEntries = canonicalEditionEntries(
    participantList.filter((participant) => publicEntryIds.has(participant.country_id)),
  )
    .filter((entry) => Boolean(entry.song?.trim()))
    .sort((a, b) => {
      const aName = displayMap.get(a.country_id)?.name ?? "";
      const bName = displayMap.get(b.country_id)?.name ?? "";
      return aName.localeCompare(bName);
    });

  const nationIds = [...new Set(publishedParticipantRows.map((participant) => participant.country_id))];
  const participatingCountries = nationIds
    .map((id) => displayMap.get(id))
    .filter((country): country is EntityDisplay => !!country);

  const grandFinal = publicShows.find((show) => show.kind === "grand-final" || show.kind === "final") ?? null;
  const grandFinalPublication = grandFinal ? resolveShowPublication(grandFinal) : null;
  const finalResults =
    grandFinal && grandFinalPublication?.results
      ? resultList
          .filter((result) => result.show_id === grandFinal.id && result.final_rank != null)
          .sort((a, b) => (a.final_rank ?? 999) - (b.final_rank ?? 999))
      : [];
  const winnerResult = finalResults.find((result) => result.final_rank === 1) ?? finalResults[0] ?? null;
  const winner = winnerResult ? (displayMap.get(winnerResult.country_id) ?? null) : null;
  const juryWinnerResult =
    grandFinalPublication?.jury_results && finalResults.length
      ? [...finalResults].sort((a, b) => b.jury_points - a.jury_points)[0]
      : null;
  const juryWinner = juryWinnerResult ? (displayMap.get(juryWinnerResult.country_id) ?? null) : null;
  const teleWinnerResult =
    grandFinalPublication?.televote_results && finalResults.length
      ? [...finalResults].sort((a, b) => b.televote_points - a.televote_points)[0]
      : null;
  const teleWinner = teleWinnerResult ? (displayMap.get(teleWinnerResult.country_id) ?? null) : null;
  const semiFinals = publicShows.filter((show) => show.kind === "semi-final" || show.kind === "semi");
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
      <div className="edition-public-page">
        <div className="edition-page-toolbar">
          <Link to="/editions" className="text-xs font-medium text-muted-foreground hover:text-foreground">← Editions</Link>
          <FollowButton entityType="edition" entityId={edition.id} label={editionLabel(edition)} />
        </div>

        <EditionHero
          eyebrow={edition.host_city ?? "Solaris Song Contest"}
          title={editionLabel(edition)}
          subtitle={meaningfulEditionSubtitle(edition.name, editionLabel(edition), edition.edition_number)}
          description={edition.description}
          artwork={edition.artwork_url ?? null}
          artworkAlt={`${editionLabel(edition)} official artwork`}
          logo={edition.logo ?? null}
          logoAlt={`${editionLabel(edition)} logo`}
          status={<PublicStatus
              status={editionState.statusKey}
              label={editionState.statusLabel}
              className="edition-status-chip"
            />}
          liquidGlass={liquidGlass}
          winner={winner && winnerResult && grandFinalPublication?.results ? (
                <div className="edition-winner-identity">
                  <FlagChip code={winner.short_code} color={winner.accent_color} image={winner.flag_image} size="xl" />
                  <div>
                    <p className="edition-kicker">Winner</p>
                    <p className="edition-winner-name">{winner.name}</p>
                    <p className="numeric edition-winner-points">{winnerResult.total_points} points</p>
                  </div>
                </div>
              ) : null}
        />

        {!(winner && (editionState.phase === "post_edition" || editionState.phase === "results_published")) && <PublicCurrentStatus
          icon={editionStatusIcon}
          eyebrow="Edition status"
          title={editionState.headline}
          description={editionState.description}
          tone={editionStatusTone}
          action={
            editionState.primaryAction &&
            editionState.primaryAction.to !== `/editions/${edition.slug}` ? (
              <Link
                to={editionState.primaryAction.to as any}
                className="inline-flex min-h-10 items-center rounded-xl border border-border bg-surface px-3 text-xs font-semibold text-primary"
              >
                {editionState.primaryAction.label} →
              </Link>
            ) : null
          }
        />}

        <EditionNavigation
          liquidGlass={liquidGlass}
          label={`Explore ${editionLabel(edition)}`}
          items={[
            { href: "#edition-overview", label: "Overview" },
            { href: "#edition-entries", label: "Entries", available: Boolean(publicEntries.length) },
            { href: "#edition-results", label: "Results", available: Boolean(grandFinalPublication?.results) },
            { href: "#edition-stories", label: "Stories", available: Boolean(editionStories.length) },
            { href: "#edition-shows", label: "Shows", available: Boolean(publicShows.length) },
            { href: "#edition-countries", label: "Countries", available: Boolean(participatingCountries.length) },
          ]}
        />

        <div id="edition-overview" className="scroll-mt-28">
          <EditionQuickFacts facts={[
            { label: "Edition", value: edition.edition_number != null ? `SSC ${edition.edition_number}` : "—" },
            { label: "Countries", value: participatingCountries.length || "—" },
            { label: "Semi-finals", value: semiFinals.length || "—" },
            { label: "Finalists", value: finalistCount ?? "—" },
          ]} />
        </div>

        {!!publicEntries.length && (
          <EditionSection id="edition-entries" eyebrow="Listen to the edition" title="Revealed entries" description="Only songs already published by their delegation or whose scheduled reveal has arrived appear here." meta={`${publicEntries.length} revealed ${publicEntries.length === 1 ? "entry" : "entries"}`}>
            <div className="edition-entry-grid">
              {publicEntries.map((entry) => {
                const country = displayMap.get(entry.country_id);
                if (!country) return null;
                const identity = (
                  <div className="flex min-w-0 items-start gap-3">
                    <FlagChip code={country.short_code} color={country.accent_color} image={country.flag_image} size="md" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">{country.name}</p>
                      <p className="mt-1 truncate text-sm font-semibold text-foreground">{entry.song}</p>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">{entry.artist || "Artist TBC"}</p>
                    </div>
                  </div>
                );
                return (
                  <article key={entry.country_id} className="edition-entry">
                    {country.entityType === "global" && country.countryId ? (
                      <Link to="/countries/$code" params={{ code: country.short_code }} className="block min-w-0">
                        {identity}
                      </Link>
                    ) : identity}
                    <EntryListenLinks entry={entry} compact className="mt-3" />
                  </article>
                );
              })}
            </div>
          </EditionSection>
        )}

        {grandFinalPublication?.results && !finalResults.length && (
          <Panel><p className="text-sm text-muted-foreground">Grand Final results are not available in the public archive yet.</p></Panel>
        )}

        {grandFinalPublication?.results && finalResults.length > 0 && (
          <section id="edition-results" className="edition-section edition-results-layout scroll-mt-28">
            <div className="edition-winner-stage">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">{editionLabel(edition)} winner</p>
              {winner && (
                <>
                  <div className="mt-5 flex items-center gap-4">
                    <FlagChip code={winner.short_code} color={winner.accent_color} image={winner.flag_image} size="xl" />
                    <div>
                      <h2 className="font-display text-2xl font-bold">{winner.name}</h2>
                      <p className="numeric mt-1 text-sm text-muted-foreground">{winnerResult?.total_points} points</p>
                    </div>
                  </div>
                  {grandFinal && <Link to="/shows/$showId" params={{ showId: grandFinal.id }} className="mt-6 inline-flex min-h-11 items-center rounded-xl bg-aurora px-4 text-sm font-semibold text-primary-foreground">Grand Final results →</Link>}
                </>
              )}
            </div>

            <div className="edition-ranking">
              <header><p className="edition-kicker">Grand Final</p><h2>{editionLabel(edition)}</h2><p>Top five</p></header>
              <ol>
                {finalResults.slice(0, 5).map((result, index) => {
                  const country = displayMap.get(result.country_id);
                  if (!country) return null;
                  const content = (
                    <>
                      <span className="numeric text-xs text-muted-foreground">#{result.final_rank ?? index + 1}</span>
                      <FlagChip code={country.short_code} color={country.accent_color} image={country.flag_image} size="sm" />
                      <span className="truncate text-sm font-semibold">{country.name}</span>
                      <span className="numeric text-sm font-semibold">{result.total_points}</span>
                    </>
                  );
                  return country.entityType === "global" && country.countryId ? (
                    <li key={result.id}><Link to="/countries/$code" params={{ code: country.short_code }} className="edition-ranking-row">{content}</Link></li>
                  ) : (
                    <li key={result.id} className="edition-ranking-row">{content}</li>
                  );
                })}
              </ol>
            </div>
          </section>
        )}

        {grandFinalPublication?.results && editionStories.length > 0 && (
          <section id="edition-stories" className="scroll-mt-28">
          <Panel
            title="Story of the result"
            description="The most important patterns found in the archived Grand Final result."
            actions={grandFinal ? <Link to="/shows/$showId" params={{ showId: grandFinal.id }} search={{ tab: "stories" }} className="text-xs font-semibold text-primary">View all →</Link> : null}
          >
            <StoryCards stories={editionStories} limit={3} />
          </Panel>
          </section>
        )}

        {(juryWinner || teleWinner) && (
          <section>
            <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Voting highlights</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {grandFinalPublication?.jury_results && juryWinner && juryWinnerResult && <VotingWinner label="Jury winner" country={juryWinner} points={juryWinnerResult.jury_points} />}
              {grandFinalPublication?.televote_results && teleWinner && teleWinnerResult && <VotingWinner label="Televote winner" country={teleWinner} points={teleWinnerResult.televote_points} />}
            </div>
          </section>
        )}

        {!!publicShows.length && (
          <section id="edition-shows" className="edition-section scroll-mt-28">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">{editionLabel(edition)}</p>
            <h2 className="mt-1 font-display text-2xl font-bold">Shows</h2>
            <div className="edition-show-list">
              {publicShows.map((show) => {
                const publication = resolveShowPublication(show);
                const line = publication.participants ? participantList.filter((participant) => participant.show_id === show.id) : [];
                const showResults = publication.results ? resultList.filter((result) => result.show_id === show.id && result.final_rank != null) : [];
                return (
                  <Link key={show.id} to="/shows/$showId" params={{ showId: show.id }} className="edition-show-row group">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-primary">{show.kind.replace("-", " ")}</p>
                        <h3 className="mt-1 font-display text-lg font-bold">{show.name}</h3>
                        {publication.results && showResults.length ? <p className="mt-1 text-xs text-muted-foreground">Results available</p> : publication.participants ? <p className="mt-1 text-xs text-muted-foreground">{line.length} entries</p> : <p className="mt-1 text-xs text-muted-foreground">Information published</p>}
                      </div>
                      <span className="text-primary">→</span>
                    </div>
                    {publication.participants && !!line.length && (
                      <div className="mt-4 flex flex-wrap gap-1.5">
                        {line.slice(0, 14).map((participant) => {
                          const country = displayMap.get(participant.country_id);
                          return country ? <FlagChip key={participant.id} code={country.short_code} color={country.accent_color} image={country.flag_image} size="sm" /> : null;
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
          <section id="edition-countries" className="edition-section scroll-mt-28">
            <div className="flex items-end justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Delegations</p>
                <h2 className="mt-1 font-display text-2xl font-bold">Participating countries</h2>
              </div>
            </div>
            <div className="edition-country-list">
              {participatingCountries.map((country) => {
                const card = (
                  <div className="edition-country-item">
                    <FlagChip code={country.short_code} color={country.accent_color} image={country.flag_image} size="md" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{country.name}</p>
                      <p className="mt-0.5 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{country.short_code}</p>
                    </div>
                  </div>
                );
                return country.entityType === "global" && country.countryId ? <Link key={country.id} to="/countries/$code" params={{ code: country.short_code }}>{card}</Link> : <div key={country.id}>{card}</div>;
              })}
            </div>
          </section>
        )}

        {!publicShows.length && (
          <EditionEmptyState>No individual show information is available publicly for this edition yet.</EditionEmptyState>
        )}
      </div>
    </AppShell>
  );
}

function VotingWinner({ label, country, points }: { label: string; country: EntityDisplay; points: number }) {
  return (
    <div className="edition-voting-winner">
      <FlagChip code={country.short_code} color={country.accent_color} image={country.flag_image} size="lg" />
      <div className="min-w-0">
        <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-primary">{label}</p>
        <p className="mt-1 truncate font-display text-lg font-bold">{country.name}</p>
        <p className="numeric mt-1 text-xs text-muted-foreground">{points} points</p>
      </div>
    </div>
  );
}
