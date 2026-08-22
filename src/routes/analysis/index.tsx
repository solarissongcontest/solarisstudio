import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { AppShell, PageHeader, Panel } from "@/components/AppShell";
import { FlagChip } from "@/components/FlagChip";
import { ResponsiveTabs } from "@/components/ResponsiveTabs";
import { ChordDiagram } from "@/components/viz/ChordDiagram";
import {
  DEFAULT_ANALYSIS_FILTERS,
  Filters,
  type AnalysisFiltersState,
} from "@/components/viz/Filters";
import { HistoricalLeaderboard } from "@/components/viz/HistoricalLeaderboard";
import { JuryVsTelevote } from "@/components/viz/JuryVsTelevote";
import { NetworkGraph } from "@/components/viz/NetworkGraph";
import { VotingHeatmap } from "@/components/viz/VotingHeatmap";
import { regionalBias, topRecipients, topSupporters, votingSimilarity } from "@/lib/analysis";
import {
  type Country,
  type ResultRow,
  useAllJuryVotes,
  useAllParticipants,
  useAllResults,
  useAllShows,
  useCountries,
  useEditions,
} from "@/lib/data";
import { buildFanDiscovery, type DiscoveryStory } from "@/lib/fan-discovery";
import { computeRelationship, computeVotingIntelligence } from "@/lib/stats";
import { resolveVoting } from "@/lib/voting";

export const Route = createFileRoute("/analysis/")({
  head: () => ({ meta: [{ title: "Analysis — Solaris Studio" }] }),
  component: AnalysisPage,
});

const ANALYSIS_TABS = [
  { value: "discover", label: "Discover" },
  { value: "jurytele", label: "Jury vs Tele" },
  { value: "relationships", label: "Relationships" },
  { value: "support", label: "Support" },
  { value: "connections", label: "Connections map" },
  { value: "history", label: "History" },
] as const;

type Tab = (typeof ANALYSIS_TABS)[number]["value"];

