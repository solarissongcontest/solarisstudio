import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  CheckCircle2,
  GitMerge,
  Inbox,
  Link2,
  RefreshCw,
  Server,
  Snowflake,
  UserRoundCog,
} from "lucide-react";

import { getUnifiedSyncHealth } from "@/integrations/unified/sync-health.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/sync-health")({
  head: () => ({
    meta: [
      { title: "Sync Health — Solaris Operations" },
      { name: "description", content: "Canonical data and cross-service synchronization health for Solaris Studio, Confirmations and Televoting." },
    ],
  }),
  component: SyncHealthPage,
});

function SyncHealthPage() {
  const getHealth = useServerFn(getUnifiedSyncHealth);
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["unified-sync-health"],
    queryFn: () => getHealth(),
    refetchOnWindowFocus: false,
  });

  return (
    <div className="mx-auto max-w-[1350px] space-y-5">
      <header className="glass-strong p-5 sm:p-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Link to="/admin/operations" className="text-xs text-muted-foreground hover:text-foreground">← Solaris Operations</Link>
            <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-sky-200/15 bg-sky-200/[0.07] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-sky-100/75"><GitMerge className="h-3.5 w-3.5" /> Canonical data</div>
            <h1 className="font-display mt-3 text-5xl uppercase leading-none sm:text-6xl">Sync Health</h1>
            <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground">One place to see whether Confirmations and Televoting still agree with Solaris Studio, whether the privileged Televoting backend is reachable from Cloudflare, and how much historical voting data can be attributed to known HOD tenures.</p>
          </div>
          <button type="button" onClick={() => void refetch()} disabled={isFetching} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-white/12 bg-white/[0.05] px-4 text-xs font-semibold disabled:opacity-60"><RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} /> Refresh health</button>
        </div>
      </header>

      {isLoading ? <section className="glass-strong p-10 text-center text-sm text-muted-foreground">Checking canonical links and service runtimes…</section> : error || !data ? (
        <section className="glass-strong border-destructive/30 p-6 text-sm text-destructive">{error instanceof Error ? error.message : "Sync health could not be loaded."}</section>
      ) : (
        <>
          <section className={cn(
            "glass-strong border p-5",
            data.televotingRuntime.status === "healthy"
              ? "border-emerald-200/15 bg-emerald-200/[0.04]"
              : "border-amber-200/25 bg-amber-200/[0.06]",
          )}>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex min-w-0 gap-3">
                <div className={cn(
                  "grid h-10 w-10 shrink-0 place-items-center rounded-xl border",
                  data.televotingRuntime.status === "healthy"
                    ? "border-emerald-200/20 bg-emerald-200/10 text-emerald-100"
                    : "border-amber-200/25 bg-amber-200/10 text-amber-100",
                )}>
                  {data.televotingRuntime.status === "healthy" ? <CheckCircle2 className="h-4 w-4" /> : <Server className="h-4 w-4" />}
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-sm font-semibold">Televoting admin runtime</h2>
                    <span className={cn(
                      "rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em]",
                      data.televotingRuntime.status === "healthy"
                        ? "border-emerald-200/20 bg-emerald-200/[0.08] text-emerald-100"
                        : "border-amber-200/25 bg-amber-200/[0.09] text-amber-100",
                    )}>{data.televotingRuntime.status}</span>
                  </div>
                  <p className="mt-2 max-w-4xl break-words text-xs leading-relaxed text-muted-foreground">{data.televotingRuntime.message}</p>
                  {data.televotingRuntime.status !== "healthy" ? (
                    <p className="mt-2 text-[11px] leading-relaxed text-amber-100/70">Canonical Solaris data can remain healthy while the privileged Televoting connection is unavailable. Confirm the Cloudflare Worker secret and Televoting Supabase configuration before treating organizer voting tools as deployment-ready.</p>
                  ) : null}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:w-[230px]">
                <RuntimeStat label="Backend" ready={data.televotingRuntime.reachable} />
                <RuntimeStat label="Admin identity" ready={data.televotingRuntime.organizerCompatibilityReady} />
              </div>
            </div>
          </section>

          <section className="grid grid-cols-2 gap-2 lg:grid-cols-3 xl:grid-cols-6">
            <Metric label="Confirmation links" value={data.totals.confirmationLinks} icon={Inbox} />
            <Metric label="Voting bindings" value={data.totals.televotingBindings} icon={Link2} />
            <Metric label="Stale voting rounds" value={data.totals.staleTelevotingBindings} icon={RefreshCw} attention={data.totals.staleTelevotingBindings > 0} />
            <Metric label="Failed sync events" value={data.totals.failedEvents} icon={AlertTriangle} attention={data.totals.failedEvents > 0} />
            <Metric label="Pending retries" value={data.totals.pendingEvents} icon={GitMerge} attention={data.totals.pendingEvents > 0} />
            <Metric label="Known HODs" value={data.totals.hodPeople} icon={UserRoundCog} />
          </section>

          <section className="glass-strong overflow-hidden">
            <div className="border-b border-white/10 p-4 sm:p-5">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div><h2 className="font-display text-3xl uppercase">Edition continuity</h2><p className="mt-1 text-xs text-muted-foreground">Canonical participation and entry counts alongside service projections and HOD-history coverage.</p></div>
                <Link to="/admin/hod-history" className="inline-flex items-center gap-2 text-xs text-violet-100/75 hover:text-violet-100"><UserRoundCog className="h-3.5 w-3.5" /> Manage HOD History</Link>
              </div>
            </div>
            <div className="divide-y divide-white/8">
              {data.editions.map((edition) => (
                <div key={edition.id} className="p-4 sm:p-5">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em]", edition.health === "healthy" && "border-emerald-200/15 bg-emerald-200/[0.07] text-emerald-100", edition.health === "attention" && "border-amber-200/20 bg-amber-200/[0.08] text-amber-100", edition.health === "idle" && "border-white/10 bg-white/[0.04] text-muted-foreground")}>
                          {edition.health === "healthy" ? <CheckCircle2 className="h-3 w-3" /> : edition.health === "attention" ? <AlertTriangle className="h-3 w-3" /> : <Snowflake className="h-3 w-3" />}{edition.health}
                        </span>
                        <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">revision {edition.dataRevision}</span>
                      </div>
                      <h3 className="mt-2 text-lg font-semibold">{edition.editionNumber ? `SSC${edition.editionNumber}` : edition.name}{edition.editionNumber && edition.name !== `SSC${edition.editionNumber}` ? <span className="ml-2 text-sm font-normal text-muted-foreground">{edition.name}</span> : null}</h3>
                    </div>

                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
                      <SmallStat label="Confirmed" value={edition.confirmedParticipants} />
                      <SmallStat label="Entries" value={edition.entries} />
                      <SmallStat label="Confirmations" value={edition.confirmationSubmissions} />
                      <SmallStat label="Voting rounds" value={edition.televotingRounds} />
                      <SmallStat label="Stale" value={edition.staleTelevotingRounds} attention={edition.staleTelevotingRounds > 0} />
                      <SmallStat label="Frozen" value={edition.frozenTelevotingRounds} />
                      <SmallStat label="HOD mapped" value={edition.hodMappedDelegations} />
                      <SmallStat label="HOD coverage" value={`${edition.hodCoveragePercent}%`} />
                    </div>
                  </div>

                  {(edition.withdrawnParticipants > 0 || edition.pendingEntries > 0 || edition.confirmationEntries > 0 || edition.hodUnmappedDelegations > 0 || edition.hodChannelOverrides > 0) && (
                    <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 border-t border-white/8 pt-3 text-xs text-muted-foreground">
                      {edition.withdrawnParticipants > 0 && <span>{edition.withdrawnParticipants} withdrawn</span>}
                      {edition.pendingEntries > 0 && <span>{edition.pendingEntries} entries awaiting selection</span>}
                      {edition.selectedEntries > 0 && <span>{edition.selectedEntries} selected entries</span>}
                      {edition.confirmationEntries > 0 && <span>{edition.confirmationEntries} entry links from Confirmations</span>}
                      {edition.hodUnmappedDelegations > 0 && <span className="text-violet-100/65">{edition.hodUnmappedDelegations} delegation{edition.hodUnmappedDelegations === 1 ? "" : "s"} without historical HOD attribution</span>}
                      {edition.hodChannelOverrides > 0 && <span>{edition.hodChannelOverrides} jury/televote HOD override{edition.hodChannelOverrides === 1 ? "" : "s"}</span>}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="border-t border-white/8 bg-violet-200/[0.025] p-4 text-xs leading-relaxed text-muted-foreground"><strong className="text-violet-100/75">HOD coverage is informational.</strong> Missing old controller history does not mark the edition sync as broken; it only limits how confidently Analytics and Friend Voting can attribute historical behaviour to a specific person.</div>
          </section>

          <section className="glass-strong overflow-hidden">
            <div className="flex flex-col gap-2 border-b border-white/10 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5"><div><h2 className="font-display text-3xl uppercase">Problems & retries</h2><p className="mt-1 text-xs text-muted-foreground">Only failed, pending or retrying integration events appear here.</p></div>{!data.recentProblems.length && <span className="inline-flex items-center gap-2 text-xs text-emerald-100/80"><CheckCircle2 className="h-4 w-4" /> No unresolved integration events</span>}</div>
            {data.recentProblems.length ? <div className="divide-y divide-white/8">{data.recentProblems.map((event) => <div key={event.id} className="grid gap-2 p-4 text-sm sm:grid-cols-[120px_180px_minmax(0,1fr)_160px] sm:items-center"><span className={cn("text-xs font-semibold uppercase tracking-[0.1em]", event.status === "failed" ? "text-rose-200" : "text-amber-100")}>{event.status}</span><span className="truncate text-xs text-muted-foreground">{event.service} · {event.eventType}</span><span className="min-w-0 break-words text-xs">{event.lastError ?? "Waiting for retry"}</span><span className="text-xs text-muted-foreground sm:text-right">{new Date(event.updatedAt).toLocaleString()}</span></div>)}</div> : <div className="p-8 text-center text-sm text-muted-foreground">Everything currently resolves to the canonical Solaris record.</div>}
          </section>
        </>
      )}
    </div>
  );
}

function Metric({ label, value, icon: Icon, attention = false }: { label: string; value: number; icon: typeof Link2; attention?: boolean }) {
  return <div className={cn("glass p-4", attention && "border-amber-200/20 bg-amber-200/[0.05]")}><div className="flex items-center justify-between gap-2"><p className="text-[9px] font-bold uppercase tracking-[0.13em] text-muted-foreground">{label}</p><Icon className={cn("h-3.5 w-3.5", attention ? "text-amber-100" : "text-sky-100/55")} /></div><p className="mt-3 text-2xl font-semibold">{value}</p></div>;
}

function SmallStat({ label, value, attention = false }: { label: string; value: string | number; attention?: boolean }) {
  return <div className={cn("min-w-[92px] rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2", attention && "border-amber-200/20 bg-amber-200/[0.06]")}><p className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground">{label}</p><p className={cn("mt-1 text-lg font-semibold", attention && "text-amber-100")}>{value}</p></div>;
}

function RuntimeStat({ label, ready }: { label: string; ready: boolean }) {
  return <div className={cn("rounded-xl border px-3 py-2", ready ? "border-emerald-200/15 bg-emerald-200/[0.05]" : "border-amber-200/20 bg-amber-200/[0.06]")}><p className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground">{label}</p><p className={cn("mt-1 text-xs font-semibold", ready ? "text-emerald-100" : "text-amber-100")}>{ready ? "Ready" : "Unavailable"}</p></div>;
}
