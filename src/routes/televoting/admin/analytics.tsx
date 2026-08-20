import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Activity, BarChart3, CalendarDays, Scale, ShieldAlert, Trophy, UserRoundCog, Users } from "lucide-react";

import { getMergedTelevotingAdmin } from "@/integrations/televoting/admin-auth.functions";
import { getMergedScopedAnalytics, type MergedAnalysisScope } from "@/integrations/televoting/analytics.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/televoting/admin/analytics")({
  head: () => ({ meta: [{ title: "Voting Analytics — Solaris Studio" }, { name: "robots", content: "noindex" }] }),
  component: TelevotingAnalyticsPage,
});

type View = "summary" | "editions" | "delegations" | "controllers" | "entries" | "channels" | "distribution" | "activity";

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
  const [hodPersonId, setHodPersonId] = useState<string | null>(null);
  const [view, setView] = useState<View>("summary");

  const { data: admin, isLoading: adminLoading } = useQuery({ queryKey: ["merged-televoting-admin"], queryFn: () => getAdmin() });
  useEffect(() => { if (!adminLoading && !admin) void navigate({ to: "/televoting/admin/sign-in" }); }, [admin, adminLoading, navigate]);

  const { data, isLoading, error } = useQuery({
    queryKey: ["merged-televoting-analytics", scopeKey(scope), hodPersonId ?? "all-hods"],
    queryFn: () => getAnalytics({ data: { scope, hodPersonId } }),
    enabled: Boolean(admin),
  });

  const allEditions = data?.scope.allEditions ?? [];
  const allRounds = data?.scope.allRounds ?? [];
  const scoreMax = Math.max(1, ...(data?.scoreDistribution ?? [0]));
  const selectedScopeValue = useMemo(() => {
    if (scope.mode === "all_editions") return "all";
    if (scope.mode === "edition_range") return "range";
    if (scope.mode === "edition") return `edition:${scope.editionId}`;
    return `round:${scope.roundId}`;
  }, [scope]);

  function changeScope(value: string) {
    if (value === "all") return setScope({ mode: "all_editions" });
    if (value === "range") {
      if (!allEditions.length) return;
      return setScope({ mode: "edition_range", fromEditionId: allEditions[0].id, toEditionId: allEditions[allEditions.length - 1].id });
    }
    if (value.startsWith("edition:")) return setScope({ mode: "edition", editionId: value.slice(8) });
    if (value.startsWith("round:")) return setScope({ mode: "round", roundId: value.slice(6) });
  }

  return (
    <div className="mx-auto max-w-7xl py-4 sm:py-8">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
        <Link to="/televoting/admin" className="text-xs text-muted-foreground hover:text-foreground">← Televoting control centre</Link>
        <Link to="/admin/hod-history" className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-muted-foreground hover:text-foreground"><UserRoundCog className="size-3.5" /> Manage HOD history</Link>
      </div>

      <header className="mb-8">
        <p className="text-[10px] uppercase tracking-[0.22em] text-sky-100/65">Cross-channel voting intelligence</p>
        <h1 className="font-display mt-2 text-5xl uppercase leading-none sm:text-6xl">Analytics</h1>
        <p className="mt-3 max-w-4xl text-sm leading-relaxed text-muted-foreground">Televoting and jury history are analysed together. Country view covers the whole delegation; Head of Delegation view separates periods led by different people.</p>
      </header>

      <section className="glass mb-4 grid gap-4 p-4 lg:grid-cols-2">
        <div>
          <label htmlFor="analytics-scope" className="text-xs uppercase tracking-[0.15em] text-muted-foreground">Edition / round scope</label>
          <select id="analytics-scope" value={selectedScopeValue} onChange={(event) => changeScope(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-white/12 bg-black/20 px-3 text-sm">
            <option value="all">All editions</option>
            <option value="range">Edition range…</option>
            <optgroup label="Editions">{allEditions.map((edition) => <option key={edition.id} value={`edition:${edition.id}`}>{edition.name}</option>)}</optgroup>
            <optgroup label="Rounds">{allRounds.map((round) => <option key={round.id} value={`round:${round.id}`}>{round.name}</option>)}</optgroup>
          </select>
          {scope.mode === "edition_range" ? (
            <div className="mt-2 grid grid-cols-2 gap-2">
              <select aria-label="Range starts" value={scope.fromEditionId} onChange={(event) => setScope({ ...scope, fromEditionId: event.target.value })} className="h-10 rounded-xl border border-white/10 bg-black/20 px-3 text-xs">
                {allEditions.map((edition) => <option key={edition.id} value={edition.id}>From {edition.name}</option>)}
              </select>
              <select aria-label="Range ends" value={scope.toEditionId} onChange={(event) => setScope({ ...scope, toEditionId: event.target.value })} className="h-10 rounded-xl border border-white/10 bg-black/20 px-3 text-xs">
                {allEditions.map((edition) => <option key={edition.id} value={edition.id}>Through {edition.name}</option>)}
              </select>
            </div>
          ) : null}
        </div>
        <div>
          <label htmlFor="analytics-hod" className="text-xs uppercase tracking-[0.15em] text-muted-foreground">HOD tenure lens</label>
          <select id="analytics-hod" value={hodPersonId ?? ""} onChange={(event) => setHodPersonId(event.target.value || null)} className="mt-2 h-11 w-full rounded-xl border border-white/12 bg-black/20 px-3 text-sm">
            <option value="">All HODs / country history</option>
            {(data?.hod.people ?? []).map((person) => <option key={person.id} value={person.id}>{person.displayName}</option>)}
          </select>
          <p className="mt-1.5 text-[10px] text-muted-foreground">The filter applies to both jury and televote through the edition HOD assignment.</p>
        </div>
      </section>

      <div className="mb-4 flex max-w-full gap-1 overflow-x-auto rounded-2xl border border-white/8 bg-black/10 p-1.5">
        {(["summary", "editions", "delegations", "controllers", "entries", "channels", "distribution", "activity"] as View[]).map((item) => <button key={item} type="button" onClick={() => setView(item)} className={cn("shrink-0 rounded-xl px-3 py-2 text-xs capitalize transition", view === item ? "bg-sky-200/12 text-sky-100" : "text-muted-foreground hover:text-foreground")}>{item}</button>)}
      </div>

      {adminLoading || isLoading ? <section className="glass-strong p-8 text-center text-sm text-muted-foreground">Calculating jury, televote and HOD-aware analytics…</section> : error || !data ? <section className="glass-strong border-destructive/30 p-6 text-sm text-destructive">{error instanceof Error ? error.message : "Analytics could not be loaded."}</section> : (
        <>
          {hodPersonId && data.hod.selectedPersonName ? <div className="mb-4 rounded-2xl border border-violet-200/15 bg-violet-200/[0.07] p-4 text-sm"><span className="font-semibold text-violet-100">HOD filter: {data.hod.selectedPersonName}</span><span className="ml-2 text-muted-foreground">Only voting activity from editions assigned to this controller is included.</span></div> : null}

          {view === "summary" ? <div className="space-y-4">
            <section className="grid grid-cols-2 gap-3 lg:grid-cols-4"><Metric label="Televote ballots" value={data.overview.ballots} icon={Users} /><Metric label="Jury ballots" value={data.overview.juryBallots} icon={Scale} /><Metric label="Televote points" value={data.overview.televotePoints} icon={BarChart3} /><Metric label="Jury points" value={data.overview.juryPoints} icon={Trophy} /></section>
            <section className="grid grid-cols-2 gap-3 lg:grid-cols-4"><Metric label="Voter countries" value={data.overview.voterCountries} icon={Activity} subtle /><Metric label="Avg. televote ballot" value={data.overview.avgBallotPoints.toFixed(1)} icon={BarChart3} subtle /><Metric label="Average risk" value={data.overview.avgRisk.toFixed(1)} icon={ShieldAlert} subtle /><Metric label="Risk ≥ 65" value={data.overview.highRisk} icon={ShieldAlert} subtle /></section>
            <section className="grid gap-3 lg:grid-cols-2"><article className="glass-strong p-5"><h2 className="font-medium">Head of Delegation history</h2><p className="mt-2 text-sm text-muted-foreground">History with no named Head of Delegation stays in country view and is not assigned to the wrong person.</p><div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4"><SmallMetric label="TV assigned" value={data.hod.coverage.televoteAssignedBallots} /><SmallMetric label="TV unknown" value={data.hod.coverage.televoteUnknownBallots} /><SmallMetric label="Jury assigned" value={data.hod.coverage.juryAssignedBallots} /><SmallMetric label="Jury unknown" value={data.hod.coverage.juryUnknownBallots} /></div></article><article className="glass-strong p-5"><h2 className="font-medium">Data included</h2><p className="mt-2 text-sm text-muted-foreground">{data.overview.editions} edition{data.overview.editions === 1 ? "" : "s"} · {data.overview.rounds} Televoting round{data.overview.rounds === 1 ? "" : "s"} · {data.overview.juryVotes} saved jury score{data.overview.juryVotes === 1 ? "" : "s"}.</p><p className="mt-3 text-xs text-muted-foreground">Deleted Televoting ballots are excluded here but remain available to Integrity.</p></article></section>
          </div> : null}

          {view === "editions" ? <List>{data.editionRows.map((row) => <article key={row.id} className="glass grid gap-3 p-4 md:grid-cols-[minmax(0,1fr)_repeat(5,90px)] md:items-center"><div><p className="font-medium">{row.name}</p><p className="mt-1 text-xs text-muted-foreground">SSC{row.editionNumber || "?"} · {row.rounds} Televoting round{row.rounds === 1 ? "" : "s"}</p></div><SmallMetric label="TV ballots" value={row.ballots} /><SmallMetric label="Jury ballots" value={row.juryBallots} /><SmallMetric label="TV points" value={row.points} /><SmallMetric label="Jury points" value={row.juryPoints} /><SmallMetric label="Countries" value={row.voterCountries} /></article>)}{!data.editionRows.length ? <Empty>No jury or televote data in this scope.</Empty> : null}</List> : null}

          {view === "delegations" ? <List>{data.delegationRows.map((row) => <article key={row.identity} className="glass grid gap-3 p-4 md:grid-cols-[minmax(0,1fr)_repeat(5,78px)] md:items-center"><Identity name={row.name} code={`${row.code} · ${row.editions} edition${row.editions === 1 ? "" : "s"}`} image={row.flag_url} fallback={row.flag} /><SmallMetric label="TV ballots" value={row.ballots} /><SmallMetric label="Jury ballots" value={row.juryBallots} /><SmallMetric label="Jury pts" value={row.juryPoints} /><SmallMetric label="Supported" value={row.avgSupported.toFixed(1)} /><SmallMetric label="Risk" value={row.avgRisk.toFixed(1)} /></article>)}{!data.delegationRows.length ? <Empty>No delegation activity in this scope.</Empty> : null}</List> : null}

          {view === "controllers" ? <List><div className="glass-strong p-5"><h2 className="font-display text-3xl uppercase">HOD controller history</h2><p className="mt-2 text-sm text-muted-foreground">The same person can be followed across multiple countries or non-consecutive tenures without inheriting other controllers’ voting history.</p></div>{data.hodRows.map((row) => <article key={row.personId} className="glass grid gap-3 p-4 md:grid-cols-[minmax(0,1fr)_repeat(5,90px)] md:items-center"><div><p className="font-medium">{row.displayName}</p><p className="mt-1 text-xs text-muted-foreground">{row.countries.join(" · ") || "No country code"} · {row.editions} edition{row.editions === 1 ? "" : "s"}</p></div><SmallMetric label="TV ballots" value={row.televoteBallots} /><SmallMetric label="Jury ballots" value={row.juryBallots} /><SmallMetric label="TV points" value={row.televotePoints} /><SmallMetric label="Jury points" value={row.juryPoints} /><SmallMetric label="Jury scores" value={row.juryVotes} /></article>)}{!data.hodRows.length ? <Empty>No HOD-attributed activity yet. Add historical assignments in HOD History.</Empty> : null}</List> : null}

          {view === "entries" ? <List>{data.targetRows.map((row, index) => <article key={row.entryKey} className="glass grid gap-3 p-4 md:grid-cols-[34px_minmax(0,1fr)_repeat(5,80px)] md:items-center"><span className="text-center text-xs tabular-nums text-muted-foreground">{index + 1}</span><Identity name={row.name} code={row.code} image={row.image} fallback={row.flag} /><SmallMetric label="TV points" value={row.points} /><SmallMetric label="Jury pts" value={row.juryPoints} /><SmallMetric label="TV scores" value={row.scores} /><SmallMetric label="Jury scores" value={row.juryScores} /><SmallMetric label="Max scores" value={row.maxScores + row.juryMaximums} /></article>)}{!data.targetRows.length ? <Empty>No scored entries in this scope.</Empty> : null}</List> : null}

          {view === "channels" ? <List><div className="glass-strong p-5"><h2 className="font-display text-3xl uppercase">Jury vs televote</h2><p className="mt-2 text-sm text-muted-foreground">Raw point systems differ, so each entry is compared by its share of all points in that channel. Delta is televote share minus jury share.</p></div>{data.channelComparisonRows.map((row) => <article key={row.entryKey} className="glass grid gap-3 p-4 md:grid-cols-[minmax(0,1fr)_repeat(5,90px)] md:items-center"><div><p className="font-medium">{row.name}</p><p className="mt-1 text-xs text-muted-foreground">{row.code}</p></div><SmallMetric label="TV points" value={row.televotePoints} /><SmallMetric label="Jury points" value={row.juryPoints} /><SmallMetric label="TV share" value={`${row.televoteShare}%`} /><SmallMetric label="Jury share" value={`${row.juryShare}%`} /><SmallMetric label="Delta" value={`${row.shareDelta > 0 ? "+" : ""}${row.shareDelta} pp`} /></article>)}{!data.channelComparisonRows.length ? <Empty>No comparable jury/televote scores in this scope.</Empty> : null}</List> : null}

          {view === "distribution" ? <section className="glass-strong p-5"><h2 className="font-medium">Televote score distribution</h2><p className="mt-1 text-sm text-muted-foreground">How often each 1–10 website score appears across valid Televoting ballots.</p><div className="mt-5 grid grid-cols-10 items-end gap-2" style={{ height: 240 }}>{data.scoreDistribution.map((count, index) => <div key={index} className="flex h-full min-w-0 flex-col justify-end gap-2"><span className="text-center text-[10px] tabular-nums text-muted-foreground">{count}</span><div className="min-h-1 rounded-t-lg bg-primary/70" style={{ height: `${Math.max(2, (count / scoreMax) * 100)}%` }} /><span className="text-center text-xs font-medium">{index + 1}</span></div>)}</div></section> : null}

          {view === "activity" ? <List>{data.dailyActivity.map((row) => <article key={row.date} className="glass grid grid-cols-[minmax(0,1fr)_90px_110px] items-center gap-3 p-4"><div className="flex items-center gap-2"><CalendarDays className="size-4 text-sky-100/65" /><span className="font-medium">{new Date(`${row.date}T12:00:00`).toLocaleDateString()}</span></div><SmallMetric label="Ballots" value={row.ballots} /><SmallMetric label="Countries" value={row.voterCountries} /></article>)}{!data.dailyActivity.length ? <Empty>No Televoting activity in this scope.</Empty> : null}</List> : null}
        </>
      )}
    </div>
  );
}

function Metric({ label, value, icon: Icon, subtle = false }: { label: string; value: string | number; icon: typeof Users; subtle?: boolean }) { return <div className={cn("p-4 sm:p-5", subtle ? "glass" : "glass-strong")}><div className="flex items-center justify-between gap-2"><span className="text-[9px] uppercase tracking-[0.15em] text-muted-foreground">{label}</span><Icon className="size-4 text-sky-100/60" /></div><p className="mt-3 text-2xl font-medium tabular-nums sm:text-3xl">{value}</p></div>; }
function SmallMetric({ label, value }: { label: string; value: string | number }) { return <div className="text-right md:text-left"><p className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground">{label}</p><p className="mt-1 font-medium tabular-nums">{value}</p></div>; }
function Empty({ children }: { children: React.ReactNode }) { return <div className="glass-strong p-8 text-center text-sm text-muted-foreground">{children}</div>; }
function List({ children }: { children: React.ReactNode }) { return <section className="space-y-2">{children}</section>; }
function Identity({ name, code, image, fallback }: { name: string; code: string; image: string | null; fallback: string | null }) { return <div className="flex min-w-0 items-center gap-3"><div className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-xl border border-white/10 bg-white/[0.04]">{image ? <img src={image} alt="" className="h-full w-full object-cover" /> : <span>{fallback || "✦"}</span>}</div><div className="min-w-0"><p className="truncate font-medium">{name}</p><p className="mt-0.5 truncate text-xs text-muted-foreground">{code}</p></div></div>; }
