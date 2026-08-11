import { createFileRoute, Link } from "@tanstack/react-router";

import { useMemo, useState } from "react";

import { AppShell, PageHeader, Panel, StatTile } from "@/components/AppShell";

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
  useAllResults,
  useAllShows,
  useCountries,
  useEditions,
} from "@/lib/data";

import { computeRelationship, computeVotingIntelligence } from "@/lib/stats";

export const Route = createFileRoute("/analysis/")({
  head: () => ({
    meta: [
      {
        title: "Analysis — Solaris Studio",
      },
    ],
  }),

  component: AnalysisPage,
});

const DESKTOP_TABS = [
  {
    value: "network",
    label: "Network",
  },
  {
    value: "heatmap",
    label: "Heat map",
  },
  {
    value: "jurytele",
    label: "Jury vs Tele",
  },
  {
    value: "relationships",
    label: "Relationships",
  },
  {
    value: "history",
    label: "History",
  },
] as const;

const MOBILE_TABS = [
  {
    value: "network",
    label: "Connections",
  },
  {
    value: "heatmap",
    label: "Support",
  },
  {
    value: "jurytele",
    label: "Jury vs Tele",
  },
  {
    value: "relationships",
    label: "Pairs",
  },
  {
    value: "history",
    label: "History",
  },
] as const;

type Tab = (typeof DESKTOP_TABS)[number]["value"];

