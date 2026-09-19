import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { AppShell, Panel, StatTile } from "@/components/AppShell";
import { ArchiveDataError, ArchiveDataLoading, archiveHasError, archiveIsLoading } from "@/components/ArchiveDataState";
import { CountryPersonalityStyles } from "@/components/CountryPersonalityStyles";
import { CountryWorldOverview, CountryWorldSupplement } from "@/components/CountryWorldOverview";
import { EntryListenLinks } from "@/components/EntryListenLinks";
import { FlagChip } from "@/components/FlagChip";
import { FollowButton } from "@/components/FollowButton";
import { ResponsiveTabs } from "@/components/ResponsiveTabs";
import { CountryDesignV2Hero } from "@/components/country/CountryDesignV2Hero";
import { CountryDesignV2Styles } from "@/components/country/CountryDesignV2Styles";
import { CountryIdentityHero } from "@/components/country/CountryIdentityHero";
import { allTimeScoreForCountry } from "@/lib/all-time-ranking";
import { computeCanonicalCountryStats } from "@/lib/canonical-country-stats";
import { computeCanonicalHeadToHead } from "@/lib/canonical-head-to-head";
import {
  countryDesignCssVariables,
  countryDesignFontCss,
  useCountryDesignV2,
} from "@/lib/country-design-v2";
import { canonicalCountryPersonalityId } from "@/lib/country-personality-system";
import { countryPersonalitySource } from "@/lib/country-personality-sources";
import type { CountryIdentityModel } from "@/lib/country-semantic-model";
import {
  editionLabel,
  type Participant,
  useAllJuryVotes,
  useAllParticipants,
  useAllResults,
  useAllShows,
  useAllTelevotes,
  useCountries,
  useEditions,
} from "@/lib/data-live";
import { canonicalEditionEntries, canonicalEntryFor } from "@/lib/entry-utils";
import { computeCountryForm } from "@/lib/form";
import { buildPublicCountryArchive } from "@/lib/public-country-archive";
import {
  resolveCountryEditionQualification,
  type QualificationStatus,
} from "@/lib/qualification";
import { computeRelationship } from "@/lib/stats";
import { countryThemeToVisual, useCountryTheme } from "@/lib/visual-theme";

export const Route = createFileRoute("/countries/$code")({
  head: ({ params }) => {
    const code = params.code.toUpperCase();
    const url = `https://studio.solaris-song-contest.workers.dev/countries/${encodeURIComponent(params.code)}`;
    return {
      meta: [
        { title: `${code} — Country profile — Solaris Studio` },
        {
          name: "description",
          content: `Published Solaris Song Contest profile, entries, results and voting history for ${code}.`,
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
                name: "Countries",
                item: "https://studio.solaris-song-contest.workers.dev/countries",
              },
              {
                "@type": "ListItem",
                position: 2,
                name: code,
                item: url,
              },
            ],
          }),
        },
      ],
    };
  },
  component: CountryProfileRoute,
});

function CountryProfileRoute() {
  return (
    <>
      <CountryPersonalityStyles />
      <CountryDesignV2Styles />
      <CountryProfilePage />
    </>
  );
}

const TABS = [
  { value: "overview", label: "Overview" },
  { value: "entries", label: "Entries" },
  { value: "results", label: "Results" },
  { value: "voting", label: "Voting" },
  { value: "relationships", label: "Relationships" },
  { value: "form", label: "Form" },
] as const;

type Tab = (typeof TABS)[number]["value"];

