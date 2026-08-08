import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { AppShell, PageHeader, Panel } from "@/components/AppShell";
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
  head: () => ({
    meta: [{ title: "Compare countries — Solaris Studio" }],
  }),
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

  const countryA = (countries ?? []).find((country) => country.short_code === a);
  const countryB = (countries ?? []).find((country) => country.short_code === b);

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
  const h2h =
    countryA && countryB
      ? computeHeadToHead(countryA.id, countryB.id, opts)
      : null;
  const rel =
    countryA && countryB
      ? computeRelationship(countryA.id, countryB.id, {
          editions: editions ?? [],
          jury: jury ?? [],
          results: results ?? [],
        })
      : null;

  const timeline = useMemo(() => {
    const years = new Set<number>();
    statsA?.timeline.forEach((point) => point.year != null && years.add(point.year));
    statsB?.timeline.forEach((point) => point.year != null && years.add(point.year));

    return [...years]
      .sort((x, y) => x - y)
      .map((year) => ({
        year,
        a: statsA?.timeline.find((point) => point.year === year)?.rank ?? null,
        b: statsB?.timeline.find((point) => point.year === year)?.rank ?? null,
      }));
  }, [statsA, statsB]);

  return (
    <AppShell>
      <PageHeader
        eyebrow="Comparison"
        title={countryA && countryB ? `${countryA.name} vs ${countryB.name}` : "Compare countries"}
        description="Choose two countries and get one focused comparison."
      />

      <Panel className="mb-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <CountryPicker
            label="Country A"
            value={a}
            countries={countries ?? []}
            onChange={(code) =>
              navigate({
                search: (previous: Search) => ({
                  ...previous,
                  a: code || undefined,
                }),
              })
            }
          />
          <CountryPicker
            label="Country B"
            value={b}
            countries={countries ?? []}
            onChange={(code) =>
              navigate({
                search: (previous: Search) => ({
                  ...previous,
                  b: code || undefined,
                }),
              })
            }
          />
        </div>
      </Panel>

      {!countryA || !countryB || !statsA || !statsB ? (
        <Panel>
          <p className="text-sm text-muted-foreground">Select two countries to compare them.</p>
        </Panel>
      ) : (
        <div className="space-y-5">
          <Panel>
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
              <CountryHead country={countryA} />
              <span className="text-xs uppercase tracking-wider text-muted-foreground">vs</span>
              <CountryHead country={countryB} align="right" />
            </div>
          </Panel>

          <Panel title="Key metrics">
            <div className="divide-y divide-border/60">
              <CompareRow label="Participations" a={statsA.participations} b={statsB.participations} />
              <CompareRow label="Wins" a={statsA.wins} b={statsB.wins} />
              <CompareRow
                label="Avg. placement"
                a={statsA.avgCombinedPlacement?.toFixed(1) ?? "—"}
                b={statsB.avgCombinedPlacement?.toFixed(1) ?? "—"}
              />
              <CompareRow
                label="Avg. points"
                a={statsA.avgPointsPerParticipation?.toFixed(1) ?? "—"}
                b={statsB.avgPointsPerParticipation?.toFixed(1) ?? "—"}
              />
              <CompareRow
                label="Qualification"
                a={statsA.qualificationPct != null ? `${statsA.qualificationPct.toFixed(0)}%` : "—"}
                b={statsB.qualificationPct != null ? `${statsB.qualificationPct.toFixed(0)}%` : "—"}
              />
            </div>
          </Panel>

          <div className="grid gap-5 lg:grid-cols-2">
            <Panel title="Head-to-head">
              {h2h?.sharedEditions ? (
                <div className="divide-y divide-border/60">
                  <Row label={`${countryA.name} finished higher`} value={h2h.aWins} />
                  <Row label={`${countryB.name} finished higher`} value={h2h.bWins} />
                  <Row label="Ties" value={h2h.ties} />
                  <Row label="Shared editions" value={h2h.sharedEditions} />
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No shared final history.</p>
              )}
            </Panel>

            <Panel title="Voting relationship">
              {rel ? (
                <div className="divide-y divide-border/60">
                  <Row label={`${countryA.short_code} → ${countryB.short_code}`} value={`${rel.totalAtoB} pts`} />
                  <Row label={`${countryB.short_code} → ${countryA.short_code}`} value={`${rel.totalBtoA} pts`} />
                  <Row label="Friendship score" value={rel.friendshipScore.toFixed(0)} />
                  <Row label="Mutual 12s" value={rel.mutualTwelves} />
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No voting data.</p>
              )}
            </Panel>
          </div>

          <Panel title="Placement timeline" description="Lower is better.">
            {timeline.length ? (
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={timeline}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="year" stroke="var(--muted-foreground)" fontSize={11} />
                    <YAxis reversed allowDecimals={false} stroke="var(--muted-foreground)" fontSize={11} />
                    <Tooltip
                      contentStyle={{
                        background: "var(--popover)",
                        border: "1px solid var(--border)",
                        borderRadius: 14,
                      }}
                    />
                    <Line type="monotone" dataKey="a" name={countryA.name} stroke={countryA.accent_color} strokeWidth={3} connectNulls dot />
                    <Line type="monotone" dataKey="b" name={countryB.name} stroke={countryB.accent_color} strokeWidth={3} connectNulls dot />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No placement timeline available.</p>
            )}
          </Panel>

          <div className="flex flex-wrap gap-2">
            <Link
              to="/countries/$code"
              params={{ code: countryA.short_code }}
              className="rounded-xl border border-border bg-surface px-3 py-2 text-xs"
            >
              {countryA.name} profile
            </Link>
            <Link
              to="/countries/$code"
              params={{ code: countryB.short_code }}
              className="rounded-xl border border-border bg-surface px-3 py-2 text-xs"
            >
              {countryB.name} profile
            </Link>
            <Link
              to="/relationships/$pair"
              params={{
                pair: `${countryA.short_code}-vs-${countryB.short_code}`.toUpperCase(),
              }}
              className="rounded-xl border border-border bg-surface px-3 py-2 text-xs"
            >
              Relationship page
            </Link>
          </div>
        </div>
      )}
    </AppShell>
  );
}

function CountryPicker({
  label,
  value,
  countries,
  onChange,
}: {
  label: string;
  value?: string;
  countries: Array<{ id: string; name: string; short_code: string }>;
  onChange: (code: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </span>
      <select
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm"
      >
        <option value="">Choose country</option>
        {countries
          .slice()
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((country) => (
            <option key={country.id} value={country.short_code}>
              {country.name}
            </option>
          ))}
      </select>
    </label>
  );
}

function CountryHead({ country, align = "left" }: { country: any; align?: "left" | "right" }) {
  return (
    <div className={`flex min-w-0 items-center gap-3 ${align === "right" ? "flex-row-reverse text-right" : ""}`}>
      <FlagChip
        code={country.short_code}
        color={country.accent_color}
        image={country.flag_image}
        size="md"
      />
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold">{country.name}</p>
        <p className="text-[11px] text-muted-foreground">{country.short_code}</p>
      </div>
    </div>
  );
}

function CompareRow({
  label,
  a,
  b,
}: {
  label: string;
  a: string | number;
  b: string | number;
}) {
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 py-3 first:pt-0 last:pb-0">
      <span className="numeric text-left text-sm font-semibold">{a}</span>
      <span className="text-center text-xs text-muted-foreground">{label}</span>
      <span className="numeric text-right text-sm font-semibold">{b}</span>
    </div>
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