function AnalysisPage() {
  const { data: countries } = useCountries();

  const { data: jury } = useAllJuryVotes();

  const { data: results } = useAllResults();

  const { data: shows } = useAllShows();

  const { data: editions } = useEditions();

  const [filters, setFilters] = useState<AnalysisFiltersState>(DEFAULT_ANALYSIS_FILTERS);

  const [tab, setTab] = useState<Tab>("network");

  const [selectedCountryId, setSelectedCountryId] = useState("");

  const cs = countries ?? [];

  const es = editions ?? [];

  const showsList = shows ?? [];

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

  const relationData = useMemo(() => {
    const pairs = [];

    for (let aIndex = 0; aIndex < cs.length; aIndex += 1) {
      for (let bIndex = aIndex + 1; bIndex < cs.length; bIndex += 1) {
        const a = cs[aIndex];
        const b = cs[bIndex];

        const relationship = computeRelationship(a.id, b.id, {
          editions: es,
          jury: filteredJury,
          results: filteredResults,
          shows: showsList.filter((show) => allowedShowIds.has(show.id)),
        });

        if (relationship.opportunitiesAtoB === 0 && relationship.opportunitiesBtoA === 0) {
          continue;
        }

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
      friendships: pairs
        .filter((pair) => pair.ab > 0 && pair.ba > 0)
        .sort((a, b) => b.total - a.total),
      oneSided: pairs
        .filter((pair) => pair.gap >= 15)
        .map((pair) =>
          pair.ab >= pair.ba
            ? pair
            : {
                ...pair,
                a: pair.b,
                b: pair.a,
                ab: pair.ba,
                ba: pair.ab,
              },
        )
        .sort((a, b) => b.gap - a.gap),
    };
  }, [cs, es, filteredJury, filteredResults, showsList, allowedShowIds]);

  const bias = useMemo(() => regionalBias(filteredJury, cs), [filteredJury, cs]);

  const countryOptions = useMemo(
    () =>
      cs
        .filter((country) =>
          filteredJury.some(
            (vote) =>
              vote.voter_country_id === country.id || vote.receiving_country_id === country.id,
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

  const supporters = activeCountryId ? topSupporters(filteredJury, activeCountryId, 7) : [];

  const recipients = activeCountryId ? topRecipients(filteredJury, activeCountryId, 7) : [];

  const juryTeleRows = useMemo(
    () => buildJuryTeleRows(filteredResults, cMap),
    [filteredResults, cMap],
  );

  const juryFavoured = juryTeleRows
    .filter((row) => row.difference > 0)
    .sort((a, b) => b.difference - a.difference)
    .slice(0, 6);

  const teleFavoured = juryTeleRows
    .filter((row) => row.difference < 0)
    .sort((a, b) => a.difference - b.difference)
    .slice(0, 6);

  const mostAgreed = [...juryTeleRows]
    .sort((a, b) => Math.abs(a.difference) - Math.abs(b.difference))
    .slice(0, 6);

  const historyRows = useMemo(
    () => buildHistoryRows(filteredResults, cMap),
    [filteredResults, cMap],
  );

  const strongestFriendship = relationData.friendships[0];

  const strongestOneSided = relationData.oneSided[0];

  return (
    <AppShell>
      <PageHeader
        eyebrow="Intelligence"
        title="Analysis"
        description="Explore the patterns behind Solaris voting, relationships and results."
      />

      <div className="mb-5">
        <Filters editions={es} value={filters} onChange={setFilters} />
      </div>

      {/* =====================================================
          MOBILE OVERVIEW
         ===================================================== */}

      <div className="mb-5 md:hidden">
        <div className="grid grid-cols-2 gap-3">
          <InsightCard
            label="Kingmaker"
            value={
              intelligence.kingmakers[0]
                ? (cMap.get(intelligence.kingmakers[0].countryId)?.name ?? "—")
                : "—"
            }
            detail="Most aligned with winners"
          />

          <InsightCard
            label="Most loyal"
            value={
              intelligence.loyaltyScore[0]
                ? (cMap.get(intelligence.loyaltyScore[0].countryId)?.name ?? "—")
                : "—"
            }
            detail="Strongest repeat support"
          />

          <InsightCard
            label="Top friendship"
            value={
              strongestFriendship
                ? pairName(strongestFriendship.a, strongestFriendship.b, cMap)
                : "—"
            }
            detail={
              strongestFriendship ? `${strongestFriendship.total} exchanged pts` : "No pair data"
            }
          />

          <InsightCard
            label="Regional bias"
            value={bias[0] ? (cMap.get(bias[0].id)?.name ?? "—") : "—"}
            detail={bias[0] ? `${(bias[0].share * 100).toFixed(0)}% in-region` : "No regional data"}
          />
        </div>
      </div>

      {/* =====================================================
          DESKTOP OVERVIEW
         ===================================================== */}

      <Panel className="mb-5 hidden md:block">
        <div className="grid grid-cols-3 gap-5">
          <StatTile
            label="Kingmaker"
            value={
              intelligence.kingmakers[0]
                ? (cMap.get(intelligence.kingmakers[0].countryId)?.name ?? "—")
                : "—"
            }
          />

          <StatTile
            label="Most loyal"
            value={
              intelligence.loyaltyScore[0]
                ? (cMap.get(intelligence.loyaltyScore[0].countryId)?.name ?? "—")
                : "—"
            }
          />

          <StatTile
            label="Regional bias"
            value={bias[0] ? (cMap.get(bias[0].id)?.name ?? "—") : "—"}
          />
        </div>
      </Panel>

      {/* =====================================================
          MOBILE TABS
         ===================================================== */}

      <div className="md:hidden">
        <ResponsiveTabs
          value={tab}
          options={MOBILE_TABS}
          onChange={setTab}
          label="Analysis view"
          className="mb-5"
        />
      </div>

      {/* =====================================================
          DESKTOP TABS
         ===================================================== */}

      <div className="hidden md:block">
        <ResponsiveTabs
          value={tab}
          options={DESKTOP_TABS}
          onChange={setTab}
          label="Analysis view"
          className="mb-5"
        />
      </div>

      {/* =====================================================
          CONNECTIONS
         ===================================================== */}

      {tab === "network" && (
        <>
          <div className="space-y-4 md:hidden">
            <SectionIntro
              eyebrow="Voting network"
              title="Strongest connections"
              description="The pairs with the strongest opportunity-normalized two-way support."
            />

            {relationData.friendships.length ? (
              <div className="space-y-2">
                {relationData.friendships.slice(0, 10).map((row, index) => (
                  <RelationshipCard
                    key={`${row.a}-${row.b}`}
                    rank={index + 1}
                    a={cMap.get(row.a)}
                    b={cMap.get(row.b)}
                    aPoints={row.ab}
                    bPoints={row.ba}
                    total={row.total}
                  />
                ))}
              </div>
            ) : (
              <Empty />
            )}

            {strongestOneSided && (
              <Panel title="Most one-sided" description="When the affection is not exactly mutual.">
                <OneSidedCard row={strongestOneSided} cMap={cMap} />
              </Panel>
            )}
          </div>

          <div className="hidden md:block">
            <Panel
              title="Voting network"
              description="Raw point-flow network; open a pair for normalized support and expected-value analysis."
            >
              {filteredJury.length ? (
                <NetworkGraph countries={cs} jury={filteredJury} />
              ) : (
                <Empty />
              )}
            </Panel>
          </div>
        </>
      )}

      {/* =====================================================
          SUPPORT
         ===================================================== */}

      {tab === "heatmap" && (
        <>
          <div className="space-y-4 md:hidden">
            <SectionIntro
              eyebrow="Voting behaviour"
              title="Who supports who?"
              description="Choose a country to see where its support comes from and where its own points go."
            />

            {countryOptions.length ? (
              <>
                <Panel>
                  <label
                    htmlFor="analysis-country"
                    className="mb-2 block text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground"
                  >
                    Country
                  </label>

                  <select
                    id="analysis-country"
                    value={activeCountryId}
                    onChange={(event) => setSelectedCountryId(event.target.value)}
                    className="min-h-12 w-full rounded-xl border border-border bg-surface px-3 text-sm font-semibold text-foreground outline-none"
                  >
                    {countryOptions.map((country) => (
                      <option key={country.id} value={country.id}>
                        {country.name}
                      </option>
                    ))}
                  </select>

                  {activeCountry && (
                    <div className="mt-4 flex items-center gap-3">
                      <FlagChip
                        code={activeCountry.short_code}
                        color={activeCountry.accent_color}
                        image={activeCountry.flag_image}
                        size="md"
                      />

                      <div>
                        <p className="font-display text-lg font-bold">{activeCountry.name}</p>

                        <p className="text-[11px] text-muted-foreground">Voting support profile</p>
                      </div>
                    </div>
                  )}
                </Panel>

                <MobileRankingPanel
                  title="Receives most from"
                  description={
                    activeCountry
                      ? `Countries giving ${activeCountry.name} the most points.`
                      : undefined
                  }
                  rows={supporters}
                  cMap={cMap}
                />

                <MobileRankingPanel
                  title="Gives most to"
                  description={
                    activeCountry
                      ? `Countries receiving the most points from ${activeCountry.name}.`
                      : undefined
                  }
                  rows={recipients}
                  cMap={cMap}
                />

                {activeCountry && supporters[0] && recipients[0] && (
                  <Panel>
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">
                      Quick read
                    </p>

                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                      {activeCountry.name} receives the most support from{" "}
                      <strong className="text-foreground">
                        {cMap.get(supporters[0][0])?.name ?? "another country"}
                      </strong>
                      , while giving the most points to{" "}
                      <strong className="text-foreground">
                        {cMap.get(recipients[0][0])?.name ?? "another country"}
                      </strong>
                      .
                    </p>
                  </Panel>
                )}
              </>
            ) : (
              <Empty />
            )}
          </div>

          <div className="hidden md:block">
            <Panel title="Voting heat map">
              {filteredJury.length ? (
                <VotingHeatmap countries={cs} jury={filteredJury} />
              ) : (
                <Empty />
              )}
            </Panel>
          </div>
        </>
      )}

      {/* =====================================================
          JURY VS TELE
         ===================================================== */}

      {tab === "jurytele" && (
        <>
          <div className="space-y-4 md:hidden">
            <SectionIntro
              eyebrow="Split vote"
              title="Where jury and televote disagreed"
              description="The biggest differences between jury and public support."
            />

            <DifferencePanel
              title="Most jury-favoured"
              description="Countries whose jury score most exceeded their televote."
              rows={juryFavoured}
            />

            <DifferencePanel
              title="Most televote-favoured"
              description="Countries whose televote most exceeded their jury score."
              rows={teleFavoured}
            />

            <DifferencePanel
              title="Most agreed upon"
              description="Countries where jury and televote landed closest together."
              rows={mostAgreed}
            />
          </div>

          <div className="hidden md:block">
            <Panel title="Jury vs televote">
              {filteredResults.length ? (
                <JuryVsTelevote countries={cs} results={filteredResults} />
              ) : (
                <Empty />
              )}
            </Panel>
          </div>
        </>
      )}

      {/* =====================================================
          RELATIONSHIPS
         ===================================================== */}

      {tab === "relationships" && (
        <>
          <div className="space-y-4 md:hidden">
            <SectionIntro
              eyebrow="Relationships"
              title="Voting pairs"
              description="Similarity, friendships and one-sided voting relationships."
            />

            <Panel title="Voting twins" description="Pairs whose voting patterns are most alike.">
              {similarity.length ? (
                <div className="divide-y divide-border/60">
                  {similarity.slice(0, 8).map((row, index) => (
                    <PairRow
                      key={`${row.a}-${row.b}`}
                      rank={index + 1}
                      a={cMap.get(row.a)}
                      b={cMap.get(row.b)}
                      value={`${(row.score * 100).toFixed(0)}%`}
                      sublabel="similarity"
                    />
                  ))}
                </div>
              ) : (
                <Empty compact />
              )}
            </Panel>

            <Panel
              title="Strongest friendships"
              description="Pairs with the strongest normalized support in both directions."
            >
              {relationData.friendships.length ? (
                <div className="divide-y divide-border/60">
                  {relationData.friendships.slice(0, 8).map((row, index) => {
                    const a = cMap.get(row.a);

                    const b = cMap.get(row.b);

                    if (!a || !b) {
                      return null;
                    }

                    return (
                      <Link
                        key={`${row.a}-${row.b}`}
                        to="/relationships/$pair"
                        params={{
                          pair: `${a.short_code}-vs-${b.short_code}`.toUpperCase(),
                        }}
                        className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
                      >
                        <span className="numeric w-5 shrink-0 text-xs text-muted-foreground">
                          {index + 1}
                        </span>

                        <div className="flex -space-x-2">
                          <FlagChip
                            code={a.short_code}
                            color={a.accent_color}
                            image={a.flag_image}
                            size="sm"
                          />

                          <FlagChip
                            code={b.short_code}
                            color={b.accent_color}
                            image={b.flag_image}
                            size="sm"
                          />
                        </div>

                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold">
                            {a.name} · {b.name}
                          </p>

                          <p className="mt-0.5 text-[10px] text-muted-foreground">
                            {row.ab} ↔ {row.ba} normalized
                          </p>
                        </div>

                        <span className="numeric text-sm font-bold">{row.total}%</span>
                      </Link>
                    );
                  })}
                </div>
              ) : (
                <Empty compact />
              )}
            </Panel>

            <Panel
              title="Most one-sided"
              description="The biggest gaps between points given and returned."
            >
              {relationData.oneSided.length ? (
                <div className="divide-y divide-border/60">
                  {relationData.oneSided.slice(0, 8).map((row, index) => (
                    <OneSidedRow key={`${row.a}-${row.b}`} rank={index + 1} row={row} cMap={cMap} />
                  ))}
                </div>
              ) : (
                <Empty compact />
              )}
            </Panel>
          </div>

          {/* DESKTOP RELATIONSHIPS */}

          <div className="hidden md:block">
            <div className="grid gap-5 lg:grid-cols-2">
              <Panel title="Most similar voting">
                <div className="divide-y divide-border/60">
                  {similarity.slice(0, 8).map((row, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                    >
                      <span className="min-w-0 truncate text-sm">
                        {cMap.get(row.a)?.name ?? "?"} · {cMap.get(row.b)?.name ?? "?"}
                      </span>

                      <span className="numeric text-sm font-semibold">
                        {(row.score * 100).toFixed(0)}%
                      </span>
                    </div>
                  ))}
                </div>
              </Panel>

              <Panel title="Normalized relationships">
                <div className="divide-y divide-border/60">
                  {relationData.friendships.slice(0, 8).map((row, index) => {
                    const a = cMap.get(row.a);

                    const b = cMap.get(row.b);

                    return (
                      <Link
                        key={index}
                        to="/relationships/$pair"
                        params={{
                          pair: `${a?.short_code ?? ""}-vs-${b?.short_code ?? ""}`.toUpperCase(),
                        }}
                        className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                      >
                        <span className="min-w-0 truncate text-sm">
                          {a?.name ?? "?"} · {b?.name ?? "?"}
                        </span>

                        <span className="numeric text-sm font-semibold">{row.total}%</span>
                      </Link>
                    );
                  })}
                </div>
              </Panel>

              <Panel title="Chord view" className="lg:col-span-2">
                {filteredJury.length ? (
                  <ChordDiagram countries={cs} jury={filteredJury} />
                ) : (
                  <Empty />
                )}
              </Panel>
            </div>
          </div>
        </>
      )}

      {/* =====================================================
          HISTORY
         ===================================================== */}

      {tab === "history" && (
        <>
          <div className="space-y-4 md:hidden">
            <SectionIntro
              eyebrow="All-time performance"
              title="Historical leaders"
              description="Countries ranked by accumulated points in the selected period."
            />

            <Panel>
              {historyRows.length ? (
                <div className="divide-y divide-border/60">
                  {historyRows.slice(0, 12).map((row, index) => (
                    <Link
                      key={row.country.id}
                      to="/countries/$code"
                      params={{
                        code: row.country.short_code,
                      }}
                      className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
                    >
                      <span className="numeric w-7 shrink-0 text-center text-xs font-semibold text-muted-foreground">
                        #{index + 1}
                      </span>

                      <FlagChip
                        code={row.country.short_code}
                        color={row.country.accent_color}
                        image={row.country.flag_image}
                        size="sm"
                      />

                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{row.country.name}</p>

                        <p className="mt-0.5 text-[10px] text-muted-foreground">
                          {row.appearances} results
                          {row.averageRank != null ? ` · avg #${row.averageRank.toFixed(1)}` : ""}
                        </p>
                      </div>

                      <div className="text-right">
                        <p className="numeric text-sm font-bold">{row.totalPoints}</p>

                        <p className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
                          pts
                        </p>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <Empty compact />
              )}
            </Panel>

            {historyRows.length > 0 && (
              <div className="grid grid-cols-2 gap-3">
                <InsightCard
                  label="Most points"
                  value={historyRows[0].country.name}
                  detail={`${historyRows[0].totalPoints} pts`}
                />

                <InsightCard
                  label="Best average"
                  value={
                    [...historyRows]
                      .filter((row) => row.averageRank != null)
                      .sort((a, b) => (a.averageRank ?? 999) - (b.averageRank ?? 999))[0]?.country
                      .name ?? "—"
                  }
                  detail="Lowest average placing"
                />
              </div>
            )}
          </div>

          <div className="hidden md:block">
            <Panel title="Historical leaderboard">
              {filteredResults.length ? (
                <HistoricalLeaderboard countries={cs} editions={es} results={filteredResults} />
              ) : (
                <Empty />
              )}
            </Panel>
          </div>
        </>
      )}
    </AppShell>
  );
}

/* ============================================================
   INSIGHT CARD
   ============================================================ */

function InsightCard({
  label,
  value,
  detail,
}: {
  label: string;

  value: string;

  detail: string;
}) {
  return (
    <div className="glass min-h-[132px] p-4">
      <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-primary">{label}</p>

      <p className="mt-3 break-words font-display text-lg font-bold leading-tight">{value}</p>

      <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">{detail}</p>
    </div>
  );
}

/* ============================================================
   SECTION INTRO
   ============================================================ */

function SectionIntro({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;

  title: string;

  description: string;
}) {
  return (
    <div>
      <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-primary">{eyebrow}</p>

      <h2 className="mt-1 font-display text-2xl font-bold">{title}</h2>

      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{description}</p>
    </div>
  );
}

/* ============================================================
   RELATIONSHIP CARD
   ============================================================ */

function RelationshipCard({
  rank,
  a,
  b,
  aPoints,
  bPoints,
  total,
}: {
  rank: number;

  a: Country | undefined;

  b: Country | undefined;

  aPoints: number;

  bPoints: number;

  total: number;
}) {
  if (!a || !b) {
    return null;
  }

  const reciprocity = total
    ? Math.round((Math.min(aPoints, bPoints) / Math.max(aPoints, bPoints, 1)) * 100)
    : 0;

  return (
    <Link
      to="/relationships/$pair"
      params={{
        pair: `${a.short_code}-vs-${b.short_code}`.toUpperCase(),
      }}
      className="glass block p-4"
    >
      <div className="flex items-start gap-3">
        <span className="numeric mt-1 w-6 shrink-0 text-xs font-bold text-muted-foreground">
          #{rank}
        </span>

        <div className="flex -space-x-2">
          <FlagChip code={a.short_code} color={a.accent_color} image={a.flag_image} size="sm" />

          <FlagChip code={b.short_code} color={b.accent_color} image={b.flag_image} size="sm" />
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-base font-bold">
            {a.name} ↔ {b.name}
          </p>

          <p className="mt-1 text-[10px] text-muted-foreground">Strong two-way connection</p>
        </div>

        <span className="numeric text-sm font-bold">{total}</span>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl bg-surface/50 p-3 text-center">
        <MiniStat label={`${a.short_code} → ${b.short_code}`} value={aPoints} />

        <MiniStat label={`${b.short_code} → ${a.short_code}`} value={bPoints} />

        <MiniStat label="Reciprocity" value={`${reciprocity}%`} />
      </div>
    </Link>
  );
}

/* ============================================================
   ONE SIDED CARD
   ============================================================ */

function OneSidedCard({
  row,
  cMap,
}: {
  row: {
    a: string;
    b: string;
    ab: number;
    ba: number;
    gap: number;
  };

  cMap: Map<string, Country>;
}) {
  const a = cMap.get(row.a);

  const b = cMap.get(row.b);

  if (!a || !b) {
    return <Empty compact />;
  }

  return (
    <div>
      <div className="flex items-center gap-3">
        <FlagChip code={a.short_code} color={a.accent_color} image={a.flag_image} size="md" />

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">
            {a.name} → {b.name}
          </p>

          <p className="mt-1 text-[10px] text-muted-foreground">{row.gap} normalized-support gap</p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <MiniStat label={`${a.short_code} → ${b.short_code}`} value={row.ab} />

        <MiniStat label={`${b.short_code} → ${a.short_code}`} value={row.ba} />
      </div>
    </div>
  );
}

/* ============================================================
   ONE SIDED ROW
   ============================================================ */

function OneSidedRow({
  rank,
  row,
  cMap,
}: {
  rank: number;

  row: {
    a: string;
    b: string;
    ab: number;
    ba: number;
    gap: number;
  };

  cMap: Map<string, Country>;
}) {
  const a = cMap.get(row.a);

  const b = cMap.get(row.b);

  if (!a || !b) {
    return null;
  }

  return (
    <div className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
      <span className="numeric w-5 shrink-0 text-xs text-muted-foreground">{rank}</span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">
          {a.name} → {b.name}
        </p>

        <p className="mt-0.5 text-[10px] text-muted-foreground">
          {row.ab} support · {row.ba} returned
        </p>
      </div>

      <span className="numeric text-sm font-bold text-primary">+{row.gap}</span>
    </div>
  );
}

/* ============================================================
   PAIR ROW
   ============================================================ */

function PairRow({
  rank,
  a,
  b,
  value,
  sublabel,
}: {
  rank: number;

  a: Country | undefined;

  b: Country | undefined;

  value: string;

  sublabel: string;
}) {
  if (!a || !b) {
    return null;
  }

  return (
    <div className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
      <span className="numeric w-5 shrink-0 text-xs text-muted-foreground">{rank}</span>

      <div className="flex -space-x-2">
        <FlagChip code={a.short_code} color={a.accent_color} image={a.flag_image} size="sm" />

        <FlagChip code={b.short_code} color={b.accent_color} image={b.flag_image} size="sm" />
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">
          {a.name} · {b.name}
        </p>

        <p className="mt-0.5 text-[10px] text-muted-foreground">{sublabel}</p>
      </div>

      <span className="numeric text-sm font-bold">{value}</span>
    </div>
  );
}

/* ============================================================
   RANKING PANEL
   ============================================================ */

function MobileRankingPanel({
  title,
  description,
  rows,
  cMap,
}: {
  title: string;

  description?: string;

  rows: Array<[string, number]>;

  cMap: Map<string, Country>;
}) {
  return (
    <Panel title={title} description={description}>
      {rows.length ? (
        <div className="divide-y divide-border/60">
          {rows.map(([id, points], index) => {
            const country = cMap.get(id);

            if (!country) {
              return null;
            }

            return (
              <Link
                key={id}
                to="/countries/$code"
                params={{
                  code: country.short_code,
                }}
                className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
              >
                <span className="numeric w-5 shrink-0 text-xs text-muted-foreground">
                  {index + 1}
                </span>

                <FlagChip
                  code={country.short_code}
                  color={country.accent_color}
                  image={country.flag_image}
                  size="sm"
                />

                <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                  {country.name}
                </span>

                <span className="numeric text-sm font-bold">
                  {points} <span className="text-[9px] font-normal text-muted-foreground">pts</span>
                </span>
              </Link>
            );
          })}
        </div>
      ) : (
        <Empty compact />
      )}
    </Panel>
  );
}

/* ============================================================
   JURY / TELE
   ============================================================ */

type JuryTeleRow = {
  country: Country;

  jury: number;

  tele: number;

  difference: number;
};

function DifferencePanel({
  title,
  description,
  rows,
}: {
  title: string;

  description: string;

  rows: JuryTeleRow[];
}) {
  return (
    <Panel title={title} description={description}>
      {rows.length ? (
        <div className="divide-y divide-border/60">
          {rows.map((row, index) => {
            const gap = Math.abs(row.difference);

            return (
              <Link
                key={row.country.id}
                to="/countries/$code"
                params={{
                  code: row.country.short_code,
                }}
                className="block py-3 first:pt-0 last:pb-0"
              >
                <div className="flex items-center gap-3">
                  <span className="numeric w-5 shrink-0 text-xs text-muted-foreground">
                    {index + 1}
                  </span>

                  <FlagChip
                    code={row.country.short_code}
                    color={row.country.accent_color}
                    image={row.country.flag_image}
                    size="sm"
                  />

                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                    {row.country.name}
                  </span>

                  <span className="numeric text-sm font-bold">{gap}</span>
                </div>

                <div className="ml-8 mt-2 grid grid-cols-2 gap-2">
                  <MiniStat label="Jury" value={row.jury} />

                  <MiniStat label="Televote" value={row.tele} />
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        <Empty compact />
      )}
    </Panel>
  );
}

/* ============================================================
   SMALL STAT
   ============================================================ */

function MiniStat({
  label,
  value,
}: {
  label: string;

  value: string | number;
}) {
  return (
    <div className="rounded-lg bg-surface/70 px-2 py-2">
      <p className="numeric text-sm font-bold">{value}</p>

      <p className="mt-0.5 truncate text-[8px] uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </p>
    </div>
  );
}

/* ============================================================
   EMPTY
   ============================================================ */

function Empty({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={
        compact
          ? "py-5 text-center text-sm text-muted-foreground"
          : "py-12 text-center text-sm text-muted-foreground"
      }
    >
      Not enough data for this view.
    </div>
  );
}

/* ============================================================
   DATA HELPERS
   ============================================================ */

function pairName(aId: string, bId: string, cMap: Map<string, Country>) {
  const a = cMap.get(aId)?.name ?? "?";

  const b = cMap.get(bId)?.name ?? "?";

  return `${a} · ${b}`;
}

function buildJuryTeleRows(results: ResultRow[], cMap: Map<string, Country>): JuryTeleRow[] {
  const totals = new Map<
    string,
    {
      jury: number;
      tele: number;
    }
  >();

  results.forEach((row) => {
    const current = totals.get(row.country_id) ?? {
      jury: 0,
      tele: 0,
    };

    current.jury += row.jury_points;

    current.tele += row.televote_points;

    totals.set(row.country_id, current);
  });

  return [...totals.entries()]
    .map(([id, values]) => {
      const country = cMap.get(id);

      if (!country) {
        return null;
      }

      return {
        country,
        jury: values.jury,
        tele: values.tele,
        difference: values.jury - values.tele,
      };
    })
    .filter((row): row is JuryTeleRow => !!row);
}

type HistoryRow = {
  country: Country;

  totalPoints: number;

  appearances: number;

  averageRank: number | null;
};

function buildHistoryRows(results: ResultRow[], cMap: Map<string, Country>): HistoryRow[] {
  const totals = new Map<
    string,
    {
      totalPoints: number;
      appearances: number;
      ranks: number[];
    }
  >();

  results.forEach((row) => {
    const current = totals.get(row.country_id) ?? {
      totalPoints: 0,
      appearances: 0,
      ranks: [],
    };

    current.totalPoints += row.total_points;

    current.appearances += 1;

    if (row.final_rank != null) {
      current.ranks.push(row.final_rank);
    }

    totals.set(row.country_id, current);
  });

  return [...totals.entries()]
    .map(([id, values]) => {
      const country = cMap.get(id);

      if (!country) {
        return null;
      }

      const averageRank = values.ranks.length
        ? values.ranks.reduce((sum, rank) => sum + rank, 0) / values.ranks.length
        : null;

      return {
        country,
        totalPoints: values.totalPoints,
        appearances: values.appearances,
        averageRank,
      };
    })
    .filter((row): row is HistoryRow => !!row)
    .sort((a, b) => b.totalPoints - a.totalPoints);
}