function AnalysisPage() {
  const { data: countries } = useCountries();
  const { data: jury } = useAllJuryVotes();
  const { data: results } = useAllResults();
  const { data: shows } = useAllShows();
  const { data: editions } = useEditions();
  const { data: participants } = useAllParticipants();

  const [filters, setFilters] = useState<AnalysisFiltersState>(DEFAULT_ANALYSIS_FILTERS);
  const [tab, setTab] = useState<Tab>("discover");
  const [selectedCountryId, setSelectedCountryId] = useState("");

  const cs = countries ?? [];
  const es = editions ?? [];
  const showsList = shows ?? [];
  const participantList = participants ?? [];

  const allowedShowIds = useMemo(
    () =>
      new Set(
        showsList
          .filter((show) =>
            filters.editionIds.length ? filters.editionIds.includes(show.edition_id) : true,
          )
          .filter((show) => (filters.showKind === "all" ? true : show.kind === filters.showKind))
          .map((show) => show.id),
      ),
    [showsList, filters],
  );

  const filteredShows = useMemo(
    () => showsList.filter((show) => allowedShowIds.has(show.id)),
    [showsList, allowedShowIds],
  );

  const filteredJury = useMemo(
    () =>
      (jury ?? []).filter((vote) =>
        vote.show_id
          ? allowedShowIds.has(vote.show_id)
          : filters.editionIds.length === 0 && filters.showKind === "all",
      ),
    [jury, allowedShowIds, filters],
  );

  const filteredResults = useMemo(
    () =>
      (results ?? []).filter((row) =>
        row.show_id
          ? allowedShowIds.has(row.show_id)
          : filters.editionIds.length === 0 && filters.showKind === "all",
      ),
    [results, allowedShowIds, filters],
  );

  const splitVoteShowIds = useMemo(
    () =>
      new Set(
        filteredShows
          .filter((show) => {
            const voting = resolveVoting(show.voting_config);
            return voting.juryEnabled && voting.televoteEnabled;
          })
          .map((show) => show.id),
      ),
    [filteredShows],
  );

  const splitVoteResults = useMemo(
    () =>
      filteredResults.filter(
        (row) => row.show_id != null && splitVoteShowIds.has(row.show_id),
      ),
    [filteredResults, splitVoteShowIds],
  );

  const intelligence = useMemo(
    () =>
      computeVotingIntelligence({
        countries: cs,
        jury: filteredJury,
        results: filteredResults,
      }),
    [cs, filteredJury, filteredResults],
  );

  const cMap = useMemo(() => new Map(cs.map((country) => [country.id, country])), [cs]);
  const similarity = useMemo(() => votingSimilarity(filteredJury, cs), [filteredJury, cs]);
  const bias = useMemo(() => regionalBias(filteredJury, cs), [filteredJury, cs]);

  const relationData = useMemo(() => {
    const pairs: Array<{ a: string; b: string; ab: number; ba: number; total: number; gap: number }> = [];
    for (let aIndex = 0; aIndex < cs.length; aIndex += 1) {
      for (let bIndex = aIndex + 1; bIndex < cs.length; bIndex += 1) {
        const a = cs[aIndex];
        const b = cs[bIndex];
        const relationship = computeRelationship(a.id, b.id, {
          editions: es,
          jury: filteredJury,
          results: filteredResults,
          shows: filteredShows,
        });
        if (relationship.opportunitiesAtoB === 0 && relationship.opportunitiesBtoA === 0) continue;
        pairs.push({
          a: a.id,
          b: b.id,
          ab: Math.round(relationship.normalizedAtoB),
          ba: Math.round(relationship.normalizedBtoA),
          total: Math.round(relationship.friendshipScore),
          gap: Math.round(Math.abs(relationship.normalizedAtoB - relationship.normalizedBtoA)),
        });
      }
    }
    return {
      friendships: pairs.filter((pair) => pair.ab > 0 && pair.ba > 0).sort((a, b) => b.total - a.total),
      oneSided: pairs
        .filter((pair) => pair.gap >= 15)
        .map((pair) => pair.ab >= pair.ba ? pair : { ...pair, a: pair.b, b: pair.a, ab: pair.ba, ba: pair.ab })
        .sort((a, b) => b.gap - a.gap),
    };
  }, [cs, es, filteredJury, filteredResults, filteredShows]);

  const discovery = useMemo(
    () =>
      buildFanDiscovery({
        countries: cs,
        editions: es,
        shows: filteredShows,
        participants: participantList,
        results: filteredResults,
        jury: filteredJury,
      }),
    [cs, es, filteredShows, participantList, filteredResults, filteredJury],
  );

  const countryOptions = useMemo(
    () =>
      cs
        .filter((country) =>
          filteredJury.some(
            (vote) => vote.voter_country_id === country.id || vote.receiving_country_id === country.id,
          ),
        )
        .sort((a, b) => a.name.localeCompare(b.name)),
    [cs, filteredJury],
  );

  const activeCountryId =
    selectedCountryId && countryOptions.some((country) => country.id === selectedCountryId)
      ? selectedCountryId
      : (countryOptions[0]?.id ?? "");
  const activeCountry = activeCountryId ? (cMap.get(activeCountryId) ?? null) : null;
  const supporters = activeCountryId ? topSupporters(filteredJury, activeCountryId, 8) : [];
  const recipients = activeCountryId ? topRecipients(filteredJury, activeCountryId, 8) : [];

  const juryTeleRows = useMemo(() => buildJuryTeleRows(splitVoteResults, cMap), [splitVoteResults, cMap]);
  const juryFavoured = juryTeleRows.filter((row) => row.difference > 0).sort((a, b) => b.difference - a.difference).slice(0, 6);
  const teleFavoured = juryTeleRows.filter((row) => row.difference < 0).sort((a, b) => a.difference - b.difference).slice(0, 6);
  const historyRows = useMemo(() => buildHistoryRows(filteredResults, cMap), [filteredResults, cMap]);

  const winnerRadar = intelligence.kingmakers[0]
    ? cMap.get(intelligence.kingmakers[0].countryId)
    : undefined;
  const mostLoyal = intelligence.loyaltyScore[0]
    ? cMap.get(intelligence.loyaltyScore[0].countryId)
    : undefined;
  const regionFocused = bias[0] ? cMap.get(bias[0].id) : undefined;

  return (
    <AppShell>
      <PageHeader
        eyebrow="Results intelligence"
        title="Analysis"
        description="Start with the stories hidden inside the results, then dig into the deeper voting tools if you want to."
      />

      <Filters editions={es} value={filters} onChange={setFilters} />

      <div className="mb-5 grid gap-2 sm:grid-cols-3">
        <ExplainerStat
          label="Winner radar"
          value={winnerRadar?.name ?? "—"}
          explanation="The jury or country whose points most often aligned with eventual winners. It does not mean they caused those wins."
        />
        <ExplainerStat
          label="Most loyal"
          value={mostLoyal?.name ?? "—"}
          explanation="The voting pattern with the strongest repeated support for the same countries across the available archive."
        />
        <ExplainerStat
          label="Most region-focused"
          value={regionFocused?.name ?? "—"}
          explanation={bias[0] ? `${(bias[0].share * 100).toFixed(0)}% of its measured support stayed inside its own region.` : "Not enough regional voting data yet."}
        />
      </div>

      <ResponsiveTabs
        value={tab}
        options={ANALYSIS_TABS}
        onChange={setTab}
        label="Analysis view"
        className="mb-5"
      />

      {tab === "discover" && (
        <div className="space-y-5">
          <SectionIntro
            eyebrow="What you might have missed"
            title="Discover"
            description="These are result stories calculated from the selected archive: dramatic climbs, collapses, disagreements and voting relationships. No mystery score required."
          />
          {discovery.length ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {discovery.map((story) => <DiscoveryCard key={story.id} story={story} cMap={cMap} />)}
            </div>
          ) : <Empty />}
          <details className="glass overflow-hidden">
            <summary className="cursor-pointer list-none px-4 py-4 text-sm font-semibold [&::-webkit-details-marker]:hidden">
              How these stories are calculated ▾
            </summary>
            <div className="border-t border-border/60 px-4 py-4 text-xs leading-6 text-muted-foreground">
              Jury-vs-televote stories only use shows where both voting components were actually enabled. Jury-only and televote-only shows still count for overall-result stories such as winning margins, but a missing vote component is never ranked as a field of zeroes. Pair stories add archived jury points in each direction. Filters above change the sample used for every card.
            </div>
          </details>
        </div>
      )}

      {tab === "jurytele" && (
        <div className="space-y-5">
          <SectionIntro
            eyebrow="Split vote"
            title="Where jury and televote disagreed"
            description="Only shows that actually used both jury and televote are included here. Jury-only or televote-only shows are excluded instead of treating the missing side as zero points."
          />
          <Panel title="Jury vs televote" description="Each dot is a country. Move right for more jury support and upward for more televote support.">
            {splitVoteResults.length ? <JuryVsTelevote countries={cs} results={splitVoteResults} /> : <Empty />}
          </Panel>
          <div className="grid gap-5 lg:grid-cols-2">
            <DifferencePanel title="Most jury-favoured" description="Jury points most exceeded televote points in shows that used both components." rows={juryFavoured} />
            <DifferencePanel title="Most televote-favoured" description="Televote points most exceeded jury points in shows that used both components." rows={teleFavoured} />
          </div>
        </div>
      )}

      {tab === "relationships" && (
        <div className="space-y-5">
          <SectionIntro
            eyebrow="Voting relationships"
            title="Who keeps finding each other?"
            description="Repeated two-way support and similar voting patterns. These are statistical patterns, not claims that delegations coordinate their votes."
          />
          <div className="grid gap-5 lg:grid-cols-2">
            <Panel title="Strongest mutual support" description="Pairs with the strongest opportunity-normalized support in both directions.">
              {relationData.friendships.length ? (
                <div className="divide-y divide-border/60">
                  {relationData.friendships.slice(0, 10).map((row, index) => <RelationshipRow key={`${row.a}-${row.b}`} rank={index + 1} row={row} cMap={cMap} />)}
                </div>
              ) : <Empty compact />}
            </Panel>
            <Panel title="Most one-sided" description="The biggest difference between support given and support returned.">
              {relationData.oneSided.length ? (
                <div className="divide-y divide-border/60">
                  {relationData.oneSided.slice(0, 10).map((row, index) => <OneSidedRow key={`${row.a}-${row.b}`} rank={index + 1} row={row} cMap={cMap} />)}
                </div>
              ) : <Empty compact />}
            </Panel>
            <Panel title="Voting twins" description="Pairs whose jury voting patterns are most similar.">
              {similarity.length ? (
                <div className="divide-y divide-border/60">
                  {similarity.slice(0, 10).map((row, index) => (
                    <PairRow key={`${row.a}-${row.b}`} rank={index + 1} a={cMap.get(row.a)} b={cMap.get(row.b)} value={`${(row.score * 100).toFixed(0)}%`} sublabel="voting similarity" />
                  ))}
                </div>
              ) : <Empty compact />}
            </Panel>
            <Panel title="Chord view" description="An optional visual summary of the strongest two-way flows. The ranked lists above are the easier way to read the same idea.">
              {filteredJury.length ? <ChordDiagram countries={cs} jury={filteredJury} /> : <Empty />}
            </Panel>
          </div>
        </div>
      )}

      {tab === "support" && (
        <div className="space-y-5">
          <SectionIntro
            eyebrow="Country support profile"
            title="Who gives points to whom?"
            description="Choose a country for a readable ranking first. The heat map is kept below as an advanced archive view."
          />
          {countryOptions.length ? (
            <>
              <Panel>
                <label htmlFor="analysis-country" className="mb-2 block text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Country</label>
                <select id="analysis-country" value={activeCountryId} onChange={(event) => setSelectedCountryId(event.target.value)} className="min-h-12 w-full max-w-md rounded-xl border border-border bg-surface px-3 text-sm font-semibold text-foreground outline-none">
                  {countryOptions.map((country) => <option key={country.id} value={country.id}>{country.name}</option>)}
                </select>
                {activeCountry && <div className="mt-4 flex items-center gap-3"><FlagChip code={activeCountry.short_code} color={activeCountry.accent_color} image={activeCountry.flag_image} size="md" /><div><p className="text-sm font-semibold">{activeCountry.name}</p><p className="text-[11px] text-muted-foreground">Selected archive support profile</p></div></div>}
              </Panel>
              <div className="grid gap-5 lg:grid-cols-2">
                <RankingPanel title="Receives most from" rows={supporters} cMap={cMap} />
                <RankingPanel title="Gives most to" rows={recipients} cMap={cMap} />
              </div>
              <details className="glass overflow-hidden">
                <summary className="cursor-pointer list-none px-4 py-4 text-sm font-semibold [&::-webkit-details-marker]:hidden">Advanced heat map ▾</summary>
                <div className="border-t border-border/60 p-4">{filteredJury.length ? <VotingHeatmap countries={cs} jury={filteredJury} /> : <Empty />}</div>
              </details>
            </>
          ) : <Empty />}
        </div>
      )}

      {tab === "connections" && (
        <div className="space-y-5">
          <SectionIntro
            eyebrow="Advanced visual"
            title="Connections map"
            description="Each dot is a country and each arrow is jury points flowing from giver to receiver. Thicker lines mean more accumulated support. If the map feels busy, the Relationships tab gives the same idea as ranked lists."
          />
          <Panel>
            {filteredJury.length ? <NetworkGraph countries={cs} jury={filteredJury} /> : <Empty />}
          </Panel>
        </div>
      )}

      {tab === "history" && (
        <div className="space-y-5">
          <SectionIntro
            eyebrow="All-time performance"
            title="History"
            description="Follow placements over time and see which countries accumulated the most points in the selected archive."
          />
          <Panel title="Historical leaderboard">
            {filteredResults.length ? <HistoricalLeaderboard countries={cs} editions={es} results={filteredResults} /> : <Empty />}
          </Panel>
          <Panel title="Most points in this filter">
            {historyRows.length ? (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {historyRows.slice(0, 12).map((row, index) => (
                  <Link key={row.country.id} to="/countries/$code" params={{ code: row.country.short_code }} className="flex items-center gap-3 rounded-xl bg-surface p-3">
                    <span className="numeric w-6 shrink-0 text-xs text-muted-foreground">#{index + 1}</span>
                    <FlagChip code={row.country.short_code} color={row.country.accent_color} image={row.country.flag_image} size="sm" />
                    <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{row.country.name}</p><p className="mt-0.5 text-[10px] text-muted-foreground">{row.appearances} results{row.averageRank != null ? ` · avg #${row.averageRank.toFixed(1)}` : ""}</p></div>
                    <span className="numeric text-sm font-bold">{row.totalPoints}</span>
                  </Link>
                ))}
              </div>
            ) : <Empty compact />}
          </Panel>
        </div>
      )}
    </AppShell>
  );
}

