import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AppShell, PageHeader, Panel, StatTile } from "@/components/AppShell";
import { FlagChip } from "@/components/FlagChip";
import {
  useAllJuryVotes,
  useAllParticipants,
  useAllResults,
  useAllShows,
  useAllTelevotes,
  useCountries,
  useEditions,
} from "@/lib/data";
import { computeCountryStats, computeHeadToHead, computeRelationship } from "@/lib/stats";

type Search = { a?: string; b?: string };

export const Route = createFileRoute("/compare/")({
  validateSearch: (search: Record<string, unknown>): Search => ({
    a: typeof search.a === "string" ? search.a : undefined,
    b: typeof search.b === "string" ? search.b : undefined,
  }),
  head: ({ search }) => {
    const s = search as Search;
    const title =
      s.a && s.b ? `${s.a} vs ${s.b} — country comparison` : "Compare countries — Solaris Scoreboard Studio";
    return {
      meta: [
        { title: `${title} — Solaris Scoreboard Studio` },
        {
          name: "description",
          content: "Side-by-side comparison of two Terra Solaris delegations: results, points, voting and history.",
        },
        { property: "og:title", content: title },
        { property: "og:description", content: "Head-to-head statistics for two Terra Solaris nations." },
      ],
    };
  },
  component: ComparePage,
});

