import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Activity, BarChart3, CalendarDays, ShieldAlert, Trophy, Users } from "lucide-react";

import { getMergedTelevotingAdmin } from "@/integrations/televoting/admin-auth.functions";
import {
  getMergedScopedAnalytics,
  type MergedAnalysisScope,
} from "@/integrations/televoting/analytics.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/televoting/admin/analytics")({
  head: () => ({ meta: [{ title: "Televoting Analytics — Solaris Studio" }, { name: "robots", content: "noindex" }] }),
  component: TelevotingAnalyticsPage,
});

type View = "summary" | "editions" | "delegations" | "entries" | "distribution" | "activity";

function scopeKey(scope: MergedAnalysisScope) {
  switch (scope.mode) {
    case "all_editions": return "all";
    case "edition": return `edition:${scope.editionId}`;
    case "edition_range": return `range:${scope.fromEditionId}:${scope.toEditionId}`;
    case "round": return `round:${scope.roundId}`;
  }
}

function TelevotingAnalyticsPage() {
  const navigate = useNavigate();
  const getAdmin = useServerFn(getMergedTelevotingAdmin);
  const getAnalytics = useServerFn(getMergedScopedAnalytics);
  const [scope, setScope] = useState<MergedAnalysisScope>({ mode: "all_editions" });
  const [view, setView] = useState<View>("summary");

  const { data: admin, isLoading: adminLoading } = useQuery({
    queryKey: ["merged-televoting-admin"],
    queryFn: () => getAdmin(),
  });

  useEffect(() => {
    if (!adminLoading && !admin) void navigate({ to: "/televoting/admin/sign-in" });
  }, [admin, adminLoading, navigate]);

  const { data, isLoading, error } = useQuery({
    queryKey: ["merged-televoting-analytics", scopeKey(scope)],
    queryFn: () => getAnalytics({ data: { scope } }),
    enabled: Boolean(admin),
  });

  const allEditions = data?.scope.allEditions ?? [];
  const allRounds = data?.scope.allRounds ?? [];
  const scoreMax = Math.max(1, ...(data?.scoreDistribution ?? [0]));

  const selectedScopeValue = useMemo(() => {
    if (scope.mode === "all_editions") return "all";
    if (scope.mode === "edition") return `edition:${scope.editionId}`;
    if (scope.mode === "round") return `round:${scope.roundId}`;
    return "all";
  }, [scope]);

  function changeScope(value: string) {
    if (value === "all") return setScope({ mode: "all_editions" });
    if (value.startsWith("edition:")) return setScope({ mode: "edition", editionId: value.slice(8) });
    if (value.startsWith("round:")) return setScope({ mode: "round", roundId: value.slice(6) });
  }

  return (
    <div className="mx-auto max-w-6xl py-4 sm:py-8">
      <div className="mb-5"><Link to="/televoting/admin" className="text-xs text-muted-foreground hover:text-foreground">← Televoting control centre</Link></div>

      <header className="mb-8">
        <p className="text-[10px] uppercase tracking-[0.22em] text-sky-100/65">Voting intelligence</p>
        <h1 className="font-display mt-2 text-5xl uppercase leading-none sm:text-6xl">Analytics</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">Explore turnout, delegation behaviour, score distribution and entry performance. Country code remains the permanent delegation identity; usernames are supporting display data only.</p>
      </header>

      <section className="glass mb-4 grid gap-4 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <div>
          <label htmlFor="analytics-scope" className="text-xs uppercase tracking-[0.15em] text-muted-foreground">Analysis scope</label>
          <select id="analytics-scope" value={selectedScopeValue} onChange={(event) => changeScope(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-white/12 bg-black/20 px-3 text-sm">
            <option value="all">All editions</option>
            <optgroup label="Editions">
              {allEditions.map((edition) => <option key={edition.id} value={`edition:${edition.id}`}>{edition.name}</option>)}
            </optgroup>
            <optgroup label="Rounds">
              {allRounds.map((round) => <option key={round.id} value={`round:${round.id}`}>{round.name}</option>)}
            </optgroup>
          </select>
        </div>
        <div className="flex max-w-full gap-1 overflow-x-auto rounded-2xl border border-white/8 bg-black/10 p-1.5">
          {(["summary", "editions", "delegations", "entries", "distribution", "activity"] as View[]).map((item) => (
            <button key={item} type="button" onClick={() => setView(item)} className={cn("shrink-0 rounded-xl px-3 py-2 text-xs capitalize transition", view === item ? "bg-sky-200/12 text-sky-100" : "text-muted-foreground hover:text-foreground")}>{item}</button>
          ))}
        </div>
      </section>

      {adminLoading || isLoading ? (
        <section className="glass-strong p-8 text-center text-sm text-muted-foreground">Calculating scoped analytics…</section>
      ) : error || !data ? (
        <section className="glass-strong border-destructive/30 p-6 text-sm text-destructive">{error instanceof Error ? error.message : "Analytics could not be loaded."}</section>
      ) : (
        <>
          {view === "summary" ? (
            <div className="space-y-4">
              <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Metric label="Valid ballots" value={data.overview.ballots} icon={Users} />
                <Metric label="Voter countries" value={data.overview.voterCountries} icon={Activity} />
                <Metric label="Avg. ballot" value={data.overview.avgBallotPoints.toFixed(1)} icon={BarChart3} />
                <Metric label="Avg. supported" value={data.overview.avgSupported.toFixed(1)} icon={Trophy} />
              </section>
              <section className="grid gap-3 sm:grid-cols-3">
                <Metric label="Average risk" value={data.overview.avgRisk.toFixed(1)} icon={ShieldAlert} subtle />
                <Metric label="Risk ≥ 65" value={data.overview.highRisk} icon={ShieldAlert} subtle />
                <Metric label="VPN-marked ballots" value={data.overview.vpnBallots} icon={ShieldAlert} subtle />
              </section>
              <section className="glass-strong p-5">
                <h2 className="font-medium">Scope coverage</h2>
                <p className="mt-2 text-sm text-muted-foreground">{data.overview.editions} edition{data.overview.editions === 1 ? "" : "s"} · {data.overview.rounds} round{data.overview.rounds === 1 ? "" : "s"}. Deleted ballots are excluded from official-result metrics but remain available to dedicated integrity analysis.</p>
              </section>
            </div>
          ) : null}

          {view === "editions" ? (
            <section className="space-y-2">
              {data.editionRows.map((row) => <article key={row.id} className="glass grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_repeat(4,90px)] sm:items-center"><div><p className="font-medium">{row.name}</p><p className="mt-1 text-xs text-muted-foreground">{row.rounds} active data round{row.rounds === 1 ? "" : "s"}</p></div><SmallMetric label="Ballots" value={row.ballots} /><SmallMetric label="Countries" value={row.voterCountries} /><SmallMetric label="Points" value={row.points} /><SmallMetric label="Avg" value={row.avgBallot.toFixed(1)} /></article>)}
              {!data.editionRows.length ? <Empty>No ballots in this scope.</Empty> : null}
            </section>
          ) : null}

          {view === "delegations" ? (
            <section className="space-y-2">
              {data.delegationRows.map((row) => <article key={row.identity} className="glass grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_70px_70px_80px_80px] sm:items-center"><div className="flex min-w-0 items-center gap-3"><div className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-xl border border-white/10 bg-white/[0.04]">{row.flag_url ? <img src={row.flag_url} alt="" className="h-full w-full object-cover" /> : <span>{row.flag || "✦"}</span>}</div><div className="min-w-0"><p className="truncate font-medium">{row.name}</p><p className="mt-0.5 truncate text-xs text-muted-foreground">{row.code} · latest {new Date(row.latest).toLocaleDateString()}</p></div></div><SmallMetric label="Ballots" value={row.ballots} /><SmallMetric label="Rounds" value={row.rounds} /><SmallMetric label="Supported" value={row.avgSupported.toFixed(1)} /><SmallMetric label="Risk" value={row.avgRisk.toFixed(1)} /></article>)}
              {!data.delegationRows.length ? <Empty>No delegation activity in this scope.</Empty> : null}
            </section>
          ) : null}

          {view === "entries" ? (
            <section className="space-y-2">
              {data.targetRows.map((row, index) => <article key={row.entryKey} className="glass grid gap-3 p-4 sm:grid-cols-[34px_minmax(0,1fr)_80px_80px_80px] sm:items-center"><span className="text-center text-xs tabular-nums text-muted-foreground">{index + 1}</span><div className="flex min-w-0 items-center gap-3"><div className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-xl border border-white/10 bg-white/[0.04]">{row.image ? <img src={row.image} alt="" className="h-full w-full object-cover" /> : <span>{row.flag || "✦"}</span>}</div><div className="min-w-0"><p className="truncate font-medium">{row.name}</p><p className="mt-0.5 truncate text-xs text-muted-foreground">{row.code} · {row.rounds} rounds</p></div></div><SmallMetric label="Points" value={row.points} /><SmallMetric label="Scores" value={row.scores} /><SmallMetric label="10s" value={row.maxScores} /></article>)}
              {!data.targetRows.length ? <Empty>No scored entries in this scope.</Empty> : null}
            </section>
          ) : null}

          {view === "distribution" ? (
            <section className="glass-strong p-5">
              <h2 className="font-medium">Score distribution</h2>
              <p className="mt-1 text-sm text-muted-foreground">How often each possible 1–10 score appears across valid ballots.</p>
              <div className="mt-5 grid grid-cols-10 items-end gap-2" style={{ height: 240 }}>
                {data.scoreDistribution.map((count, index) => <div key={index} className="flex h-full min-w-0 flex-col justify-end gap-2"><span className="text-center text-[10px] tabular-nums text-muted-foreground">{count}</span><div className="min-h-1 rounded-t-lg bg-primary/70" style={{ height: `${Math.max(2, (count / scoreMax) * 100)}%` }} /><span className="text-center text-xs font-medium">{index + 1}</span></div>)}
              </div>
            </section>
          ) : null}

          {view === "activity" ? (
            <section className="space-y-2">
              {data.dailyActivity.map((row) => <article key={row.date} className="glass grid grid-cols-[minmax(0,1fr)_90px_110px] items-center gap-3 p-4"><div className="flex items-center gap-2"><CalendarDays className="size-4 text-sky-100/65" /><span className="font-medium">{new Date(`${row.date}T12:00:00`).toLocaleDateString()}</span></div><SmallMetric label="Ballots" value={row.ballots} /><SmallMetric label="Countries" value={row.voterCountries} /></article>)}
              {!data.dailyActivity.length ? <Empty>No voting activity in this scope.</Empty> : null}
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}

function Metric({ label, value, icon: Icon, subtle = false }: { label: string; value: string | number; icon: typeof Users; subtle?: boolean }) {
  return <div className={cn("p-4 sm:p-5", subtle ? "glass" : "glass-strong")}><div className="flex items-center justify-between gap-2"><span className="text-[9px] uppercase tracking-[0.15em] text-muted-foreground">{label}</span><Icon className="size-4 text-sky-100/60" /></div><p className="mt-3 text-2xl font-medium tabular-nums sm:text-3xl">{value}</p></div>;
}

function SmallMetric({ label, value }: { label: string; value: string | number }) {
  return <div className="text-right sm:text-left"><p className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground">{label}</p><p className="mt-1 font-medium tabular-nums">{value}</p></div>;
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="glass-strong p-8 text-center text-sm text-muted-foreground">{children}</div>;
}
