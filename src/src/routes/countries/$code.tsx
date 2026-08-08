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

import { AppShell, PageHeader, Panel, StatTile } from "@/components/AppShell";
import { FlagChip } from "@/components/FlagChip";
import { ResponsiveTabs } from "@/components/ResponsiveTabs";
import {
  editionLabel,
  useAllJuryVotes,
  useAllParticipants,
  useAllResults,
  useAllShows,
  useAllTelevotes,
  useCountries,
  useEditions,
} from "@/lib/data";
import { computeCountryStats, computeHeadToHead, computeRelationship } from "@/lib/stats";

export const Route = createFileRoute("/countries/$code")({
  head: ({ params }) => ({
    meta: [
      { title: `${params.code} — Country profile — Solaris Studio` },
      {
        name: "description",
        content: "Country results, voting history and relationships in the Solaris Song Contest.",
      },
    ],
  }),
  component: CountryProfilePage,
});

const TABS = [
  { value: "overview", label: "Overview" },
  { value: "results", label: "Results" },
  { value: "voting", label: "Voting" },
  { value: "relationships", label: "Relationships" },
] as const;

type Tab = (typeof TABS)[number]["value"];

function CountryProfilePage() {
  const { code } = Route.useParams();

  const { data: countries } = useCountries();
  const { data: editions } = useEditions();
  const { data: shows } = useAllShows();
  const { data: participants } = useAllParticipants();
  const { data: results } = useAllResults();
  const { data: jury } = useAllJuryVotes();
  const { data: televote } = useAllTelevotes();

  const [tab, setTab] = useState<Tab>("overview");

  const country = (countries ?? []).find(
    (item) => item.short_code.toUpperCase() === code.toUpperCase(),
  );

  const opts = useMemo(
    () => ({
      editions: editions ?? [],
      shows: shows ?? [],
      participants: participants ?? [],
      results: results ?? [],
      jury: jury ?? [],
      televote: televote ?? [],
    }),
    [editions, shows, participants, results, jury, televote],
  );

  const stats = useMemo(
    () => (country ? computeCountryStats(country.id, opts) : null),
    [country, opts],
  );

  if (!country) {
    return (
      <AppShell>
        <PageHeader title="Country not found" />
        <Link to="/countries" className="text-sm text-primary hover:underline">
          ← Back to countries
        </Link>
      </AppShell>
    );
  }

  const cMap = new Map((countries ?? []).map((item) => [item.id, item]));
  const editionMap = new Map((editions ?? []).map((edition) => [edition.id, edition]));
  const showMap = new Map((shows ?? []).map((show) => [show.id, show]));

  const myResults = (results ?? [])
    .filter((row) => row.country_id === country.id)
    .sort((a, b) => {
      const ay = editionMap.get(a.edition_id)?.year ?? 0;
      const by = editionMap.get(b.edition_id)?.year ?? 0;
      return by - ay;
    });

  const finalResults = myResults.filter(
    (row) => showMap.get(row.show_id ?? "")?.kind === "grand-final",
  );

  const semiRows = (participants ?? [])
    .filter(
      (row) =>
        row.country_id === country.id &&
        showMap.get(row.show_id ?? "")?.kind === "semi-final",
    )
    .map((row) => ({
      row,
      edition: editionMap.get(row.edition_id),
      result: myResults.find((result) => result.show_id === row.show_id),
    }))
    .sort((a, b) => (b.edition?.year ?? 0) - (a.edition?.year ?? 0));

  const given = (jury ?? []).filter((vote) => vote.voter_country_id === country.id);
  const received = (jury ?? []).filter((vote) => vote.receiving_country_id === country.id);

  const aggregate = (rows: typeof given, key: "receiving_country_id" | "voter_country_id") => {
    const totals = new Map<string, number>();
    rows.forEach((vote) => {
      const id = vote[key];
      if (!id) return;
      totals.set(id, (totals.get(id) ?? 0) + vote.points);
    });
    return [...totals.entries()]
      .map(([id, points]) => ({ country: cMap.get(id), points }))
      .filter((item) => item.country)
      .sort((a, b) => b.points - a.points)
      .slice(0, 8);
  };

  const topGiven = aggregate(given, "receiving_country_id");
  const topReceived = aggregate(received, "voter_country_id");

  const sharedIds = new Set<string>();
  const myEditionIds = new Set(myResults.map((row) => row.edition_id));
  (results ?? []).forEach((row) => {
    if (row.country_id !== country.id && myEditionIds.has(row.edition_id)) {
      sharedIds.add(row.country_id);
    }
  });

  const relationshipRows = [...sharedIds]
    .map((id) => {
      const other = cMap.get(id);
      if (!other) return null;
      return {
        other,
        rel: computeRelationship(country.id, id, {
          editions: editions ?? [],
          jury: jury ?? [],
          results: results ?? [],
        }),
        h2h: computeHeadToHead(country.id, id, {
          editions: editions ?? [],
          results: results ?? [],
        }),
      };
    })
    .filter((row): row is NonNullable<typeof row> => !!row)
    .sort((a, b) => b.rel.friendshipScore - a.rel.friendshipScore);

  const chartData =
    stats?.timeline
      .filter((point) => point.rank != null)
      .map((point) => ({
        label: point.year ?? point.label,
        rank: point.rank,
      })) ?? [];

  return (
    <AppShell>
      <div className="mb-6 glass p-4 sm:p-5">
        <div className="flex items-center gap-4">
          <FlagChip
            code={country.short_code}
            color={country.accent_color}
            image={country.flag_image}
            size="xl"
          />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">
              {country.region}
            </p>
            <h1 className="mt-1 truncate font-display text-2xl font-bold sm:text-3xl">
              {country.name}
            </h1>
            {country.description && (
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                {country.description}
              </p>
            )}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            to="/countries"
            className="rounded-xl border border-border bg-surface px-3 py-2 text-xs"
          >
            ← Countries
          </Link>
          <Link
            to="/compare"
            search={{ a: country.short_code }}
            className="rounded-xl border border-border bg-surface px-3 py-2 text-xs"
          >
            Compare
          </Link>
        </div>
      </div>

      <ResponsiveTabs
        value={tab}
        options={TABS}
        onChange={setTab}
        label="Country section"
        className="mb-5"
      />

      {!stats || stats.participations === 0 ? (
        <Panel>
          <p className="text-sm text-muted-foreground">No contest data is available for this country yet.</p>
        </Panel>
      ) : (
        <>
          {tab === "overview" && (
            <div className="space-y-5">
              <Panel>
                <div className="grid grid-cols-2 gap-x-5 gap-y-5 sm:grid-cols-4">
                  <StatTile label="Participations" value={stats.participations} />
                  <StatTile label="Wins" value={stats.wins} />
                  <StatTile
                    label="Avg. placement"
                    value={stats.avgCombinedPlacement?.toFixed(1) ?? "—"}
                  />
                  <StatTile
                    label="Qualification"
                    value={
                      stats.qualificationPct != null
                        ? `${stats.qualificationPct.toFixed(0)}%`
                        : "—"
                    }
                  />
                </div>
              </Panel>

              <div className="grid gap-5 lg:grid-cols-[1.2fr_.8fr]">
                <Panel title="Recent results">
                  <div className="divide-y divide-border/60">
                    {myResults.slice(0, 6).map((row) => {
                      const edition = editionMap.get(row.edition_id);
                      const show = showMap.get(row.show_id ?? "");
                      return (
                        <div
                          key={`${row.edition_id}-${row.show_id}`}
                          className="grid grid-cols-[1fr_auto] gap-3 py-3 first:pt-0 last:pb-0"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">
                              {edition ? editionLabel(edition) : "Edition"}
                            </p>
                            <p className="mt-0.5 text-[11px] text-muted-foreground">
                              {show?.name ?? "Show"}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="numeric text-sm font-semibold">
                              {row.final_rank ? `#${row.final_rank}` : "—"}
                            </p>
                            <p className="numeric mt-0.5 text-[11px] text-muted-foreground">
                              {row.total_points} pts
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </Panel>

                <Panel title="Career">
                  <div className="divide-y divide-border/60">
                    <Row label="Finals reached" value={stats.finals} />
                    <Row label="Podiums" value={stats.podiums} />
                    <Row label="Top 10 finishes" value={stats.top10} />
                    <Row label="Highest score" value={stats.highestScore ?? "—"} />
                    <Row
                      label="Current qualification streak"
                      value={stats.consecutiveQualifications}
                    />
                  </div>
                </Panel>
              </div>
            </div>
          )}

          {tab === "results" && (
            <div className="space-y-5">
              <Panel title="Placement timeline" description="Lower is better.">
                {chartData.length ? (
                  <div className="h-[260px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                        <XAxis dataKey="label" stroke="var(--muted-foreground)" fontSize={11} />
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
                  <ResultList rows={finalResults} editionMap={editionMap} showMap={showMap} />
                </Panel>

                <Panel title="Qualification history">
                  {semiRows.length ? (
                    <div className="divide-y divide-border/60">
                      {semiRows.map(({ row, edition, result }) => (
                        <div key={row.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                          <div>
                            <p className="text-sm font-medium">
                              {edition ? editionLabel(edition) : "Edition"}
                            </p>
                            <p className="mt-0.5 text-[11px] text-muted-foreground">
                              {result?.total_points ?? "—"} pts
                            </p>
                          </div>
                          <span
                            className={
                              row.qualified
                                ? "rounded-full bg-primary/10 px-2 py-1 text-[10px] font-semibold text-primary"
                                : "rounded-full bg-surface px-2 py-1 text-[10px] text-muted-foreground"
                            }
                          >
                            {row.qualified ? "Qualified" : "Eliminated"}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No semi-final history recorded.</p>
                  )}
                </Panel>
              </div>
            </div>
          )}

          {tab === "voting" && (
            <div className="space-y-5">
              <Panel>
                <div className="grid grid-cols-2 gap-x-5 gap-y-5 sm:grid-cols-4">
                  <StatTile
                    label="Avg. received"
                    value={stats.avgReceivedPerContest?.toFixed(0) ?? "—"}
                  />
                  <StatTile
                    label="Avg. given"
                    value={stats.avgGivenPerContest?.toFixed(0) ?? "—"}
                  />
                  <StatTile label="Top scores received" value={stats.topScoresReceived} />
                  <StatTile label="Top scores given" value={stats.topScoresGiven} />
                </div>
              </Panel>

              <div className="grid gap-5 lg:grid-cols-2">
                <CountryPointList
                  title="Most support received"
                  rows={topReceived}
                />
                <CountryPointList
                  title="Most points given"
                  rows={topGiven}
                />
              </div>
            </div>
          )}

          {tab === "relationships" && (
            <div className="space-y-5">
              <Panel
                title="Closest relationships"
                description="Ranked by historical friendship score."
              >
                {relationshipRows.length ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {relationshipRows.slice(0, 10).map(({ other, rel, h2h }) => (
                      <Link
                        key={other.id}
                        to="/relationships/$pair"
                        params={{
                          pair: `${country.short_code}-vs-${other.short_code}`.toUpperCase(),
                        }}
                        className="rounded-xl bg-surface px-3 py-3 hover:bg-surface-strong"
                      >
                        <div className="flex items-center gap-3">
                          <FlagChip
                            code={other.short_code}
                            color={other.accent_color}
                            image={other.flag_image}
                            size="sm"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{other.name}</p>
                            <p className="mt-0.5 text-[11px] text-muted-foreground">
                              Friendship {rel.friendshipScore.toFixed(0)} · H2H {h2h.sharedEditions} editions
                            </p>
                          </div>
                          <span className="text-xs text-primary">→</span>
                        </div>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No shared history yet.</p>
                )}
              </Panel>
            </div>
          )}
        </>
      )}
    </AppShell>
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

function ResultList({
  rows,
  editionMap,
  showMap,
}: {
  rows: Array<{
    edition_id: string;
    show_id: string | null;
    total_points: number;
    final_rank: number | null;
  }>;
  editionMap: Map<string, any>;
  showMap: Map<string, any>;
}) {
  if (!rows.length) {
    return <p className="text-sm text-muted-foreground">No grand-final results recorded.</p>;
  }

  return (
    <div className="divide-y divide-border/60">
      {rows.map((row, index) => {
        const edition = editionMap.get(row.edition_id);
        const show = showMap.get(row.show_id ?? "");
        return (
          <div key={`${row.edition_id}-${row.show_id}-${index}`} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
            <div>
              <p className="text-sm font-medium">{edition ? editionLabel(edition) : "Edition"}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">{show?.name ?? "Grand final"}</p>
            </div>
            <div className="text-right">
              <p className="numeric text-sm font-semibold">{row.final_rank ? `#${row.final_rank}` : "—"}</p>
              <p className="numeric text-[11px] text-muted-foreground">{row.total_points} pts</p>
            </div>
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
        <p className="text-sm text-muted-foreground">No voting data yet.</p>
      )}
    </Panel>
  );
}