function ComparePage() {
  const { a, b } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });

  const { data: countries } = useCountries();
  const { data: editions } = useEditions();
  const { data: shows } = useAllShows();
  const { data: participants } = useAllParticipants();
  const { data: results } = useAllResults();
  const { data: jury } = useAllJuryVotes();
  const { data: televote } = useAllTelevotes();

  const countryA = (countries ?? []).find((c) => c.short_code === a);
  const countryB = (countries ?? []).find((c) => c.short_code === b);

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

  const statsA = countryA ? computeCountryStats(countryA.id, opts) : null;
  const statsB = countryB ? computeCountryStats(countryB.id, opts) : null;

  const h2h = countryA && countryB ? computeHeadToHead(countryA.id, countryB.id, opts) : null;
  const relationship =
    countryA && countryB
      ? computeRelationship(countryA.id, countryB.id, { editions: editions ?? [], jury: jury ?? [], results: results ?? [] })
      : null;

  const editionYear = new Map((editions ?? []).map((e) => [e.id, e.year]));

  const sharedOpponents = useMemo(() => {
    if (!countryA || !countryB || !results) return [];
    const editionsA = new Set(results.filter((r) => r.country_id === countryA.id).map((r) => r.edition_id));
    const editionsB = new Set(results.filter((r) => r.country_id === countryB.id).map((r) => r.edition_id));
    const shared = [...editionsA].filter((e) => editionsB.has(e));
    const opponentIds = new Set<string>();
    results
      .filter((r) => shared.includes(r.edition_id) && r.country_id !== countryA.id && r.country_id !== countryB.id)
      .forEach((r) => opponentIds.add(r.country_id));
    return [...opponentIds];
  }, [countryA, countryB, results]);

  const sharedEditionCount = h2h?.sharedEditions ?? 0;

  const timelineChart = useMemo(() => {
    if (!statsA && !statsB) return [];
    const years = new Set<number>();
    statsA?.timeline.forEach((t) => t.year != null && years.add(t.year));
    statsB?.timeline.forEach((t) => t.year != null && years.add(t.year));
    return [...years].sort((x, y) => x - y).map((year) => ({
      year,
      aRank: statsA?.timeline.find((t) => t.year === year)?.rank ?? null,
      bRank: statsB?.timeline.find((t) => t.year === year)?.rank ?? null,
    }));
  }, [statsA, statsB]);

  return (
    <AppShell>
      <PageHeader
        eyebrow="Comparison"
        title={countryA && countryB ? `${countryA.name} vs ${countryB.name}` : "Compare two countries"}
        description="Pick two nations to see participations, points, voting behaviour and head-to-head history side by side."
      />

      <Panel className="mb-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <CountryPicker
            label="Country A"
            value={a}
            onChange={(code) => navigate({ search: (prev) => ({ ...prev, a: code || undefined }) })}
            countries={countries ?? []}
          />
          <CountryPicker
            label="Country B"
            value={b}
            onChange={(code) => navigate({ search: (prev) => ({ ...prev, b: code || undefined }) })}
            countries={countries ?? []}
          />
        </div>
      </Panel>

      {!countryA || !countryB ? (
        <Panel>
          <p className="text-sm text-muted-foreground">Select two countries above to see a full comparison.</p>
        </Panel>
      ) : (
        <div className="space-y-6">
          <Panel>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <HeaderCard country={countryA} />
              <span className="font-display text-lg text-muted-foreground">vs</span>
              <HeaderCard country={countryB} align="right" />
            </div>
            <div className="mt-4 flex flex-wrap justify-center gap-3 text-xs">
              <Link
                to="/countries/$code"
                params={{ code: countryA.short_code }}
                className="rounded-lg border border-border px-3 py-1.5 text-muted-foreground hover:text-foreground"
              >
                {countryA.name} profile
              </Link>
              <Link
                to="/countries/$code"
                params={{ code: countryB.short_code }}
                className="rounded-lg border border-border px-3 py-1.5 text-muted-foreground hover:text-foreground"
              >
                {countryB.name} profile
              </Link>
              <a
                href={`/relationships/${countryA.short_code}-vs-${countryB.short_code}`}
                className="bg-aurora rounded-lg px-3 py-1.5 font-medium text-primary-foreground"
              >
                Full relationship page →
              </a>
            </div>
          </Panel>

          <Panel title="Key metrics">
            <div className="grid gap-4 sm:grid-cols-2">
              <MetricColumn stats={statsA} country={countryA} />
              <MetricColumn stats={statsB} country={countryB} />
            </div>
          </Panel>

          <Panel
            title="Head-to-head record"
            description={`${sharedEditionCount} shared edition${sharedEditionCount === 1 ? "" : "s"}`}
          >
            {h2h && h2h.sharedEditions ? (
              <>
                <div className="mb-4 grid grid-cols-3 gap-3 text-center">
                  <StatTile label={`${countryA.short_code} finished higher`} value={h2h.aWins} />
                  <StatTile label="Ties" value={h2h.ties} />
                  <StatTile label={`${countryB.short_code} finished higher`} value={h2h.bWins} />
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[420px] border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                        <th className="px-3 py-2">Year</th>
                        <th className="px-3 py-2">{countryA.short_code}</th>
                        <th className="px-3 py-2">{countryB.short_code}</th>
                        <th className="px-3 py-2">Gap</th>
                      </tr>
                    </thead>
                    <tbody>
                      {h2h.rows.map((r) => (
                        <tr key={r.editionId} className="border-b border-border/60">
                          <td className="numeric px-3 py-2">{r.year ?? "—"}</td>
                          <td className="numeric px-3 py-2">{r.aRank ?? "—"}</td>
                          <td className="numeric px-3 py-2">{r.bRank ?? "—"}</td>
                          <td className="numeric px-3 py-2">{r.diff != null ? Math.abs(r.diff) : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">These countries have never competed in the same final.</p>
            )}
          </Panel>

          <Panel title="Performance timeline" description="Final placement over time (lower is better)">
            {timelineChart.length ? (
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={timelineChart}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="year" stroke="var(--muted-foreground)" fontSize={12} />
                    <YAxis reversed allowDecimals={false} stroke="var(--muted-foreground)" fontSize={12} />
                    <Tooltip
                      contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 12 }}
                    />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="aRank"
                      name={countryA.name}
                      stroke={countryA.accent_color}
                      strokeWidth={3}
                      connectNulls
                      dot
                    />
                    <Line
                      type="monotone"
                      dataKey="bRank"
                      name={countryB.name}
                      stroke={countryB.accent_color}
                      strokeWidth={3}
                      connectNulls
                      dot
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No results recorded for either country yet.</p>
            )}
          </Panel>

          <div className="grid gap-6 lg:grid-cols-2">
            <Panel title="Voting relationship" description="Jury points exchanged across all shared editions">
              {relationship ? (
                <ul className="space-y-2 text-sm">
                  <li className="flex justify-between rounded-xl bg-surface px-3 py-2">
                    <span>
                      {countryA.short_code} → {countryB.short_code}
                    </span>
                    <span className="numeric font-semibold">{relationship.totalAtoB} pts</span>
                  </li>
                  <li className="flex justify-between rounded-xl bg-surface px-3 py-2">
                    <span>
                      {countryB.short_code} → {countryA.short_code}
                    </span>
                    <span className="numeric font-semibold">{relationship.totalBtoA} pts</span>
                  </li>
                  <li className="flex justify-between rounded-xl bg-surface px-3 py-2">
                    <span>Mutual 12-point exchanges</span>
                    <span className="numeric font-semibold">{relationship.mutualTwelves}</span>
                  </li>
                  <li className="flex justify-between rounded-xl bg-surface px-3 py-2">
                    <span>Voting similarity</span>
                    <span className="numeric font-semibold">{(relationship.similarity * 100).toFixed(0)}%</span>
                  </li>
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">No voting data available.</p>
              )}
            </Panel>

            <Panel title="Shared opponents" description={`Countries that faced both ${countryA.short_code} and ${countryB.short_code}`}>
              {sharedOpponents.length ? (
                <div className="flex flex-wrap gap-2">
                  {sharedOpponents.slice(0, 24).map((id) => {
                    const c = (countries ?? []).find((cc) => cc.id === id);
                    if (!c) return null;
                    return (
                      <Link
                        key={id}
                        to="/countries/$code"
                        params={{ code: c.short_code }}
                        className="flex items-center gap-2 rounded-full bg-surface px-3 py-1.5 text-xs hover:bg-surface-strong"
                      >
                        <FlagChip code={c.short_code} color={c.accent_color} image={c.flag_image} size="sm" />
                        {c.name}
                      </Link>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No shared opponents yet.</p>
              )}
            </Panel>
          </div>
        </div>
      )}
    </AppShell>
  );
}

function CountryPicker({
  label,
  value,
  onChange,
  countries,
}: {
  label: string;
  value: string | undefined;
  onChange: (code: string) => void;
  countries: { id: string; name: string; short_code: string }[];
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
      >
        <option value="">Select a country…</option>
        {[...countries]
          .sort((x, y) => x.name.localeCompare(y.name))
          .map((c) => (
            <option key={c.id} value={c.short_code}>
              {c.name}
            </option>
          ))}
      </select>
    </label>
  );
}

function HeaderCard({
  country,
  align = "left",
}: {
  country: { name: string; short_code: string; accent_color: string; flag_image: string | null; region: string };
  align?: "left" | "right";
}) {
  return (
    <div className={`flex items-center gap-3 ${align === "right" ? "flex-row-reverse text-right" : ""}`}>
      <FlagChip code={country.short_code} color={country.accent_color} image={country.flag_image} size="lg" />
      <div>
        <h3 className="font-display text-lg font-semibold">{country.name}</h3>
        <p className="text-xs text-muted-foreground">{country.region}</p>
      </div>
    </div>
  );
}

function MetricColumn({
  stats,
  country,
}: {
  stats: ReturnType<typeof computeCountryStats> | null;
  country: { name: string };
}) {
  if (!stats) return <p className="text-sm text-muted-foreground">No data for {country.name}.</p>;
  return (
    <div className="grid grid-cols-2 gap-3">
      <StatTile label="Participations" value={stats.participations} />
      <StatTile label="Wins" value={stats.wins} />
      <StatTile label="Finals reached" value={stats.finals} />
      <StatTile label="Qualification %" value={stats.qualificationPct != null ? `${stats.qualificationPct.toFixed(0)}%` : "—"} />
      <StatTile label="Avg. placement" value={stats.avgCombinedPlacement != null ? stats.avgCombinedPlacement.toFixed(1) : "—"} />
      <StatTile label="Avg. points" value={stats.avgPointsPerParticipation != null ? stats.avgPointsPerParticipation.toFixed(1) : "—"} />
      <StatTile label="Best score" value={stats.highestScore ?? "—"} />
      <StatTile label="Worst score" value={stats.lowestScore ?? "—"} />
      <StatTile label="Avg. jury placement" value={stats.avgJuryPlacement != null ? stats.avgJuryPlacement.toFixed(1) : "—"} />
      <StatTile label="Avg. televote placement" value={stats.avgTelevotePlacement != null ? stats.avgTelevotePlacement.toFixed(1) : "—"} />
    </div>
  );
}
