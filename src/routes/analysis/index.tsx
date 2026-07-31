import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppShell, PageHeader, Panel, StatTile } from "@/components/AppShell";
import { FlagChip } from "@/components/FlagChip";
import { ChordDiagram } from "@/components/viz/ChordDiagram";
import { SankeyFlow } from "@/components/viz/SankeyFlow";
import { NetworkGraph } from "@/components/viz/NetworkGraph";
import { VotingHeatmap } from "@/components/viz/VotingHeatmap";
import { JuryVsTelevote } from "@/components/viz/JuryVsTelevote";
import { HistoricalLeaderboard } from "@/components/viz/HistoricalLeaderboard";
import { Filters, DEFAULT_ANALYSIS_FILTERS, type AnalysisFiltersState } from "@/components/viz/Filters";
import { regionalBias, relationships, votingClusters, votingSimilarity } from "@/lib/analysis";
import { computeVotingIntelligence } from "@/lib/stats";
import {
  useAllJuryVotes,
  useAllResults,
  useAllShows,
  useAllTelevotes,
  useCountries,
  useEditions,
} from "@/lib/data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/analysis/")({
  head: () => ({
    meta: [
      { title: "Voting intelligence & analysis — Solaris Scoreboard Studio" },
      {
        name: "description",
        content:
          "Interactive voting network graphs, chord diagrams, point-flow sankeys, heat maps, jury vs televote comparisons and alliance detection across Terra Solaris.",
      },
      { property: "og:title", content: "Voting intelligence & analysis — Solaris Scoreboard Studio" },
      {
        property: "og:description",
        content: "Explore voting patterns, alliances, clusters and regional bias across the Solaris Song Contest.",
      },
    ],
  }),
  component: AnalysisPage,
});

const SECTIONS = [
  { id: "network", label: "Network" },
  { id: "chord", label: "Chord" },
  { id: "sankey", label: "Flow" },
  { id: "heatmap", label: "Heat map" },
  { id: "jury-tele", label: "Jury vs Televote" },
  { id: "clusters", label: "Alliances" },
  { id: "bias", label: "Regional bias" },
  { id: "history", label: "Leaderboard" },
] as const;

