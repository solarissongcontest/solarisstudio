import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Activity,
  ChevronDown,
  Eye,
  Network,
  Search,
  ShieldAlert,
  UserRoundCog,
  Users,
} from "lucide-react";
import { useMemo, useState } from "react";

import { AdminCard, AdminPageHeader, AdminStatus } from "@/components/admin/AdminUI";
import {
  getFriendVotingCoordination,
  getLightweightFriendVotingIntelligence,
} from "@/integrations/televoting/intelligence.functions";
import type { IntelligenceChannel, IntelligenceLens } from "@/integrations/televoting/intelligence.server";
import { useEditions } from "@/lib/data";

const ALL_EDITIONS = "__all__";
type Tab = "overview" | "relationships" | "signals" | "network";

export const Route = createFileRoute("/_authenticated/admin/friend-voting")({
  head: () => ({
    meta: [
      { title: "Friend-voting intelligence — Solaris Organizer" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: FriendVotingPage,
});

function FriendVotingPage() {
  const getIntelligence = useServerFn(getLightweightFriendVotingIntelligence);
  const getCoordination = useServerFn(getFriendVotingCoordination);
  const { data: editions = [] } = useEditions();

  // The default is intentionally the complete historical country-level televote view.
  // It includes the corrected SSC20 and SSC21 historical data without asking the
  // Cloudflare Worker to build the much heavier jury + HOD graph on first paint.
  const [editionId, setEditionId] = useState(ALL_EDITIONS);
  const [lens, setLens] = useState<IntelligenceLens>("country");
  const [channel, setChannel] = useState<IntelligenceChannel>("televote");
  const [hodPersonId, setHodPersonId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [minPatternScore, setMinPatternScore] = useState(0);
  const [tab, setTab] = useState<Tab>("overview");

  const sortedEditions = useMemo(
    () => [...editions].sort((a, b) => (b.edition_number ?? -1) - (a.edition_number ?? -1)),
    [editions],
  );
  const scopedEditionId = editionId === ALL_EDITIONS ? null : editionId || null;

  const intelligence = useQuery({
    queryKey: ["friend-voting-complete", lens, channel, hodPersonId ?? "all-hods", scopedEditionId ?? "all-editions"],
    queryFn: async () => {
      const result = await getIntelligence({
        data: { lens, channel, hodPersonId, editionId: scopedEditionId },
      });
      if (!result) throw new Error("Friend-voting analysis returned no data");
      return result;
    },
    staleTime: 120_000,
    retry: 0,
  });

  const coordination = useQuery({
    queryKey: ["friend-voting-network", channel, hodPersonId ?? "all-hods", scopedEditionId ?? "all-editions"],
    queryFn: async () => {
      const result = await getCoordination({
        data: { lens: "hod", channel, hodPersonId, editionId: scopedEditionId },
      });
      if (!result) throw new Error("Network analysis returned no data");
      return result;
    },
    enabled: tab === "network" && lens === "hod",
    staleTime: 120_000,
    retry: 0,
  });

  const data = intelligence.data;
  const people = data?.filters.people ?? [];
  const effectiveScope = data?.effectiveScope ?? data?.filters;
  const scoreLabel = data?.riskSemantics === "advanced-risk" ? "Risk" : "Pattern";

  const relationships = useMemo(() => {
    const term = search.trim().toLowerCase();
    return [...(intelligence.data?.relationships ?? [])]
      .filter((row) => row.riskScore >= minPatternScore)
      .filter((row) => {
        if (!term) return true;
        return `${row.votingCountries.join(" ")} ${row.controllerName ?? ""} ${row.targetCountry}`
          .toLowerCase()
          .includes(term);
      })
      .sort((a, b) => b.riskScore - a.riskScore || b.confidence - a.confidence);
  }, [intelligence.data?.relationships, minPatternScore, search]);

  const totalHodUnits = (data?.stats.hodAssignedEditionCountries ?? 0) + (data?.stats.hodUnknownEditionCountries ?? 0);
  const hodCoverage = totalHodUnits
    ? Math.round(((data?.stats.hodAssignedEditionCountries ?? 0) / totalHodUnits) * 100)
    : 0;

  const tabs: Array<[Tab, string, typeof ShieldAlert]> = [
    ["overview", "Overview", ShieldAlert],
    ["relationships", "Relationships", Users],
    ["signals", "Signals", Eye],
    ["network", "Network", Network],
  ];

  const patternOptions = data
    ? [...new Map([
        [0, "All relationships"],
        [data.settings.riskNotable, `Notable ${data.settings.riskNotable}+`],
        [data.settings.riskReview, `Review ${data.settings.riskReview}+`],
        [data.settings.riskStrong, `Strong ${data.settings.riskStrong}+`],
        [data.settings.riskHigh, `Very strong ${data.settings.riskHigh}+`],
        [data.settings.riskCritical, `Extreme ${data.settings.riskCritical}+`],
      ]).entries()]
    : [[0, "All relationships"]] as Array<[number, string]>;

  const effectiveChannelLabel = effectiveScope?.channel === "jury"
    ? "Jury only"
    : effectiveScope?.channel === "combined"
      ? "Jury + televote"
      : "Televote only";
  const effectiveLensLabel = effectiveScope?.lens === "hod" ? "HOD tenure" : "Country history";

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <AdminPageHeader
        eyebrow="Voting intelligence"
        title="Friend-voting intelligence"
        description="Historical relationship analysis for jury and televote support. Pattern scores identify relationships worth reviewing; they are not findings that a country or HOD cheated."
        actions={
          <Link to="/admin/hod-history" className="admin-action-secondary">
            <UserRoundCog className="size-4" /> HOD history
          </Link>
        }
      />

      <AdminCard strong>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Filter label="Edition">
            <select value={editionId} onChange={(event) => setEditionId(event.target.value)} className={controlClass}>
              <option value={ALL_EDITIONS}>All editions</option>
              {sortedEditions.map((edition) => (
                <option key={edition.id} value={edition.id}>
                  SSC{edition.edition_number ?? "?"} · {edition.name}
                </option>
              ))}
            </select>
          </Filter>

          <Filter label="Evidence channel">
            <select value={channel} onChange={(event) => setChannel(event.target.value as IntelligenceChannel)} className={controlClass}>
              <option value="televote">Televote only</option>
              <option value="jury">Jury only</option>
              <option value="combined">Jury + televote</option>
            </select>
          </Filter>

          <Filter label="Identity lens">
            <select
              value={lens}
              onChange={(event) => {
                const next = event.target.value as IntelligenceLens;
                setLens(next);
                if (next === "country") setHodPersonId(null);
              }}
              className={controlClass}
            >
              <option value="country">Country history</option>
              <option value="hod">HOD tenure</option>
            </select>
          </Filter>

          <Filter label="Specific HOD">
            <select
              value={hodPersonId ?? ""}
              onChange={(event) => setHodPersonId(event.target.value || null)}
              disabled={lens !== "hod"}
              className={controlClass}
            >
              <option value="">All HODs</option>
              {people.map((person) => <option key={person.id} value={person.id}>{person.displayName}</option>)}
            </select>
          </Filter>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <AdminStatus tone={intelligence.isFetching ? "neutral" : intelligence.error ? "attention" : "info"}>
            {intelligence.isFetching
              ? "Analysing historical voting…"
              : intelligence.error
                ? "Analysis failed"
                : data?.analysisMode === "advanced"
                  ? "Advanced relationship analysis"
                  : "Historical relationship analysis"}
          </AdminStatus>
          {data ? (
            <span className="text-[11px] text-muted-foreground">
              Effective scope: {effectiveChannelLabel} · {effectiveLensLabel}
            </span>
          ) : null}
        </div>
      </AdminCard>

      {data?.analysisWarning ? (
        <AdminCard className={data.analysisDegraded ? "!border-amber-200/15 !bg-amber-200/[0.045]" : "!border-sky-200/15 !bg-sky-200/[0.04]"}>
          <p className="text-sm font-semibold">{data.analysisDegraded ? "Advanced layer unavailable" : "Historical analysis mode"}</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{data.analysisWarning}</p>
        </AdminCard>
      ) : null}

      {intelligence.error ? (
        <AdminCard className="!border-rose-200/15 !bg-rose-200/[0.045]">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-rose-50">Friend-voting analysis could not be completed</p>
              <p className="mt-1 break-words text-xs leading-relaxed text-rose-100/70">{intelligence.error instanceof Error ? intelligence.error.message : "Unknown analysis error"}</p>
            </div>
            <button type="button" onClick={() => void intelligence.refetch()} className="shrink-0 self-start whitespace-nowrap rounded-lg border border-rose-100/15 px-3 py-1.5 text-xs font-semibold text-rose-50">Retry</button>
          </div>
        </AdminCard>
      ) : null}

      <div className="grid grid-cols-2 gap-2 sm:flex sm:overflow-x-auto sm:pb-1">
        {tabs.map(([value, label, Icon]) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            className={`inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border px-3 text-xs font-semibold transition sm:w-auto sm:shrink-0 sm:rounded-full sm:px-4 ${tab === value ? "border-sky-200/20 bg-sky-200/10 text-sky-50" : "border-white/10 bg-white/[0.03] text-muted-foreground"}`}
          >
            <Icon className="size-3.5 shrink-0" /> <span className="truncate">{label}</span>
          </button>
        ))}
      </div>

      {intelligence.isLoading && !data ? (
        <AdminCard><p className="py-10 text-center text-sm text-muted-foreground">Building historical voting relationships…</p></AdminCard>
      ) : null}

      {data && tab === "overview" ? (
        <div className="space-y-4">
          <AdminCard>
            <div className="grid grid-cols-2 gap-x-5 gap-y-4 sm:grid-cols-3 lg:grid-cols-6">
              <CompactMetric label="TV ballots" value={effectiveScope?.channel === "jury" ? "—" : data.stats.ballots} />
              <CompactMetric label="Jury ballots" value={effectiveScope?.channel === "televote" ? "—" : data.stats.juryBallots} />
              <CompactMetric label="Relationships" value={data.stats.relationships} />
              <CompactMetric label="Patterns to review" value={data.stats.attentionRelationships} />
              <CompactMetric label="Stored high-risk ballots" value={data.technicalIntegrityAvailable ? data.stats.highRisk : "N/A"} />
              <CompactMetric label="HOD coverage" value={effectiveScope?.lens === "hod" ? `${hodCoverage}%` : "N/A"} />
            </div>
          </AdminCard>

          <AdminCard>
            <div className="flex items-start gap-3">
              <Activity className="mt-0.5 size-5 shrink-0 text-sky-100" />
              <div>
                <h2 className="text-base font-semibold">How to read these scores</h2>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  Relationship scores combine repeated support, reciprocity, intensity, historical deviation and rank patterns. A high score means “review this relationship”, not “this country is suspicious”. Technical suspicious/high-risk ballot flags come only from stored integrity metadata and are shown separately under Signals.
                </p>
              </div>
            </div>
          </AdminCard>

          <AdminCard>
            <div className="mb-3 flex items-center justify-between gap-3">
              <div><p className="admin-section-label">Priority review</p><h2 className="mt-1 text-xl font-bold">Strongest relationship patterns</h2></div>
              <button type="button" onClick={() => setTab("relationships")} className="text-xs font-semibold text-sky-100">View all</button>
            </div>
            <RelationshipList rows={relationships.slice(0, 8)} scoreLabel={scoreLabel} />
          </AdminCard>
        </div>
      ) : null}

      {data && tab === "relationships" ? (
        <AdminCard>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_220px] sm:items-end">
            <Filter label="Find country or HOD">
              <span className="relative block">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search relationships" className={`${controlClass} pl-9`} />
              </span>
            </Filter>
            <Filter label="Minimum pattern score">
              <select value={minPatternScore} onChange={(event) => setMinPatternScore(Number(event.target.value))} className={controlClass}>
                {patternOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </Filter>
          </div>
          <div className="mt-4 flex items-center justify-between gap-3">
            <div><p className="admin-section-label">Relationship evidence</p><h2 className="mt-1 text-xl font-bold">Country relationships</h2></div>
            <AdminStatus tone="info">{relationships.length} shown</AdminStatus>
          </div>
          <div className="mt-2"><RelationshipList rows={relationships} detailed scoreLabel={scoreLabel} /></div>
        </AdminCard>
      ) : null}

      {data && tab === "signals" ? (
        <AdminCard>
          <div className="mb-4">
            <p className="admin-section-label">Stored ballot metadata</p>
            <h2 className="mt-1 text-xl font-bold">Technical integrity signals</h2>
            <p className="mt-1 text-xs text-muted-foreground">These are explicit stored ballot flags such as suspicious status, technical risk score or VPN evidence. They are separate from friend-voting relationship pattern scores.</p>
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            {data.signals.map((signal) => (
              <div key={signal.key} className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-4">
                <div className="flex items-center justify-between gap-3"><p className="text-sm font-semibold">{signal.title}</p><AdminStatus tone={signal.severity === "high" || signal.severity === "critical" ? "attention" : "neutral"}>{signal.count}</AdminStatus></div>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{signal.description}</p>
                {signal.countries.length ? <p className="mt-2 text-[11px] text-sky-100/70">{signal.countries.join(" · ")}</p> : null}
              </div>
            ))}
            {!data.signals.length ? <p className="py-8 text-sm text-muted-foreground">No stored technical integrity flags in this scope.</p> : null}
          </div>
        </AdminCard>
      ) : null}

      {tab === "network" ? (
        lens !== "hod" ? (
          <AdminCard><div className="py-10 text-center"><Network className="mx-auto size-7 text-violet-100/70" /><h2 className="mt-3 text-lg font-semibold">HOD lens required</h2><p className="mx-auto mt-2 max-w-2xl text-sm text-muted-foreground">Network groups connect known controllers. Switch Identity lens to HOD tenure, then narrow to an edition or a specific HOD.</p></div></AdminCard>
        ) : coordination.isLoading ? (
          <AdminCard><p className="py-10 text-center text-sm text-muted-foreground">Building HOD coordination network…</p></AdminCard>
        ) : coordination.error ? (
          <AdminCard className="!border-rose-200/15 !bg-rose-200/[0.045]"><p className="text-sm text-rose-100">{coordination.error instanceof Error ? coordination.error.message : "Network analysis could not be loaded."}</p></AdminCard>
        ) : coordination.data ? (
          <NetworkView data={coordination.data} />
        ) : null
      ) : null}
    </div>
  );
}

const controlClass = "min-h-11 w-full rounded-xl border border-white/[0.1] bg-white/[0.035] px-3 text-sm text-foreground outline-none focus:border-sky-200/30 disabled:opacity-40";

function Filter({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block min-w-0"><span className="admin-section-label">{label}</span><span className="mt-2 block">{children}</span></label>;
}

function RelationshipList({ rows, detailed = false, scoreLabel = "Pattern" }: { rows: any[]; detailed?: boolean; scoreLabel?: string }) {
  return (
    <div className="divide-y divide-white/[0.07]">
      {rows.map((row, index) => {
        const sourceCountry = row.votingCountries?.length ? row.votingCountries.join(" / ") : row.votingCountry || "Unknown country";
        const sourceLabel = row.controllerName ? `${sourceCountry} (${row.controllerName})` : sourceCountry;
        return (
          <details key={`${row.identityKey}>${row.targetCode}:${index}`} className="group py-3" open={false}>
            <summary className="flex cursor-pointer list-none items-center gap-3 [&::-webkit-details-marker]:hidden">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-foreground">{sourceLabel} → {row.targetCountry}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">{row.uniqueEditions} edition{row.uniqueEditions === 1 ? "" : "s"} · {row.opportunities} opportunities</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] font-semibold">{scoreLabel} {row.riskScore}</span>
                <span className="hidden rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] text-muted-foreground sm:inline">{row.confidence}% conf.</span>
                <ChevronDown className="size-4 text-muted-foreground transition group-open:rotate-180" />
              </div>
            </summary>
            <div className="mt-3 rounded-xl border border-white/[0.07] bg-white/[0.025] p-3">
              <p className="text-xs leading-relaxed text-muted-foreground">{row.reasons?.join(" · ") || "No elevated relationship pattern."}</p>
              {row.warnings?.length ? <p className="mt-2 text-[11px] leading-relaxed text-amber-100/70">Caution: {row.warnings.join(" · ")}</p> : null}
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-5">
                <RiskMetric label="Jury" value={row.juryRisk} />
                <RiskMetric label="Televote" value={row.televoteRisk} />
                <RiskMetric label="Cross-channel" value={row.crossChannelRisk} />
                <RiskMetric label="Historical" value={row.historicalDeviationRisk} />
                <RiskMetric label="Rank pattern" value={row.rankPatternRisk ?? 0} />
                <RiskMetric label="Reciprocity" value={row.reciprocityRisk} />
                <RiskMetric label="Intensity" value={row.intensityRisk} />
                <RiskMetric label="Target strength" value={row.countryStrengthRisk} />
                <SmallMetric label="Confidence" value={`${row.confidence}%`} />
                <SmallMetric label="Average points" value={row.averagePoints} />
              </div>
              {detailed ? <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4"><SmallMetric label="Support frequency" value={`${row.supportFrequency}%`} /><SmallMetric label="Reciprocity rate" value={`${row.reciprocalSupport}%`} /><SmallMetric label="Max scores" value={row.maximumScores} /><SmallMetric label="Cross-channel editions" value={row.crossChannelEditions} /></div> : null}
            </div>
          </details>
        );
      })}
      {!rows.length ? <p className="py-8 text-center text-sm text-muted-foreground">No relationships match this scope.</p> : null}
    </div>
  );
}

function NetworkView({ data }: { data: any }) {
  const groups = data.groups ?? [];
  const edges = data.edges ?? [];
  return (
    <div className="space-y-4">
      {data.analysisWarning ? (
        <AdminCard className="!border-amber-200/15 !bg-amber-200/[0.045]"><p className="text-sm text-amber-50">{data.analysisWarning}</p></AdminCard>
      ) : null}
      <AdminCard>
        <div className="grid grid-cols-2 gap-x-5 gap-y-4 sm:grid-cols-4">
          <CompactMetric label="Known observations" value={data.stats?.knownControllerObservations ?? 0} />
          <CompactMetric label="HOD edges" value={data.stats?.knownControllerEdges ?? 0} />
          <CompactMetric label="Qualified edges" value={data.stats?.qualifiedEdges ?? 0} />
          <CompactMetric label="Groups" value={data.stats?.groups ?? 0} />
        </div>
      </AdminCard>
      <AdminCard>
        <div className="mb-3"><p className="admin-section-label">Network detection</p><h2 className="mt-1 text-xl font-bold">Coordination groups</h2><p className="mt-1 text-xs text-muted-foreground">Dense HOD-to-HOD support networks are corroborating evidence only, not findings of misconduct.</p></div>
        <div className="space-y-2">
          {groups.map((group: any) => (
            <div key={group.id} className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-4">
              <div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold">{group.memberNames?.join(" · ") || "HOD group"}</p><p className="mt-1 text-[11px] text-muted-foreground">{group.memberIds?.length ?? 0} HODs · density {group.density ?? 0}% · internal support {group.internalSupportShare ?? 0}%</p></div><span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] font-semibold">Pattern {group.riskScore ?? 0}</span></div>
            </div>
          ))}
          {!groups.length && !data.analysisWarning ? <p className="py-6 text-center text-sm text-muted-foreground">No qualifying coordination groups in this scope.</p> : null}
        </div>
      </AdminCard>
      {edges.length ? <AdminCard><div className="mb-3"><p className="admin-section-label">Strongest network edges</p><h2 className="mt-1 text-xl font-bold">HOD connections</h2></div><div className="divide-y divide-white/[0.07]">{edges.slice(0, 30).map((edge: any, index: number) => <div key={`${edge.sourcePersonId}:${edge.targetPersonId}:${index}`} className="flex items-center justify-between gap-3 py-2.5"><p className="min-w-0 truncate text-sm">{edge.sourceName} → {edge.targetName}</p><span className="shrink-0 text-xs font-semibold text-sky-100">Pattern {edge.riskScore}</span></div>)}</div></AdminCard> : null}
    </div>
  );
}

function CompactMetric({ label, value }: { label: string; value: string | number }) {
  return <div><p className="text-[10px] font-bold uppercase tracking-[0.13em] text-muted-foreground">{label}</p><p className="mt-1 text-xl font-semibold text-foreground">{value}</p></div>;
}

function SmallMetric({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded-lg border border-white/[0.06] bg-white/[0.025] px-2.5 py-2"><p className="text-[9px] font-bold uppercase tracking-[0.12em] text-muted-foreground">{label}</p><p className="mt-1 font-semibold text-foreground">{value}</p></div>;
}

function RiskMetric({ label, value }: { label: string; value: number }) {
  return <div className="rounded-lg border border-white/[0.06] bg-white/[0.025] px-2.5 py-2"><p className="text-[9px] font-bold uppercase tracking-[0.12em] text-muted-foreground">{label}</p><p className="mt-1 font-semibold text-foreground">{Math.round(Number(value ?? 0))}</p></div>;
}