function CountryProfilePage() {
  const { code } = Route.useParams();
  const countriesQuery = useCountries();
  const editionsQuery = useEditions();
  const showsQuery = useAllShows();
  const participantsQuery = useAllParticipants();
  const resultsQuery = useAllResults();
  const juryQuery = useAllJuryVotes();
  const televoteQuery = useAllTelevotes();
  const { data: countries } = countriesQuery;
  const { data: editions } = editionsQuery;
  const { data: shows } = showsQuery;
  const { data: participants } = participantsQuery;
  const { data: results } = resultsQuery;
  const { data: jury } = juryQuery;
  const { data: televote } = televoteQuery;
  const [tab, setTab] = useState<Tab>("overview");

  const country = (countries ?? []).find(
    (item) => item.short_code.toUpperCase() === code.toUpperCase(),
  );
  const { data: countryThemeRow } = useCountryTheme(country?.id);
  const designV2Query = useCountryDesignV2(country?.id);
  const visualTheme = countryThemeToVisual(countryThemeRow);
  const publishedDesign = designV2Query.data?.isPublishedV2 ? designV2Query.data.design : null;
  const heroPersonality = canonicalCountryPersonalityId(visualTheme?.heroLayout ?? "classic");
  const sourcePersonality = countryPersonalitySource(heroPersonality);
  const heroDecoration = visualTheme?.decorationStyle ?? "auto";

  const publicArchive = useMemo(
    () =>
      buildPublicCountryArchive({
        editions: editions ?? [],
        shows: shows ?? [],
        participants: participants ?? [],
        results: results ?? [],
        jury: jury ?? [],
        televote: televote ?? [],
      }),
    [editions, shows, participants, results, jury, televote],
  );

  const opts = publicArchive;

  const stats = useMemo(
    () => (country ? computeCanonicalCountryStats(country.id, opts) : null),
    [country, opts],
  );
  const form = useMemo(
    () => (country ? computeCountryForm(country.id, opts) : null),
    [country, opts],
  );
  const allTime = useMemo(
    () => (country ? allTimeScoreForCountry(country.id, publicArchive.shows, publicArchive.results) : null),
    [country, publicArchive],
  );

  const archiveQueries = [countriesQuery, editionsQuery, showsQuery, participantsQuery, resultsQuery, juryQuery, televoteQuery];
  if (archiveIsLoading(...archiveQueries)) {
    return (
      <AppShell>
        <div className="mb-4">
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">
            Country profile
          </p>
          <h1 className="mt-1 font-display text-2xl font-bold">Loading {code.toUpperCase()}</h1>
        </div>
        <ArchiveDataLoading label="Loading country profile…" />
      </AppShell>
    );
  }
  if (archiveHasError(...archiveQueries)) return <AppShell><ArchiveDataError /></AppShell>;

  if (!country) {
    return (
      <AppShell>
        <div className="glass p-6">
          <h1 className="font-display text-2xl font-bold">Country not found</h1>
          <Link to="/countries" className="mt-4 inline-block text-sm text-primary">
            ← Countries
          </Link>
        </div>
      </AppShell>
    );
  }

  const countryMap = new Map((countries ?? []).map((item) => [item.id, item]));
  const editionMap = new Map(publicArchive.editions.map((edition) => [edition.id, edition]));
  const showMap = new Map(publicArchive.shows.map((show) => [show.id, show]));
  const hasContestData = Boolean(stats && stats.participations > 0);

  const myParticipants = publicArchive.participants.filter(
    (participant) => participant.country_id === country.id,
  );
  const myResults = publicArchive.results
    .filter((result) => result.country_id === country.id)
    .sort(
      (a, b) =>
        (editionMap.get(b.edition_id)?.edition_number ?? -1) -
        (editionMap.get(a.edition_id)?.edition_number ?? -1),
    );

  const finalResultByEdition = new Map<string, (typeof myResults)[number]>();
  for (const result of myResults) {
    const kind = showMap.get(result.show_id ?? "")?.kind;
    if (kind !== "grand-final" && kind !== "final") continue;
    const current = finalResultByEdition.get(result.edition_id);
    if (
      !current ||
      (result.final_rank != null && current.final_rank == null) ||
      (result.final_rank != null && current.final_rank != null && result.final_rank < current.final_rank) ||
      (result.final_rank === current.final_rank && result.total_points > current.total_points)
    ) {
      finalResultByEdition.set(result.edition_id, result);
    }
  }
  const finalResults = [...finalResultByEdition.values()].sort(
    (a, b) =>
      (editionMap.get(b.edition_id)?.edition_number ?? -1) -
      (editionMap.get(a.edition_id)?.edition_number ?? -1),
  );

  const qualificationFor = (editionId: string) =>
    resolveCountryEditionQualification(country.id, editionId, publicArchive);

  const entryHistory = canonicalEditionEntries(myParticipants)
    .slice()
    .sort(
      (a, b) =>
        (editionMap.get(b.edition_id)?.edition_number ?? -1) -
        (editionMap.get(a.edition_id)?.edition_number ?? -1),
    );
  const latestEntry = entryHistory[0] ?? null;

  const qualificationEditionIds = new Set<string>();
  myParticipants.forEach((participant) => qualificationEditionIds.add(participant.edition_id));
  myResults.forEach((result) => qualificationEditionIds.add(result.edition_id));

  const qualificationRows = [...qualificationEditionIds]
    .map((editionId) => ({
      editionId,
      edition: editionMap.get(editionId),
      entry: canonicalEntryFor(myParticipants, editionId, country.id) ?? undefined,
      status: qualificationFor(editionId),
    }))
    .filter(
      (row): row is typeof row & { status: Exclude<QualificationStatus, null> } =>
        row.status != null,
    )
    .sort((a, b) => (b.edition?.edition_number ?? -1) - (a.edition?.edition_number ?? -1));

  const recentHistory =
    stats?.timeline
      .slice()
      .reverse()
      .slice(0, 6)
      .map((point) => {
        const participant = canonicalEntryFor(myParticipants, point.editionId, country.id) ?? undefined;
        return {
          point,
          edition: editionMap.get(point.editionId),
          participant,
          qualification: qualificationFor(point.editionId),
        };
      }) ?? [];

  const hostedEditions = publicArchive.editions
    .filter((edition) => edition.host_country_id === country.id)
    .sort((a, b) => (b.edition_number ?? -1) - (a.edition_number ?? -1));

  const given = publicArchive.jury.filter((vote) => vote.voter_country_id === country.id);
  const received = publicArchive.jury.filter((vote) => vote.receiving_country_id === country.id);

  const aggregate = (
    rows: typeof given,
    key: "receiving_country_id" | "voter_country_id",
  ) => {
    const totals = new Map<string, number>();
    for (const vote of rows) {
      const id = vote[key];
      if (id) totals.set(id, (totals.get(id) ?? 0) + vote.points);
    }

    return [...totals.entries()]
      .map(([id, points]) => ({ country: countryMap.get(id), points }))
      .filter(
        (item): item is { country: NonNullable<typeof item.country>; points: number } =>
          Boolean(item.country),
      )
      .sort((a, b) => b.points - a.points)
      .slice(0, 8);
  };

  const topGiven = aggregate(given, "receiving_country_id");
  const topReceived = aggregate(received, "voter_country_id");

  const myEditionIds = new Set(myResults.map((result) => result.edition_id));
  const sharedIds = new Set<string>();
  for (const result of publicArchive.results) {
    if (result.country_id !== country.id && myEditionIds.has(result.edition_id)) {
      sharedIds.add(result.country_id);
    }
  }

  const relationshipRows = [...sharedIds]
    .map((id) => {
      const other = countryMap.get(id);
      if (!other) return null;
      return {
        other,
        relationship: computeRelationship(country.id, id, {
          editions: publicArchive.editions,
          jury: publicArchive.jury,
          results: publicArchive.results,
          shows: publicArchive.shows,
        }),
        headToHead: computeCanonicalHeadToHead(country.id, id, opts),
      };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row))
    .sort((a, b) => b.relationship.friendshipScore - a.relationship.friendshipScore);

  const identityModel: CountryIdentityModel = {
    code: country.short_code,
    name: country.name,
    nativeName: country.native_name,
    region: country.region,
    description: country.description,
    flag: {
      src: country.flag_image,
      alt: `Flag of ${country.name}`,
    },
    colors: {
      primary: country.accent_color,
      accent: country.accent_color,
    },
    facts: country.region ? [{ id: "region", label: "Region", value: country.region }] : [],
    statistics: stats
      ? [
          { id: "participations", label: "Participations", value: stats.participations },
          { id: "wins", label: "Wins", value: stats.wins },
          { id: "podiums", label: "Podiums", value: stats.podiums },
        ]
      : [],
    currentEntry: latestEntry
      ? {
          editionId: latestEntry.edition_id,
          editionLabel: editionMap.get(latestEntry.edition_id)
            ? editionLabel(editionMap.get(latestEntry.edition_id)!)
            : "Edition",
          artist: latestEntry.artist,
          song: latestEntry.song,
          status: qualificationFor(latestEntry.edition_id),
        }
      : null,
    history: entryHistory.map((entry) => ({
      editionId: entry.edition_id,
      editionLabel: editionMap.get(entry.edition_id)
        ? editionLabel(editionMap.get(entry.edition_id)!)
        : "Edition",
      artist: entry.artist,
      song: entry.song,
      status: qualificationFor(entry.edition_id),
    })),
    geography: null,
    actions: {
      wiki: { label: "Wiki", href: `/wiki/${country.short_code}` },
      compare: { label: "Compare", href: `/compare?a=${country.short_code}` },
      follow: { label: "Follow", href: `/countries/${country.short_code}` },
    },
  };

  const chartData =
    stats?.timeline
      .filter((point) => point.rank != null)
      .map((point) => ({ edition: point.label, rank: point.rank })) ?? [];

  return (
    <AppShell>
      <div
        className={publishedDesign ? "country-profile-v8 country-design-v2" : "country-profile-v8"}
        data-country-personality={publishedDesign ? undefined : heroPersonality}
        data-country-composition={publishedDesign ? undefined : sourcePersonality.compositionFamily}
        data-country-background-policy={publishedDesign ? undefined : sourcePersonality.backgroundPolicy}
        data-country-source-status={publishedDesign ? undefined : sourcePersonality.status}
        data-country-surface={publishedDesign?.surface}
        data-country-accent={publishedDesign?.accent}
        data-country-motion={publishedDesign?.motion}
        data-country-default-layout={publishedDesign?.content.defaultLayout}
        style={publishedDesign ? countryDesignCssVariables(publishedDesign) : undefined}
      >
        {publishedDesign && countryDesignFontCss(publishedDesign) ? <style>{countryDesignFontCss(publishedDesign)}</style> : null}
        {publishedDesign ? (
          <CountryDesignV2Hero
            design={publishedDesign}
            code={identityModel.code}
            name={identityModel.name}
            nativeName={identityModel.nativeName}
            region={identityModel.region}
            description={identityModel.description}
            flagImage={identityModel.flag.src}
            className="mb-6"
            actions={
              <>
                <Link to="/wiki/$code" params={{ code: country.short_code }}>Wiki</Link>
                <Link to="/compare" search={{ a: country.short_code }}>Compare</Link>
                <FollowButton entityType="country" entityId={country.id} label={country.name} />
              </>
            }
          />
        ) : (
          <CountryIdentityHero
            personality={heroPersonality}
            decoration={heroDecoration}
            code={identityModel.code}
            name={identityModel.name}
            nativeName={identityModel.nativeName}
            region={identityModel.region}
            description={identityModel.description}
            flagImage={identityModel.flag.src}
            accentColor={identityModel.colors.accent}
            geography={identityModel.geography}
            className="mb-6"
            actions={
              <>
                <Link to="/wiki/$code" params={{ code: country.short_code }}>Wiki</Link>
                <Link to="/compare" search={{ a: country.short_code }}>Compare</Link>
                <FollowButton entityType="country" entityId={country.id} label={country.name} />
              </>
            }
          />
        )}

        <ResponsiveTabs
          value={tab}
          options={TABS}
          onChange={setTab}
          label="Country section"
          collapseAt="lg"
          className="mb-5"
        />

        {tab === "overview" && (
          <div className="space-y-5">
            <CountryWorldOverview country={country} />

            {hasContestData && stats ? (
              <>
                <Panel
                  title="SSC at a glance"
                  description="A compact summary. Full history and qualification details live in Results."
                >
                  <div className="grid grid-cols-2 gap-x-5 gap-y-5 sm:grid-cols-5">
                    <StatTile label="Participations" value={stats.participations} />
                    <StatTile label="Wins" value={stats.wins} />
                    <StatTile label="Podiums" value={stats.podiums} />
                    <StatTile label="Hosted" value={hostedEditions.length} />
                    <StatTile
                      label="Avg. placement"
                      value={stats.avgCombinedPlacement?.toFixed(1) ?? "—"}
                    />
                  </div>
                </Panel>

                <Panel
                  title="Current entry"
                  description="The latest published canonical entry for this delegation."
                >
                  {latestEntry ? (
                    <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold">
                          {[latestEntry.artist, latestEntry.song].filter(Boolean).join(" · ") || "Entry details unavailable"}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {editionMap.get(latestEntry.edition_id)
                            ? editionLabel(editionMap.get(latestEntry.edition_id)!)
                            : "Latest published edition"}
                        </p>
                        <EntryListenLinks entry={latestEntry} compact className="mt-3" />
                      </div>
                      <QualificationBadge status={qualificationFor(latestEntry.edition_id)} />
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No published entry is available yet.</p>
                  )}
                </Panel>

                <Panel
                  title="Recent SSC history"
                  description="One row per edition, with direct listening links when the delegation has added them."
                  actions={
                    <button
                      type="button"
                      onClick={() => setTab("results")}
                      className="rounded-xl border border-border bg-surface px-3 py-2 text-xs font-semibold text-primary"
                    >
                      Full results →
                    </button>
                  }
                >
                  {recentHistory.length ? (
                    <div className="divide-y divide-border/60">
                      {recentHistory.map(({ point, edition, participant, qualification }) => (
                        <div key={point.editionId} className="py-3 first:pt-0 last:pb-0">
                          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold">
                                {edition ? editionLabel(edition) : point.label}
                              </p>
                              <p className="mt-1 truncate text-[11px] text-muted-foreground">
                                {[participant?.artist, participant?.song].filter(Boolean).join(" · ") ||
                                  "Entry details are not available yet"}
                              </p>
                              <EntryListenLinks entry={participant} compact className="mt-2" />
                            </div>
                            <div className="shrink-0 text-right">
                              <p className="numeric text-sm font-semibold">
                                {point.rank != null ? `#${point.rank}` : "—"}
                              </p>
                              <p className="mt-1 text-[10px] text-muted-foreground">
                                {qualification === "aq"
                                  ? "AQ · Autoqualifier"
                                  : qualification === "wildcard"
                                    ? "Wildcard · Reached final"
                                    : qualification === "nq"
                                      ? "Did not qualify"
                                      : qualification === "q"
                                        ? "Reached final"
                                        : "Qualification is not available"}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No edition history is available yet.</p>
                  )}
                </Panel>

                {allTime ? (
                  <Panel
                    title="All-time record"
                    description="Cumulative published Grand Final score and the country's all-time position."
                  >
                    <div className="grid grid-cols-2 gap-3">
                      <StatTile label="All-time score" value={allTime.score} />
                      <StatTile label="All-time ranking" value={`#${allTime.rank}`} />
                    </div>
                  </Panel>
                ) : null}

                {hostedEditions.length > 0 && (
                  <Panel title="Hosted editions" description="Published SSC editions hosted by this country.">
                    <div className="flex flex-wrap gap-2">
                      {hostedEditions.map((edition) => (
                        <Link
                          key={edition.id}
                          to="/editions/$slug"
                          params={{ slug: edition.slug }}
                          className="rounded-xl border border-border bg-surface px-3 py-2 text-xs font-semibold hover:border-primary/40"
                        >
                          {editionLabel(edition)}{edition.host_city ? ` · ${edition.host_city}` : ""}
                        </Link>
                      ))}
                    </div>
                  </Panel>
                )}

                <CountryWorldSupplement
                  country={country}
                  defaultLayout={publishedDesign?.content.defaultLayout}
                />
              </>
            ) : (
              <Panel title="Solaris Song Contest">
                <p className="text-sm leading-relaxed text-muted-foreground">
                  No published Solaris Song Contest history is available for {country.name} yet. Its Terra Solaris profile can still be explored above and in the Wiki.
                </p>
              </Panel>
            )}
          </div>
        )}

        {tab === "entries" && (
          hasContestData ? (
            <div className="space-y-5">
              <Panel
                title="Latest entry"
                description="The newest published canonical entry remains prominent; the full chronology follows below."
              >
                {latestEntry ? (
                  <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
                    <div className="min-w-0">
                      <p className="text-base font-semibold">
                        {[latestEntry.artist, latestEntry.song].filter(Boolean).join(" · ") || "Entry details unavailable"}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {editionMap.get(latestEntry.edition_id)
                          ? editionLabel(editionMap.get(latestEntry.edition_id)!)
                          : "Edition"}
                      </p>
                      <EntryListenLinks entry={latestEntry} compact className="mt-3" />
                    </div>
                    <QualificationBadge status={qualificationFor(latestEntry.edition_id)} />
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No published entry is available yet.</p>
                )}
              </Panel>

              <Panel
                title="Entry history"
                description="Canonical entries in reverse chronological order. Chronology is never rearranged for personality styling."
              >
                {entryHistory.length ? (
                  <div className="divide-y divide-border/60">
                    {entryHistory.map((entry) => {
                      const edition = editionMap.get(entry.edition_id);
                      const status = qualificationFor(entry.edition_id);
                      return (
                        <div key={entry.id} className="py-3 first:pt-0 last:pb-0">
                          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold">
                                {edition ? editionLabel(edition) : "Edition"}
                              </p>
                              <p className="mt-1 truncate text-xs text-muted-foreground">
                                {[entry.artist, entry.song].filter(Boolean).join(" · ") || "Entry details unavailable"}
                              </p>
                              <EntryListenLinks entry={entry} compact className="mt-2" />
                            </div>
                            <QualificationBadge status={status} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No published entry history is available yet.</p>
                )}
              </Panel>
            </div>
          ) : <NoContestData countryName={country.name} />
        )}

        {tab === "results" && (
          hasContestData ? (
            <div className="space-y-5">
              <Panel
                title="Placement timeline"
                description="One archived placement per edition. Lower placement is better."
              >
                {chartData.length ? (
                  <div className="h-[270px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                        <XAxis dataKey="edition" stroke="var(--muted-foreground)" fontSize={11} />
                        <YAxis reversed allowDecimals={false} stroke="var(--muted-foreground)" fontSize={11} />
                        <Tooltip
                          contentStyle={{
                            background: "var(--popover)",
                            border: "1px solid var(--border)",
                            borderRadius: 14,
                          }}
                        />
                        <Line
                          type="monotone"
                          dataKey="rank"
                          name="Placement"
                          stroke="var(--primary)"
                          strokeWidth={3}
                          dot
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No ranked results recorded yet.</p>
                )}
              </Panel>

              <div className="grid gap-5 lg:grid-cols-2">
                <Panel title="Grand finals">
                  <ResultList rows={finalResults} editionMap={editionMap} showMap={showMap} participants={myParticipants} countryId={country.id} />
                </Panel>
                <Panel
                  title="Qualification history"
                  description="Q means a top-N semi-final qualification. AQ means a direct Grand Final place. Wildcard means the country finished outside the semi-final top N but still reached the Grand Final through the wildcard route."
                >
                  {qualificationRows.length ? (
                    <div className="divide-y divide-border/60">
                      {qualificationRows.map(({ editionId, entry, edition, status }) => (
                        <div key={editionId} className="py-3 first:pt-0 last:pb-0">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium">
                                {edition ? editionLabel(edition) : "Edition"}
                              </p>
                              <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                                {[entry?.artist, entry?.song].filter(Boolean).join(" · ") ||
                                  (status === "aq" ? "Direct Grand Final entry" : "Semi-final entry details not archived")}
                              </p>
                              <EntryListenLinks entry={entry} compact className="mt-2" />
                            </div>
                            <QualificationBadge status={status} />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No published qualification history recorded.</p>
                  )}
                </Panel>
              </div>
            </div>
          ) : <NoContestData countryName={country.name} />
        )}

        {tab === "voting" && (
          hasContestData && stats ? (
            <div className="space-y-5">
              <Panel>
                <div className="grid grid-cols-2 gap-x-5 gap-y-5 sm:grid-cols-4">
                  <StatTile label="Avg. received" value={stats.avgReceivedPerContest?.toFixed(0) ?? "—"} />
                  <StatTile label="Avg. given" value={stats.avgGivenPerContest?.toFixed(0) ?? "—"} />
                  <StatTile label="Top scores received" value={stats.topScoresReceived} />
                  <StatTile label="Top scores given" value={stats.topScoresGiven} />
                </div>
              </Panel>
              <div className="grid gap-5 lg:grid-cols-2">
                <CountryPointList title="Most support received" rows={topReceived} />
                <CountryPointList title="Most points given" rows={topGiven} />
              </div>
            </div>
          ) : <NoContestData countryName={country.name} />
        )}

        {tab === "relationships" && (
          hasContestData ? (
            <Panel
              title="Closest relationships"
              description="Countries with the strongest repeated two-way support in the published archive."
            >
              {relationshipRows.length ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  {relationshipRows.slice(0, 10).map(({ other, relationship, headToHead }) => (
                    <Link
                      key={other.id}
                      to="/relationships/$pair"
                      params={{ pair: `${country.short_code}-vs-${other.short_code}`.toUpperCase() }}
                      className="group rounded-xl bg-surface px-3 py-3 hover:bg-surface-strong"
                    >
                      <div className="flex items-center gap-3">
                        <FlagChip
                          code={other.short_code}
                          color={other.accent_color}
                          image={other.flag_image}
                          size="sm"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold">{other.name}</p>
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            Connection {relationship.friendshipScore.toFixed(0)} / 100 · {relationship.relationshipTrend}
                          </p>
                          <p className="mt-1 text-[10px] text-muted-foreground/80">
                            {headToHead.sharedEditions} shared edition{headToHead.sharedEditions === 1 ? "" : "s"} · {relationship.sampleConfidence} confidence
                          </p>
                        </div>
                        <span className="shrink-0 text-primary transition-transform group-hover:translate-x-1">→</span>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No relationships recorded yet.</p>
              )}
            </Panel>
          ) : <NoContestData countryName={country.name} />
        )}

        {tab === "form" && (
          hasContestData && form ? (
            <div className="space-y-5">
              <Panel
                title="Current form"
                description="A recent-performance summary. This is optional context, not another version of the country history."
              >
                <div className="grid grid-cols-2 gap-x-5 gap-y-5 sm:grid-cols-4">
                  <StatTile
                    label="Form"
                    value={form.formIndex?.toFixed(0) ?? "—"}
                    hint={form.formBand === "unrated" ? "Not enough data" : form.formBand}
                  />
                  <StatTile label="Consistency" value={form.consistency?.toFixed(0) ?? "—"} />
                  <StatTile
                    label="Voting reach"
                    value={form.votingReach != null ? `${form.votingReach.toFixed(0)}%` : "—"}
                  />
                  <StatTile
                    label="Momentum"
                    value={form.momentum != null ? `${form.momentum >= 0 ? "+" : ""}${form.momentum.toFixed(0)}` : "—"}
                  />
                </div>
              </Panel>

              <Panel title="Recent form history" description={form.methodology}>
                <div className="divide-y divide-border/60">
                  {form.timeline.slice().reverse().slice(0, 8).map((point) => (
                    <div
                      key={point.editionId}
                      className="grid grid-cols-[1fr_auto_auto] items-center gap-3 py-3 first:pt-0 last:pb-0"
                    >
                      <span className="min-w-0 truncate text-sm font-medium">{point.label}</span>
                      <span className="numeric whitespace-nowrap text-xs text-muted-foreground">
                        #{point.rank} / {point.fieldSize}
                      </span>
                      <span className="numeric min-w-10 text-right text-sm font-semibold">
                        {point.percentile.toFixed(0)}
                      </span>
                    </div>
                  ))}
                </div>
              </Panel>

              <details className="data-panel overflow-hidden">
                <summary className="cursor-pointer list-none px-4 py-4 text-sm font-semibold sm:px-5 [&::-webkit-details-marker]:hidden">
                  Advanced form details ▾
                </summary>
                <div className="grid gap-5 border-t border-border/60 px-4 py-4 sm:grid-cols-2 sm:px-5">
                  <div className="divide-y divide-border/60">
                    <Row label="Support dependence" value={form.supportDependence != null ? `${form.supportDependence.toFixed(0)}%` : "—"} />
                    <Row
                      label="Jury / tele identity"
                      value={
                        form.juryTelevoteLean == null
                          ? "—"
                          : Math.abs(form.juryTelevoteLean) < 5
                            ? "Balanced"
                            : form.juryTelevoteLean > 0
                              ? `Jury +${form.juryTelevoteLean.toFixed(0)}`
                              : `Tele +${Math.abs(form.juryTelevoteLean).toFixed(0)}`
                      }
                    />
                    <Row label="Resilience" value={form.resilience?.toFixed(0) ?? "—"} />
                  </div>
                  <div className="divide-y divide-border/60">
                    <Row label="Rated editions" value={form.sampleSize} />
                    <Row label="Peak run" value={form.peakEra ?? "—"} />
                    <Row label="Lowest run" value={form.droughtEra ?? "—"} />
                  </div>
                </div>
              </details>
            </div>
          ) : <NoContestData countryName={country.name} />
        )}
      </div>
    </AppShell>
  );
}

function QualificationBadge({ status }: { status: QualificationStatus }) {
  if (status === "aq") {
    return (
      <span className="shrink-0 rounded-full bg-primary/10 px-2 py-1 text-[10px] font-semibold text-primary">
        AQ · Autoqualifier
      </span>
    );
  }
  if (status === "wildcard") {
    return (
      <span className="shrink-0 rounded-full bg-amber-300/[0.12] px-2 py-1 text-[10px] font-semibold text-amber-200">
        Wildcard
      </span>
    );
  }
  if (status === "q") {
    return (
      <span className="shrink-0 rounded-full bg-primary/10 px-2 py-1 text-[10px] font-semibold text-primary">
        Qualified
      </span>
    );
  }
  if (status === "nq") {
    return (
      <span className="shrink-0 rounded-full bg-surface px-2 py-1 text-[10px] text-muted-foreground">
        Eliminated
      </span>
    );
  }
  return (
    <span className="shrink-0 rounded-full border border-border bg-surface px-2 py-1 text-[10px] text-muted-foreground">
      Not archived
    </span>
  );
}

function NoContestData({ countryName }: { countryName: string }) {
  return (
    <Panel>
      <p className="text-sm leading-relaxed text-muted-foreground">
        No published Solaris Song Contest data is available for {countryName} in this section yet.
      </p>
    </Panel>
  );
}

function ResultList({
  rows,
  editionMap,
  showMap,
  participants,
  countryId,
}: {
  rows: Array<{
    id: string;
    edition_id: string;
    show_id: string | null;
    final_rank: number | null;
    total_points: number;
  }>;
  editionMap: Map<string, any>;
  showMap: Map<string, any>;
  participants: Participant[];
  countryId: string;
}) {
  if (!rows.length) {
    return <p className="text-sm text-muted-foreground">No Grand Final results recorded.</p>;
  }

  return (
    <div className="divide-y divide-border/60">
      {rows.map((row) => {
        const edition = editionMap.get(row.edition_id);
        const show = showMap.get(row.show_id ?? "");
        const entry = canonicalEntryFor(participants, row.edition_id, countryId);
        const content = (
          <div className="flex min-w-0 flex-1 items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{edition ? editionLabel(edition) : "Edition"}</p>
              <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                {[entry?.artist, entry?.song].filter(Boolean).join(" · ") || show?.name || "Grand Final"}
              </p>
              <EntryListenLinks entry={entry} compact className="mt-2" />
            </div>
            <div className="shrink-0 text-right">
              <p className="numeric text-sm font-semibold">{row.final_rank ? `#${row.final_rank}` : "—"}</p>
              <p className="numeric mt-0.5 text-[11px] text-muted-foreground">{row.total_points} pts</p>
            </div>
          </div>
        );

        return show ? (
          <Link
            key={row.id}
            to="/shows/$showId"
            params={{ showId: show.id }}
            className="flex items-center py-3 first:pt-0 last:pb-0"
          >
            {content}
          </Link>
        ) : (
          <div key={row.id} className="flex items-center py-3 first:pt-0 last:pb-0">
            {content}
          </div>
        );
      })}
    </div>
  );
}

function CountryPointList({
  title,
  rows,
}: {
  title: string;
  rows: Array<{ country: any; points: number }>;
}) {
  return (
    <Panel title={title}>
      {rows.length ? (
        <div className="divide-y divide-border/60">
          {rows.map(({ country, points }) => (
            <Link
              key={country.id}
              to="/countries/$code"
              params={{ code: country.short_code }}
              className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
            >
              <FlagChip
                code={country.short_code}
                color={country.accent_color}
                image={country.flag_image}
                size="sm"
              />
              <span className="min-w-0 flex-1 truncate text-sm">{country.name}</span>
              <span className="numeric text-sm font-semibold">{points}</span>
            </Link>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No voting data.</p>
      )}
    </Panel>
  );
}

function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="numeric text-sm font-semibold">{value}</span>
    </div>
  );
}