function AnalysisPage() {
  const { data: countries } = useCountries();
  const { data: jury } = useAllJuryVotes();
  const { data: televotes } = useAllTelevotes();
  const { data: results } = useAllResults();
  const { data: shows } = useAllShows();
  const { data: editions } = useEditions();

  const [filters, setFilters] = useState<AnalysisFiltersState>(DEFAULT_ANALYSIS_FILTERS);
  const [tab, setTab] = useState<(typeof SECTIONS)[number]["id"]>("network");

  const cs = countries ?? [];
  const es = editions ?? [];
  const showsList = shows ?? [];

  const allowedShowIds = useMemo(() => {
    return new Set(
      showsList
        .filter((s) => (filters.editionIds.length ? filters.editionIds.includes(s.edition_id) : true))
        .filter((s) => (filters.showKind === "all" ? true : s.kind === filters.showKind))
        .map((s) => s.id),
    );
  }, [showsList, filters]);

  const filteredJury = useMemo(
    () => (jury ?? []).filter((v) => (v.show_id ? allowedShowIds.has(v.show_id) : filters.editionIds.length === 0 && filters.showKind === "all")),
    [jury, allowedShowIds, filters],
  );
  const filteredResults = useMemo(
    () => (results ?? []).filter((r) => (r.show_id ? allowedShowIds.has(r.show_id) : filters.editionIds.length === 0 && filters.showKind === "all")),
    [results, allowedShowIds, filters],
  );

  const votesForRelational = filters.voteType === "televote" ? [] : filteredJury;

  const sims = votingSimilarity(votesForRelational, cs).slice(0, 8);
  const { friendships, oneSided } = relationships(votesForRelational);
  const clusters = votingClusters(votesForRelational, cs, 0.62);
  const bias = regionalBias(votesForRelational, cs).slice(0, 6);
  const intelligence = useMemo(
    () => computeVotingIntelligence({ countries: cs, jury: votesForRelational, results: filteredResults }),
    [cs, votesForRelational, filteredResults],
  );

  const cMap = new Map(cs.map((c) => [c.id, c]));
  const label = (id: string) => cMap.get(id)?.name ?? "?";

  const hasVotes = votesForRelational.length > 0;
  const hasResults = filteredResults.length > 0;

  return (
    <AppShell>
      <PageHeader
        eyebrow="Intelligence"
        title="Voting intelligence & analysis"
        description="Interactive networks, flows and alliance detection computed from every jury vote, televote and result in Terra Solaris history."
      />

      <Filters editions={es} value={filters} onChange={setFilters} />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatTile
          label="Kingmaker"
          value={intelligence.kingmakers[0] ? cMap.get(intelligence.kingmakers[0].countryId)?.name ?? "—" : "—"}
          hint={intelligence.kingmakers[0] ? `${intelligence.kingmakers[0].influenceScore.toFixed(0)}% to eventual winners` : undefined}
        />
        <StatTile
          label="Most loyal voter"
          value={intelligence.loyaltyScore[0] ? cMap.get(intelligence.loyaltyScore[0].countryId)?.name ?? "—" : "—"}
          hint={intelligence.loyaltyScore[0] ? `${intelligence.loyaltyScore[0].score.toFixed(0)}% to one recipient` : undefined}
        />
        <StatTile
          label="Most diverse voter"
          value={intelligence.diversityScore[0] ? cMap.get(intelligence.diversityScore[0].countryId)?.name ?? "—" : "—"}
        />
        <StatTile
          label="Most predictable"
          value={intelligence.predictability[0] ? cMap.get(intelligence.predictability[0].countryId)?.name ?? "—" : "—"}
        />
        <StatTile
          label="Regional bias leader"
          value={bias[0] ? cMap.get(bias[0].id)?.name ?? "—" : "—"}
          hint={bias[0] ? `${(bias[0].share * 100).toFixed(0)}% kept in-region` : undefined}
        />
        <StatTile
          label="Jury/public disagreement"
          value={intelligence.juryPublicDisagreement != null ? intelligence.juryPublicDisagreement.toFixed(1) : "—"}
          hint="avg rank gap"
        />
      </div>

      <div className="mb-6 flex flex-wrap gap-1 overflow-x-auto rounded-xl bg-surface p-1">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            onClick={() => setTab(s.id)}
            className={cn(
              "shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
              tab === s.id ? "bg-aurora text-primary-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="grid gap-6">
        {tab === "network" && (
          <Panel
            title="Voting network"
            description="Countries as nodes, arrows weighted by cumulative jury points exchanged. Hover a node to trace its alliances; click to open its profile."
          >
            {hasVotes ? <NetworkGraph countries={cs} jury={votesForRelational} /> : <EmptyState />}
          </Panel>
        )}

        {tab === "chord" && (
          <Panel
            title="Point-exchange chord diagram"
            description="Ribbons show combined points exchanged between the most active countries. Thicker ribbons mean stronger mutual exchange."
          >
            {hasVotes ? <ChordDiagram countries={cs} jury={votesForRelational} /> : <EmptyState />}
          </Panel>
        )}

        {tab === "sankey" && (
          <Panel
            title="Point-transfer flow"
            description="Top givers on the left, top receivers on the right. Hover a country to isolate its flows."
          >
            {hasVotes ? <SankeyFlow countries={cs} jury={votesForRelational} /> : <EmptyState />}
          </Panel>
        )}

        {tab === "heatmap" && (
          <Panel
            title="Voting heat map"
            description="Rows give points to columns. Darker cells mean more points historically exchanged between that pair."
          >
            {hasVotes ? <VotingHeatmap countries={cs} jury={votesForRelational} /> : <EmptyState />}
          </Panel>
        )}

        {tab === "jury-tele" && (
          <Panel
            title="Jury vs televote"
            description="Average jury points vs average televote points per country for the current filter set. Bubble size reflects number of appearances."
          >
            {hasResults ? <JuryVsTelevote countries={cs} results={filteredResults} /> : <EmptyState />}
          </Panel>
        )}

        {tab === "clusters" && (
          <div className="grid gap-6 lg:grid-cols-2">
            <Panel title="Voting similarity" description="Cosine similarity of outgoing voting vectors">
              {sims.length ? (
                <ul className="space-y-2">
                  {sims.map((s, i) => (
                    <li key={i} className="flex items-center gap-3 rounded-xl bg-surface px-3 py-2">
                      <span className="flex-1 text-sm">
                        <Link to="/countries/$code" params={{ code: cMap.get(s.a)?.short_code ?? "" }} className="hover:underline">
                          {label(s.a)}
                        </Link>{" "}
                        <span className="text-muted-foreground">&</span>{" "}
                        <Link to="/countries/$code" params={{ code: cMap.get(s.b)?.short_code ?? "" }} className="hover:underline">
                          {label(s.b)}
                        </Link>
                      </span>
                      <span className="h-1.5 w-24 overflow-hidden rounded-full bg-background">
                        <span className="bg-aurora block h-full" style={{ width: `${s.score * 100}%` }} />
                      </span>
                      <span className="numeric w-14 text-right text-sm font-semibold">{(s.score * 100).toFixed(0)}%</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState />
              )}
            </Panel>

            <Panel title="Alliances & friendships" description="Strong mutual point exchanges">
              {friendships.length ? (
                <ul className="space-y-2">
                  {friendships.slice(0, 8).map((f, i) => (
                    <li key={i} className="rounded-xl bg-surface px-3 py-2 text-sm">
                      <div className="flex items-center justify-between">
                        <span>
                          {label(f.a)} ↔ {label(f.b)}
                        </span>
                        <span className="numeric font-semibold">{f.total} pts</span>
                      </div>
                      <p className="numeric mt-1 text-xs text-muted-foreground">
                        {label(f.a)} → {f.ab} · {label(f.b)} → {f.ba}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState />
              )}
            </Panel>

            <Panel title="One-sided relationships" description="Support that is rarely returned">
              {oneSided.length ? (
                <ul className="space-y-2">
                  {oneSided.slice(0, 8).map((o, i) => (
                    <li key={i} className="rounded-xl bg-surface px-3 py-2 text-sm">
                      <span className="font-medium">{label(o.a)}</span> frequently supports{" "}
                      <span className="font-medium">{label(o.b)}</span>, but gets little back.
                      <p className="numeric mt-1 text-xs text-muted-foreground">
                        {o.ab} given vs {o.ba} received · gap {o.gap}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">No lopsided pairs detected.</p>
              )}
            </Panel>

            <Panel title="Voting clusters" description="Groups voting in similar patterns (similarity ≥ 62%)">
              {clusters.length ? (
                <div className="space-y-3">
                  {clusters.map((group, i) => (
                    <div key={i} className="rounded-xl bg-surface p-3">
                      <p className="mb-2 text-xs uppercase tracking-widest text-muted-foreground">Cluster {i + 1}</p>
                      <div className="flex flex-wrap gap-2">
                        {group.map((id) => {
                          const c = cMap.get(id);
                          if (!c) return null;
                          return (
                            <Link
                              key={id}
                              to="/countries/$code"
                              params={{ code: c.short_code }}
                              className="flex items-center gap-2 rounded-lg bg-background/50 px-2 py-1 text-xs hover:bg-background"
                            >
                              <FlagChip code={c.short_code} color={c.accent_color} image={c.flag_image} size="sm" />
                              {c.name}
                            </Link>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No clusters above threshold.</p>
              )}
            </Panel>
          </div>
        )}

        {tab === "bias" && (
          <Panel title="Regional bias" description="Share of points a country keeps inside its own region">
            {bias.length ? (
              <ul className="grid gap-2 sm:grid-cols-2">
                {bias.map((b) => {
                  const c = cMap.get(b.id);
                  if (!c) return null;
                  return (
                    <li key={b.id} className="flex items-center gap-3 rounded-xl bg-surface px-3 py-2">
                      <Link to="/countries/$code" params={{ code: c.short_code }}>
                        <FlagChip code={c.short_code} color={c.accent_color} image={c.flag_image} size="sm" />
                      </Link>
                      <span className="flex-1 text-sm">{c.name}</span>
                      <span className="numeric text-sm font-semibold">{(b.share * 100).toFixed(0)}%</span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <EmptyState />
            )}
          </Panel>
        )}

        {tab === "history" && (
          <Panel
            title="Historical leaderboard"
            description="Grand final ranking of the most frequent participants across editions in the current filter set — lower is better."
          >
            {hasResults ? (
              <HistoricalLeaderboard countries={cs} editions={es} results={filteredResults} />
            ) : (
              <EmptyState />
            )}
          </Panel>
        )}
      </div>
    </AppShell>
  );
}

function EmptyState() {
  return (
    <div className="grid place-items-center rounded-xl border border-dashed border-border py-16 text-center text-sm text-muted-foreground">
      Not enough data yet for this filter combination — try widening the edition or show selection.
    </div>
  );
}
