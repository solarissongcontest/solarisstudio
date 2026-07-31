import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
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
import { cn } from "@/lib/utils";
import {
  editionLabel,
  useAllJuryVotes,
  useAllParticipants,
  useAllResults,
  useAllShows,
  useAllTelevotes,
  useCountries,
  useEditions,
  type Country,
} from "@/lib/data";
import {
  computeCountryStats,
  computeHeadToHead,
  computeRelationship,
  type CountryStats,
} from "@/lib/stats";
import { topRecipients, topSupporters } from "@/lib/analysis";

export const Route = createFileRoute("/countries/$code")({
  head: ({ params }) => ({
    meta: [
      { title: `${params.code} country profile — Solaris Scoreboard Studio` },
      {
        name: "description",
        content:
          "Full historical profile: results timeline, qualification history, jury and televote statistics, voting behaviour and rivalries.",
      },
      { property: "og:title", content: `${params.code} — Terra Solaris country profile` },
      {
        property: "og:description",
        content: "Full SSC history and voting relationships for this Terra Solaris nation.",
      },
    ],
  }),
  component: CountryProfilePage,
});

type EventFilter = "all" | "grand-final" | "semi-final";
type VoteFilter = "all" | "jury" | "televote";

const SECTIONS = [
  { id: "overview", label: "Overview" },
  { id: "performance", label: "Performance" },
  { id: "timeline", label: "Results timeline" },
  { id: "qualification", label: "Qualification" },
  { id: "jury", label: "Jury" },
  { id: "televote", label: "Televote" },
  { id: "received", label: "Points received" },
  { id: "given", label: "Points given" },
  { id: "supporters", label: "Supporters" },
  { id: "rivals", label: "Rivals" },
  { id: "relationships", label: "Relationships" },
  { id: "h2h", label: "Head-to-head" },
  { id: "voting", label: "Voting behaviour" },
  { id: "trends", label: "Trends" },
];