function ExplainerStat({ label, value, explanation }: { label: string; value: string; explanation: string }) {
  return (
    <div className="glass min-h-32 p-4">
      <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-primary">{label}</p>
      <p className="mt-2 break-words font-display text-lg font-bold leading-tight">{value}</p>
      <p className="mt-2 text-[10px] leading-5 text-muted-foreground">{explanation}</p>
    </div>
  );
}

function DiscoveryCard({ story, cMap }: { story: DiscoveryStory; cMap: Map<string, Country> }) {
  const country = story.countryId ? cMap.get(story.countryId) : undefined;
  const second = story.secondCountryId ? cMap.get(story.secondCountryId) : undefined;
  return (
    <article className="glass flex min-h-[220px] flex-col p-4 sm:p-5">
      <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-primary">{story.eyebrow}</p>
      <h3 className="mt-2 font-display text-xl font-bold leading-tight">{story.title}</h3>
      <p className="numeric mt-3 text-3xl font-black tracking-[-.04em]">{story.value}</p>
      <p className="mt-3 text-xs leading-6 text-muted-foreground">{story.description}</p>
      {(story.artist || story.song || story.editionLabel) && (
        <div className="mt-3 rounded-xl bg-surface/60 px-3 py-2.5">
          {story.editionLabel && <p className="text-[9px] font-bold uppercase tracking-[0.13em] text-muted-foreground">{story.editionLabel}</p>}
          {(story.artist || story.song) && <p className="mt-1 truncate text-xs font-semibold">{[story.artist, story.song].filter(Boolean).join(" · ")}</p>}
        </div>
      )}
      <div className="mt-auto flex flex-wrap gap-2 pt-4">
        {country && <Link to="/countries/$code" params={{ code: country.short_code }} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1.5 text-[10px] font-semibold"><FlagChip code={country.short_code} color={country.accent_color} image={country.flag_image} size="xs" />{country.name}</Link>}
        {second && <Link to="/countries/$code" params={{ code: second.short_code }} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1.5 text-[10px] font-semibold"><FlagChip code={second.short_code} color={second.accent_color} image={second.flag_image} size="xs" />{second.name}</Link>}
      </div>
    </article>
  );
}

function SectionIntro({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return <div><p className="text-[9px] font-bold uppercase tracking-[0.2em] text-primary">{eyebrow}</p><h2 className="mt-1 font-display text-2xl font-bold">{title}</h2><p className="mt-2 max-w-3xl text-xs leading-relaxed text-muted-foreground">{description}</p></div>;
}

function RelationshipRow({ rank, row, cMap }: { rank: number; row: { a: string; b: string; ab: number; ba: number; total: number }; cMap: Map<string, Country> }) {
  const a = cMap.get(row.a); const b = cMap.get(row.b); if (!a || !b) return null;
  return <Link to="/relationships/$pair" params={{ pair: `${a.short_code}-vs-${b.short_code}`.toUpperCase() }} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"><span className="numeric w-5 text-xs text-muted-foreground">{rank}</span><div className="flex -space-x-2"><FlagChip code={a.short_code} color={a.accent_color} image={a.flag_image} size="sm" /><FlagChip code={b.short_code} color={b.accent_color} image={b.flag_image} size="sm" /></div><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{a.name} · {b.name}</p><p className="mt-0.5 text-[10px] text-muted-foreground">{row.ab} ↔ {row.ba} normalized support</p></div><span className="numeric text-sm font-bold">{row.total}</span></Link>;
}

function OneSidedRow({ rank, row, cMap }: { rank: number; row: { a: string; b: string; ab: number; ba: number; gap: number }; cMap: Map<string, Country> }) {
  const a = cMap.get(row.a); const b = cMap.get(row.b); if (!a || !b) return null;
  return <div className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"><span className="numeric w-5 text-xs text-muted-foreground">{rank}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{a.name} → {b.name}</p><p className="mt-0.5 text-[10px] text-muted-foreground">{row.ab} support · {row.ba} returned</p></div><span className="numeric text-sm font-bold text-primary">+{row.gap}</span></div>;
}

function PairRow({ rank, a, b, value, sublabel }: { rank: number; a: Country | undefined; b: Country | undefined; value: string; sublabel: string }) {
  if (!a || !b) return null;
  return <div className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"><span className="numeric w-5 text-xs text-muted-foreground">{rank}</span><div className="flex -space-x-2"><FlagChip code={a.short_code} color={a.accent_color} image={a.flag_image} size="sm" /><FlagChip code={b.short_code} color={b.accent_color} image={b.flag_image} size="sm" /></div><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{a.name} · {b.name}</p><p className="mt-0.5 text-[10px] text-muted-foreground">{sublabel}</p></div><span className="numeric text-sm font-bold">{value}</span></div>;
}

function RankingPanel({ title, rows, cMap }: { title: string; rows: Array<[string, number]>; cMap: Map<string, Country> }) {
  return <Panel title={title}>{rows.length ? <div className="divide-y divide-border/60">{rows.map(([id, points], index) => { const country = cMap.get(id); if (!country) return null; return <Link key={id} to="/countries/$code" params={{ code: country.short_code }} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"><span className="numeric w-5 text-xs text-muted-foreground">{index + 1}</span><FlagChip code={country.short_code} color={country.accent_color} image={country.flag_image} size="sm" /><span className="min-w-0 flex-1 truncate text-sm font-semibold">{country.name}</span><span className="numeric text-sm font-bold">{points} pts</span></Link>; })}</div> : <Empty compact />}</Panel>;
}

type JuryTeleRow = { country: Country; jury: number; tele: number; difference: number };
function DifferencePanel({ title, description, rows }: { title: string; description: string; rows: JuryTeleRow[] }) {
  return <Panel title={title} description={description}>{rows.length ? <div className="divide-y divide-border/60">{rows.map((row, index) => <Link key={row.country.id} to="/countries/$code" params={{ code: row.country.short_code }} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"><span className="numeric w-5 text-xs text-muted-foreground">{index + 1}</span><FlagChip code={row.country.short_code} color={row.country.accent_color} image={row.country.flag_image} size="sm" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{row.country.name}</p><p className="mt-0.5 text-[10px] text-muted-foreground">Jury {row.jury} · Tele {row.tele}</p></div><span className="numeric text-sm font-bold">{Math.abs(row.difference)}</span></Link>)}</div> : <Empty compact />}</Panel>;
}

function Empty({ compact = false }: { compact?: boolean }) {
  return <div className={compact ? "py-5 text-center text-sm text-muted-foreground" : "py-12 text-center text-sm text-muted-foreground"}>Not enough data for this view.</div>;
}

function buildJuryTeleRows(results: ResultRow[], cMap: Map<string, Country>): JuryTeleRow[] {
  const totals = new Map<string, { jury: number; tele: number }>();
  results.forEach((row) => { const current = totals.get(row.country_id) ?? { jury: 0, tele: 0 }; current.jury += row.jury_points; current.tele += row.televote_points; totals.set(row.country_id, current); });
  return [...totals.entries()].map(([id, values]) => { const country = cMap.get(id); return country ? { country, jury: values.jury, tele: values.tele, difference: values.jury - values.tele } : null; }).filter((row): row is JuryTeleRow => Boolean(row));
}

type HistoryRow = { country: Country; totalPoints: number; appearances: number; averageRank: number | null };
function buildHistoryRows(results: ResultRow[], cMap: Map<string, Country>): HistoryRow[] {
  const totals = new Map<string, { totalPoints: number; appearances: number; ranks: number[] }>();
  results.forEach((row) => { const current = totals.get(row.country_id) ?? { totalPoints: 0, appearances: 0, ranks: [] }; current.totalPoints += row.total_points; current.appearances += 1; if (row.final_rank != null) current.ranks.push(row.final_rank); totals.set(row.country_id, current); });
  return [...totals.entries()].map(([id, values]) => { const country = cMap.get(id); if (!country) return null; return { country, totalPoints: values.totalPoints, appearances: values.appearances, averageRank: values.ranks.length ? values.ranks.reduce((sum, rank) => sum + rank, 0) / values.ranks.length : null }; }).filter((row): row is HistoryRow => Boolean(row)).sort((a, b) => b.totalPoints - a.totalPoints);
}
