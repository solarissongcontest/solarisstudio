import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { AppShell, PageHeader, Panel, StatTile } from "@/components/AppShell";
import { ResponsiveTabs } from "@/components/ResponsiveTabs";
import { ChordDiagram } from "@/components/viz/ChordDiagram";
import { Filters, DEFAULT_ANALYSIS_FILTERS, type AnalysisFiltersState } from "@/components/viz/Filters";
import { HistoricalLeaderboard } from "@/components/viz/HistoricalLeaderboard";
import { JuryVsTelevote } from "@/components/viz/JuryVsTelevote";
import { NetworkGraph } from "@/components/viz/NetworkGraph";
import { VotingHeatmap } from "@/components/viz/VotingHeatmap";
import { regionalBias, relationships, votingSimilarity } from "@/lib/analysis";
import {
  useAllJuryVotes,
  useAllResults,
  useAllShows,
  useCountries,
  useEditions,
} from "@/lib/data";
import { computeVotingIntelligence } from "@/lib/stats";

export const Route = createFileRoute("/analysis/")({
  head: () => ({
    meta: [{ title: "Analysis — Solaris Studio" }],
  }),
  component: AnalysisPage,
});

const TABS = [
  { value: "network", label: "Network" },
  { value: "heatmap", label: "Heat map" },
  { value: "jurytele", label: "Jury vs Tele" },
  { value: "relationships", label: "Relationships" },
  { value: "history", label: "History" },
] as const;

type Tab = (typeof TABS)[number]["value"];

function AnalysisPage() {
  const { data: countries } = useCountries();
  const { data: jury } = useAllJuryVotes();
  const { data: results } = useAllResults();
  const { data: shows } = useAllShows();
  const { data: editions } = useEditions();

  const [filters, setFilters] = useState<AnalysisFiltersState>(DEFAULT_ANALYSIS_FILTERS);
  const [tab, setTab] = useState<Tab>("network");

  const cs = countries ?? [];
  const es = editions ?? [];
  const showsList = shows ?? [];

  const allowedShowIds = useMemo(
    () =>
      new Set(
        showsList
          .filter((show) =>
            filters.editionIds.length
              ? filters.editionIds.includes(show.edition_id)
              : true,
          )
          .filter((show) =>
            filters.showKind === "all" ? true : show.kind === filters.showKind,
          )
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

  const cMap = new Map(cs.map((country) => [country.id, country]));
  const similarity = votingSimilarity(filteredJury, cs).slice(0, 8);
  const relationData = relationships(filteredJury);
  const bias = regionalBias(filteredJury, cs).slice(0, 6);

  return (
    <AppShell>
      <PageHeader
        eyebrow="Intelligence"
        title="Analysis"
        description="Pick one view, adjust filters when needed, and let the data be the page instead of surrounding it with twelve dashboards."
      />

      <div className="mb-5">
        <Filters editions={es} value={filters} onChange={setFilters} />
      </div>

      <Panel className="mb-5">
        <div className="grid grid-cols-3 gap-5">
          <StatTile
            label="Kingmaker"
            value={
              intelligence.kingmakers[0]
                ? cMap.get(intelligence.kingmakers[0].countryId)?.name ?? "—"
                : "—"
            }
          />
          <StatTile
            label="Most loyal"
            value={
              intelligence.loyaltyScore[0]
                ? cMap.get(intelligence.loyaltyScore[0].countryId)?.name ?? "—"
                : "—"
            }
          />
          <StatTile
            label="Regional bias"
            value={
              bias[0]
                ? cMap.get(bias[0].id)?.name ?? "—"
                : "—"
            }
          />
        </div>
      </Panel>

      <ResponsiveTabs
        value={tab}
        options={TABS}
        onChange={setTab}
        label="Analysis view"
        className="mb-5"
      />

      {tab === "network" && (
        <Panel title="Voting network" description="The strongest historical voting connections.">
          {filteredJury.length ? (
            <NetworkGraph countries={cs} jury={filteredJury} />
          ) : (
            <Empty />
          )}
        </Panel>
      )}

      {tab === "heatmap" && (
        <Panel title="Voting heat map">
          {filteredJury.length ? (
            <VotingHeatmap countries={cs} jury={filteredJury} />
          ) : (
            <Empty />
          )}
        </Panel>
      )}

      {tab === "jurytele" && (
        <Panel title="Jury vs televote">
          {filteredResults.length ? (
            <JuryVsTelevote countries={cs} results={filteredResults} />
          ) : (
            <Empty />
          )}
        </Panel>
      )}

      {tab === "relationships" && (
        <div className="grid gap-5 lg:grid-cols-2">
          <Panel title="Most similar voting">
            <div className="divide-y divide-border/60">
              {similarity.map((row, index) => (
                <div key={index} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                  <span className="min-w-0 truncate text-sm">
                    {cMap.get(row.a)?.name ?? "?"} · {cMap.get(row.b)?.name ?? "?"}
                  </span>
                  <span className="numeric text-sm font-semibold">{(row.score * 100).toFixed(0)}%</span>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Strong friendships">
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
                    <span className="numeric text-sm font-semibold">{row.total} pts</span>
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
      )}

      {tab === "history" && (
        <Panel title="Historical leaderboard">
          {filteredResults.length ? (
            <HistoricalLeaderboard
              countries={cs}
              editions={es}
              results={filteredResults}
            />
          ) : (
            <Empty />
          )}
        </Panel>
      )}
    </AppShell>
  );
}

function Empty() {
  return (
    <div className="py-12 text-center text-sm text-muted-foreground">
      Not enough data for this view.
    </div>
  );
}