function CountryProfilePage() {
  const { code } = Route.useParams();
  const { data: countries } = useCountries();
  const { data: editions } = useEditions();
  const { data: shows } = useAllShows();
  const { data: participants } = useAllParticipants();
  const { data: results } = useAllResults();
  const { data: jury } = useAllJuryVotes();
  const { data: televote } = useAllTelevotes();

  const [eventFilter, setEventFilter] = useState<EventFilter>("all");
  const [voteFilter, setVoteFilter] = useState<VoteFilter>("all");
  const [editionFilter, setEditionFilter] = useState<string>("all");

  const country = (countries ?? []).find((c) => c.short_code === code);
  const cMap = useMemo(() => new Map((countries ?? []).map((c) => [c.id, c])), [countries]);

  const showKind = useMemo(() => new Map((shows ?? []).map((s) => [s.id, s.kind])), [shows]);
  const showEdition = useMemo(() => new Map((shows ?? []).map((s) => [s.id, s.edition_id])), [shows]);

  const filteredShowIds = useMemo(() => {
    return new Set(
      (shows ?? [])
        .filter((s) => eventFilter === "all" || s.kind === eventFilter)
        .filter((s) => editionFilter === "all" || s.edition_id === editionFilter)
        .map((s) => s.id),
    );
  }, [shows, eventFilter, editionFilter]);

  const fShows = useMemo(() => (shows ?? []).filter((s) => filteredShowIds.has(s.id)), [shows, filteredShowIds]);
  const fResults = useMemo(
    () => (results ?? []).filter((r) => r.show_id != null && filteredShowIds.has(r.show_id)),
    [results, filteredShowIds],
  );
  const fParticipants = useMemo(
    () => (participants ?? []).filter((p) => p.show_id != null && filteredShowIds.has(p.show_id)),
    [participants, filteredShowIds],
  );
  const fJury = useMemo(
    () =>
      voteFilter === "televote"
        ? []
        : (jury ?? []).filter((v) => v.show_id != null && filteredShowIds.has(v.show_id)),
    [jury, filteredShowIds, voteFilter],
  );
  const fTelevote = useMemo(
    () =>
      voteFilter === "jury"
        ? []
        : (televote ?? []).filter((v) => v.show_id != null && filteredShowIds.has(v.show_id)),
    [televote, filteredShowIds, voteFilter],
  );

  const opts = useMemo(
    () => ({
      editions: editions ?? [],
      shows: fShows,
      participants: fParticipants,
      results: fResults,
      jury: fJury,
      televote: fTelevote,
    }),
    [editions, fShows, fParticipants, fResults, fJury, fTelevote],
  );

  const stats: CountryStats | null = country ? computeCountryStats(country.id, opts) : null;

  // Countries this nation has actually shared an edition with (within the current filters).
  const sharedCountryIds = useMemo(() => {
    if (!country) return new Set<string>();
    const myEditions = new Set(fResults.filter((r) => r.country_id === country.id).map((r) => r.edition_id));
    const ids = new Set<string>();
    fResults.forEach((r) => {
      if (r.country_id !== country.id && myEditions.has(r.edition_id)) ids.add(r.country_id);
    });
    fParticipants.forEach((p) => {
      if (p.country_id !== country.id && myEditions.has(p.edition_id)) ids.add(p.country_id);
    });
    return ids;
  }, [country, fResults, fParticipants]);

  if (!country) {
    return (
      <AppShell>
        <PageHeader title="Country not found" />
        <Link to="/countries" className="text-primary hover:underline">
          ← All countries
        </Link>
      </AppShell>
    );
  }

  const supporters = topSupporters(fJury, country.id, 8).filter(([id]) => sharedCountryIds.has(id));
  const recipients = topRecipients(fJury, country.id, 8).filter(([id]) => sharedCountryIds.has(id));
  const rivals = [...sharedCountryIds]
    .map((id) => ({
      c: cMap.get(id),
      given: fJury
        .filter((v) => v.voter_country_id === country.id && v.receiving_country_id === id)
        .reduce((a, v) => a + v.points, 0),
      count: fJury.filter((v) => v.voter_country_id === country.id && v.receiving_country_id === id).length,
    }))
    .filter((r) => r.c && r.count > 0)
    .sort((a, b) => a.given - b.given)
    .slice(0, 6);

  const relationshipTargets = [...sharedCountryIds]
    .map((id) => ({ id, c: cMap.get(id) }))
    .filter((r) => r.c)
    .slice(0, 20)
    .map((r) => ({
      ...r,
      relationship: computeRelationship(country.id, r.id, {
        editions: editions ?? [],
        jury: fJury,
        results: fResults,
      }),
    }))
    .sort((a, b) => b.relationship.friendshipScore - a.relationship.friendshipScore)
    .slice(0, 8);

  const h2hRows = [...sharedCountryIds]
    .map((id) => ({ id, c: cMap.get(id), h2h: computeHeadToHead(country.id, id, { editions: editions ?? [], results: fResults }) }))
    .filter((r) => r.c && r.h2h.sharedEditions > 0)
    .sort((a, b) => b.h2h.sharedEditions - a.h2h.sharedEditions)
    .slice(0, 10);

  const qualificationRows = fParticipants
    .filter((p) => p.country_id === country.id && showKind.get(p.show_id ?? "") === "semi-final")
    .map((p) => {
      const ed = (editions ?? []).find((e) => e.id === p.edition_id);
      const res = fResults.find((r) => r.country_id === country.id && r.show_id === p.show_id);
      return {
        edition: ed,
        qualified: p.qualified,
        points: res?.total_points ?? null,
        rank: res?.final_rank ?? null,
      };
    })
    .sort((a, b) => (a.edition?.year ?? 0) - (b.edition?.year ?? 0));

  const qualVsNonQual = useMemo(() => {
    const qualifiedFinals = fResults.filter((r) => {
      if (r.country_id !== country.id) return false;
      const p = fParticipants.find((pp) => pp.show_id === r.show_id && pp.country_id === country.id);
      return showKind.get(r.show_id ?? "") === "grand-final" && (p?.qualified ?? true);
    });
    const nonQualified = fParticipants.filter(
      (p) => p.country_id === country.id && showKind.get(p.show_id ?? "") === "semi-final" && p.qualified === false,
    );
    const avgPts = (rows: { total_points: number }[]) =>
      rows.length ? rows.reduce((a, r) => a + r.total_points, 0) / rows.length : null;
    const semiPointsFor = (p: (typeof nonQualified)[number]) =>
      fResults.find((r) => r.show_id === p.show_id && r.country_id === country.id)?.total_points ?? null;
    const nonQualPts = nonQualified.map(semiPointsFor).filter((p): p is number => p != null);
    return [
      { name: "Qualified / Finals", value: avgPts(qualifiedFinals) ?? 0, count: qualifiedFinals.length },
      {
        name: "Eliminated in semis",
        value: nonQualPts.length ? nonQualPts.reduce((a, b) => a + b, 0) / nonQualPts.length : 0,
        count: nonQualified.length,
      },
    ];
  }, [fResults, fParticipants, showKind, country.id]);

  return (
    <AppShell>
      <PageHeader
        eyebrow={country.region}
        title={country.name}
        description={country.description ?? undefined}
        actions={<FlagChip code={country.short_code} color={country.accent_color} image={country.flag_image} size="xl" />}
      />

      {/* sticky filter + section nav */}
      <div className="glass sticky top-[64px] z-30 mb-6 flex flex-col gap-3 p-4">
        <div className="flex flex-wrap items-center gap-4">
          <FilterGroup
            label="Events"
            value={eventFilter}
            onChange={(v) => setEventFilter(v as EventFilter)}
            options={[
              { value: "all", label: "All events" },
              { value: "grand-final", label: "Finals only" },
              { value: "semi-final", label: "Semi-finals only" },
            ]}
          />
          <FilterGroup
            label="Votes"
            value={voteFilter}
            onChange={(v) => setVoteFilter(v as VoteFilter)}
            options={[
              { value: "all", label: "All" },
              { value: "jury", label: "Jury only" },
              { value: "televote", label: "Televote only" },
            ]}
          />
          <label className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">Edition</span>
            <select
              value={editionFilter}
              onChange={(e) => setEditionFilter(e.target.value)}
              className="rounded-lg border border-border bg-surface px-2 py-1.5 text-xs outline-none focus:border-primary"
            >
              <option value="all">All editions</option>
              {[...(editions ?? [])]
                .sort((a, b) => (b.year ?? 0) - (a.year ?? 0))
                .map((e) => (
                  <option key={e.id} value={e.id}>
                    {editionLabel(e)}
                  </option>
                ))}
            </select>
          </label>
          <a href={`/compare?a=${country.short_code}`} className="ml-auto text-xs text-primary hover:underline">
            Compare this country →
          </a>
        </div>
        <nav className="flex flex-wrap gap-1 overflow-x-auto text-xs">
          {SECTIONS.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className="whitespace-nowrap rounded-lg px-2.5 py-1 text-muted-foreground hover:bg-surface hover:text-foreground"
            >
              {s.label}
            </a>
          ))}
        </nav>
      </div>

      {!stats || !stats.participations ? (
        <Panel>
          <p className="text-sm text-muted-foreground">
            No data available for {country.name} under the current filters. Try widening the event or vote filter.
          </p>
        </Panel>
      ) : (
        <div className="space-y-6">
          <div id="overview"><Panel title="Overview" className="scroll-mt-40">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatTile label="Participations" value={stats.participations} />
              <StatTile label="Wins" value={stats.wins} />
              <StatTile label="Finals reached" value={stats.finals} />
              <StatTile label="Qualification %" value={stats.qualificationPct != null ? `${stats.qualificationPct.toFixed(0)}%` : "—"} />
              <StatTile label="Avg. placement" value={stats.avgCombinedPlacement != null ? stats.avgCombinedPlacement.toFixed(1) : "—"} />
              <StatTile label="Points received" value={stats.avgReceivedPerContest != null ? stats.avgReceivedPerContest.toFixed(0) : "—"} hint="avg per contest" />
              <StatTile label="Points given" value={stats.avgGivenPerContest != null ? stats.avgGivenPerContest.toFixed(0) : "—"} hint="avg per contest" />
              <StatTile label="First participation" value={country.first_participation ?? "—"} />
            </div>
          </Panel></div>

          <div id="performance"><Panel title="Performance" description="Placement milestones across selected events" className="scroll-mt-40">
            <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
              <StatTile label="Win %" value={stats.winPct != null ? `${stats.winPct.toFixed(0)}%` : "—"} />
              <StatTile label="Podiums" value={stats.podiums} />
              <StatTile label="Top 5" value={stats.top5} />
              <StatTile label="Top 10" value={stats.top10} />
              <StatTile label="Last places" value={stats.lastPlaces} />
              <StatTile label="Nil-pointers" value={stats.nilPointers} />
              <StatTile label="Best top-10 streak" value={stats.bestPlacementStreak} />
              <StatTile label="Current qualification streak" value={stats.consecutiveQualifications} />
              <StatTile label="Current finals streak" value={stats.consecutiveFinals} />
              <StatTile label="Highest score" value={stats.highestScore ?? "—"} />
              <StatTile label="Lowest score" value={stats.lowestScore ?? "—"} />
              <StatTile label="Avg. qualification rank" value={stats.avgQualificationRank != null ? stats.avgQualificationRank.toFixed(1) : "—"} />
            </div>
          </Panel></div>

          <div id="timeline"><Panel title="Results timeline" description="Final placement per edition (lower is better)" className="scroll-mt-40">
            {stats.timeline.length ? (
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={stats.timeline}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="year" stroke="var(--muted-foreground)" fontSize={12} />
                    <YAxis reversed allowDecimals={false} stroke="var(--muted-foreground)" fontSize={12} />
                    <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 12 }} />
                    <Line type="monotone" dataKey="rank" name="Rank" stroke="var(--jury)" strokeWidth={3} connectNulls dot />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No results in this filter selection.</p>
            )}
          </Panel></div>

          <div id="qualification"><Panel title="Qualification history" description="Semi-final results and qualification outcome" className="scroll-mt-40">
            {qualificationRows.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[480px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                      <th className="px-3 py-2">Edition</th>
                      <th className="px-3 py-2">Semi rank</th>
                      <th className="px-3 py-2">Points</th>
                      <th className="px-3 py-2">Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {qualificationRows.map((r, i) => (
                      <tr key={i} className="border-b border-border/60">
                        <td className="px-3 py-2">{r.edition ? editionLabel(r.edition) : "—"}</td>
                        <td className="numeric px-3 py-2">{r.rank ?? "—"}</td>
                        <td className="numeric px-3 py-2">{r.points ?? "—"}</td>
                        <td className="px-3 py-2">
                          <span
                            className={cn(
                              "rounded-full px-2 py-0.5 text-xs font-medium",
                              r.qualified ? "bg-[var(--jury)]/20 text-[var(--jury)]" : "bg-[var(--televote)]/20 text-[var(--televote)]",
                            )}
                          >
                            {r.qualified == null ? "N/A" : r.qualified ? "Qualified" : "Eliminated"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No semi-final appearances in this filter selection.</p>
            )}
          </Panel></div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div id="jury"><Panel title="Jury statistics" className="scroll-mt-40">
              <div className="grid grid-cols-2 gap-3">
                <StatTile label="Avg. jury placement" value={stats.avgJuryPlacement != null ? stats.avgJuryPlacement.toFixed(1) : "—"} />
                <StatTile label="12s received" value={stats.twelvesReceived} />
                <StatTile label="12s given" value={stats.twelvesGiven} />
                <StatTile label="Countries awarded" value={stats.distinctCountriesAwarded} />
              </div>
            </Panel></div>
            <div id="televote"><Panel title="Televote statistics" className="scroll-mt-40">
              <div className="grid grid-cols-2 gap-3">
                <StatTile label="Avg. televote placement" value={stats.avgTelevotePlacement != null ? stats.avgTelevotePlacement.toFixed(1) : "—"} />
                <StatTile label="Avg. points / participation" value={stats.avgPointsPerParticipation != null ? stats.avgPointsPerParticipation.toFixed(1) : "—"} />
              </div>
            </Panel></div>
          </div>

          <div id="received"><Panel title="Points received" description="Jury + televote points by edition" className="scroll-mt-40">
            {stats.timeline.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[480px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                      <th className="px-3 py-2">Edition</th>
                      <th className="px-3 py-2">Jury</th>
                      <th className="px-3 py-2">Televote</th>
                      <th className="px-3 py-2">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.timeline.map((t, i) => (
                      <tr key={i} className="border-b border-border/60">
                        <td className="px-3 py-2">{t.label} {t.year ? `(${t.year})` : ""}</td>
                        <td className="numeric px-3 py-2">{t.jury}</td>
                        <td className="numeric px-3 py-2">{t.televote}</td>
                        <td className="numeric px-3 py-2 font-semibold">{t.total}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No results in this filter selection.</p>
            )}
          </Panel></div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div id="given"><Panel title="Points given" description={`How ${country.name} voted`} className="scroll-mt-40">
              <RelationList rows={recipients} cMap={cMap} country={country} />
            </Panel></div>
            <div id="supporters"><Panel title="Biggest supporters" description="Countries that gave the most points" className="scroll-mt-40">
              <RelationList rows={supporters} cMap={cMap} country={country} />
            </Panel></div>
          </div>

          <div id="rivals"><Panel title="Biggest rivals" description="Shared competitors this country consistently overlooks" className="scroll-mt-40">
            {rivals.length ? (
              <ul className="space-y-2">
                {rivals.map(({ c, given }) =>
                  c ? (
                    <li key={c.id} className="flex items-center gap-3 rounded-xl bg-surface px-3 py-2">
                      <FlagChip code={c.short_code} color={c.accent_color} image={c.flag_image} size="sm" />
                      <span className="flex-1 text-sm">{c.name}</span>
                      <span className="numeric text-sm text-muted-foreground">{given} pts given</span>
                      <a
                        href={`/relationships/${country.short_code}-vs-${c.short_code}`}
                        className="text-xs text-primary hover:underline"
                      >
                        Relationship →
                      </a>
                    </li>
                  ) : null,
                )}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No shared-competitor data in this filter selection.</p>
            )}
          </Panel></div>

          <div id="relationships"><Panel title="Historical relationships" description="Strongest voting relationships with countries actually faced" className="scroll-mt-40">
            {relationshipTargets.length ? (
              <ul className="space-y-2">
                {relationshipTargets.map(({ c, relationship: rel }) =>
                  c ? (
                    <li key={c.id} className="flex items-center gap-3 rounded-xl bg-surface px-3 py-2">
                      <FlagChip code={c.short_code} color={c.accent_color} image={c.flag_image} size="sm" />
                      <span className="flex-1 text-sm">{c.name}</span>
                      <span className="numeric text-xs text-muted-foreground">
                        {rel.totalAtoB}→ / ←{rel.totalBtoA} pts
                      </span>
                      <a
                        href={`/relationships/${country.short_code}-vs-${c.short_code}`}
                        className="text-xs text-primary hover:underline"
                      >
                        View →
                      </a>
                    </li>
                  ) : null,
                )}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No shared voting history in this filter selection.</p>
            )}
          </Panel></div>

          <div id="h2h"><Panel title="Head-to-head records" description="Final placement comparisons vs shared competitors" className="scroll-mt-40">
            {h2hRows.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                      <th className="px-3 py-2">Opponent</th>
                      <th className="px-3 py-2">Shared editions</th>
                      <th className="px-3 py-2">{country.short_code} wins</th>
                      <th className="px-3 py-2">Opponent wins</th>
                      <th className="px-3 py-2">Ties</th>
                    </tr>
                  </thead>
                  <tbody>
                    {h2hRows.map(({ c, h2h }) =>
                      c ? (
                        <tr key={c.id} className="border-b border-border/60">
                          <td className="px-3 py-2">
                            <span className="flex items-center gap-2">
                              <FlagChip code={c.short_code} color={c.accent_color} image={c.flag_image} size="sm" />
                              {c.name}
                            </span>
                          </td>
                          <td className="numeric px-3 py-2">{h2h.sharedEditions}</td>
                          <td className="numeric px-3 py-2">{h2h.aWins}</td>
                          <td className="numeric px-3 py-2">{h2h.bWins}</td>
                          <td className="numeric px-3 py-2">{h2h.ties}</td>
                        </tr>
                      ) : null,
                    )}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No shared finals in this filter selection.</p>
            )}
          </Panel></div>

          <div id="voting"><Panel title="Voting behaviour" description="Favourites, generosity and blind spots" className="scroll-mt-40">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatTile
                label="Favourite recipient"
                value={stats.favouriteRecipient ? cMap.get(stats.favouriteRecipient.countryId)?.name ?? "—" : "—"}
                hint={stats.favouriteRecipient ? `${stats.favouriteRecipient.points} pts` : undefined}
              />
              <StatTile
                label="Most generous towards"
                value={stats.mostGenerousTowards ? cMap.get(stats.mostGenerousTowards.countryId)?.name ?? "—" : "—"}
                hint={stats.mostGenerousTowards ? `${stats.mostGenerousTowards.points} pts` : undefined}
              />
              <StatTile
                label="Harshest towards"
                value={stats.harshestTowards ? cMap.get(stats.harshestTowards.countryId)?.name ?? "—" : "—"}
                hint={stats.harshestTowards ? `${stats.harshestTowards.points} pts` : undefined}
              />
              <StatTile label="Never awarded" value={stats.neverAwarded.filter((id) => sharedCountryIds.has(id)).length} hint="of shared competitors" />
            </div>
          </Panel></div>

          <div id="trends"><Panel title="Performance trends" description="5-edition rolling average placement & qualifying vs non-qualifying" className="scroll-mt-40">
            <div className="grid gap-6 lg:grid-cols-2">
              <div>
                <h3 className="mb-2 text-sm font-medium text-muted-foreground">Rolling average placement</h3>
                {stats.rolling5.length ? (
                  <div className="h-[220px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={stats.rolling5}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                        <XAxis dataKey="year" stroke="var(--muted-foreground)" fontSize={12} />
                        <YAxis reversed allowDecimals stroke="var(--muted-foreground)" fontSize={12} />
                        <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 12 }} />
                        <Line type="monotone" dataKey="avgPlacement" stroke="var(--gold)" strokeWidth={3} connectNulls dot />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Not enough data.</p>
                )}
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <StatTile
                    label="Biggest improvement"
                    value={stats.biggestImprovement ? `+${stats.biggestImprovement.delta}` : "—"}
                    hint={stats.biggestImprovement ? `${stats.biggestImprovement.fromYear} → ${stats.biggestImprovement.toYear}` : undefined}
                  />
                  <StatTile
                    label="Biggest decline"
                    value={stats.biggestDecline ? `${stats.biggestDecline.delta}` : "—"}
                    hint={stats.biggestDecline ? `${stats.biggestDecline.fromYear} → ${stats.biggestDecline.toYear}` : undefined}
                  />
                </div>
              </div>
              <div>
                <h3 className="mb-2 text-sm font-medium text-muted-foreground">Qualifying vs non-qualifying avg. points</h3>
                <div className="h-[220px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={qualVsNonQual}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="name" stroke="var(--muted-foreground)" fontSize={11} />
                      <YAxis stroke="var(--muted-foreground)" fontSize={12} />
                      <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 12 }} />
                      <Bar dataKey="value" fill="var(--jury)" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </Panel></div>
        </div>
      )}
    </AppShell>
  );
}

function FilterGroup({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex gap-1">
        {options.map((o) => (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className={cn(
              "rounded-lg px-2.5 py-1 text-xs font-medium transition-colors",
              value === o.value ? "bg-surface-strong text-foreground" : "text-muted-foreground hover:bg-surface",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function RelationList({
  rows,
  cMap,
  country,
}: {
  rows: [string, number][];
  cMap: Map<string, Country>;
  country: Country;
}) {
  if (!rows.length) return <p className="text-sm text-muted-foreground">No data in this filter selection.</p>;
  const max = rows[0][1] || 1;
  return (
    <ul className="space-y-2">
      {rows.map(([id, pts]) => {
        const c = cMap.get(id);
        if (!c) return null;
        return (
          <li key={id} className="relative overflow-hidden rounded-xl bg-surface px-3 py-2">
            <span
              className="absolute inset-y-0 left-0 opacity-25"
              style={{ width: `${(pts / max) * 100}%`, background: c.accent_color }}
            />
            <span className="relative flex items-center gap-3">
              <FlagChip code={c.short_code} color={c.accent_color} image={c.flag_image} size="sm" />
              <span className="flex-1 text-sm">{c.name}</span>
              <span className="numeric text-sm font-semibold">{pts}</span>
              <a href={`/relationships/${country.short_code}-vs-${c.short_code}`} className="text-xs text-primary hover:underline">
                →
              </a>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
