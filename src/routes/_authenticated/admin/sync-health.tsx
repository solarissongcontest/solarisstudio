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

import { AdminPage } from "@/components/admin/AdminShell";
import {
  AdminCard,
  AdminCardHeader,
  AdminEmptyState,
  AdminPageHeader,
  AdminStatus,
} from "@/components/admin/AdminUI";
import { getUnifiedSyncHealth } from "@/integrations/unified/sync-health.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/sync-health")({
  head: () => ({
    meta: [
      { title: "Sync health — Solaris Organizer" },
      { name: "robots", content: "noindex" },
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

  const hasAttention = !!data && (
    data.televotingRuntime.status !== "healthy" ||
    data.totals.staleTelevotingBindings > 0 ||
    data.totals.failedEvents > 0 ||
    data.totals.pendingEvents > 0 ||
    data.editions.some((edition) => edition.health === "attention")
  );

  return (
    <AdminPage>
      <AdminPageHeader
        eyebrow="System"
        title="Sync health"
        description="Check whether Solaris Studio, Confirmations and Televoting still agree. Start with anything that needs attention; technical details stay secondary."
        actions={
          <button type="button" onClick={() => void refetch()} disabled={isFetching} className="admin-action-secondary">
            <RefreshCw className={cn("size-4", isFetching && "animate-spin")} /> {isFetching ? "Checking…" : "Refresh"}
          </button>
        }
      />

      {isLoading ? (
        <AdminCard><p className="py-8 text-center text-sm text-muted-foreground">Checking canonical links and service runtimes…</p></AdminCard>
      ) : error || !data ? (
        <AdminCard className="!border-rose-200/15 !bg-rose-200/[0.045]">
          <AdminEmptyState icon={AlertTriangle} title="Sync health could not be loaded" description={error instanceof Error ? error.message : "Try refreshing the health check."} />
        </AdminCard>
      ) : (
        <>
          <AdminCard strong className={hasAttention ? "!border-amber-200/15" : "!border-emerald-200/15"}>
            <div className="flex min-w-0 items-start gap-3">
              <span className={cn(
                "grid size-11 shrink-0 place-items-center rounded-xl border",
                hasAttention
                  ? "border-amber-200/15 bg-amber-200/[0.06] text-amber-100"
                  : "border-emerald-200/15 bg-emerald-200/[0.06] text-emerald-100",
              )}>
                {hasAttention ? <AlertTriangle className="size-5" /> : <CheckCircle2 className="size-5" />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-bold text-foreground">{hasAttention ? "Some systems need attention" : "Systems agree"}</h2>
                  <AdminStatus tone={hasAttention ? "attention" : "ready"}>{hasAttention ? "Review" : "Healthy"}</AdminStatus>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {hasAttention
                    ? "Review the highlighted service or synchronization items below before relying on affected organizer tools."
                    : "Canonical links, service projections and the Televoting organizer runtime currently report healthy state."}
                </p>
              </div>
            </div>
          </AdminCard>

          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <Metric label="Failed" value={data.totals.failedEvents} icon={AlertTriangle} attention={data.totals.failedEvents > 0} />
            <Metric label="Retries" value={data.totals.pendingEvents} icon={GitMerge} attention={data.totals.pendingEvents > 0} />
            <Metric label="Stale rounds" value={data.totals.staleTelevotingBindings} icon={RefreshCw} attention={data.totals.staleTelevotingBindings > 0} />
          </div>

          <AdminCard>
            <AdminCardHeader eyebrow="Service status" title="Televoting runtime" description="Whether the privileged organizer connection required by Televoting is available." />
            <div className="flex min-w-0 items-start gap-3">
              <span className={cn(
                "grid size-10 shrink-0 place-items-center rounded-xl border",
                data.televotingRuntime.status === "healthy"
                  ? "border-emerald-200/15 bg-emerald-200/[0.06] text-emerald-100"
                  : "border-amber-200/15 bg-amber-200/[0.06] text-amber-100",
              )}>
                {data.televotingRuntime.status === "healthy" ? <CheckCircle2 className="size-4" /> : <Server className="size-4" />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-foreground">Organizer connection</p>
                  <AdminStatus tone={data.televotingRuntime.status === "healthy" ? "ready" : "attention"}>{data.televotingRuntime.status}</AdminStatus>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <RuntimeStat label="Backend" ready={data.televotingRuntime.reachable} />
                  <RuntimeStat label="Admin identity" ready={data.televotingRuntime.organizerCompatibilityReady} />
                </div>
                <details className="mt-3 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
                  <summary className="cursor-pointer text-xs font-semibold text-muted-foreground hover:text-foreground">Technical details</summary>
                  <p className="mt-2 break-words text-xs leading-relaxed text-muted-foreground">{data.televotingRuntime.message}</p>
                  {data.televotingRuntime.status !== "healthy" ? (
                    <p className="mt-2 text-xs leading-relaxed text-amber-100/75">The canonical Solaris records can still be healthy while this organizer connection is unavailable. Check the Televoting runtime configuration before live voting work.</p>
                  ) : null}
                </details>
              </div>
            </div>
          </AdminCard>

          <AdminCard>
            <AdminCardHeader
              eyebrow="Canonical links"
              title="Cross-service bindings"
              description="Useful totals for Confirmations, Televoting and historical controller attribution."
            />
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <CompactMetric label="Confirmation links" value={data.totals.confirmationLinks} icon={Inbox} />
              <CompactMetric label="Voting bindings" value={data.totals.televotingBindings} icon={Link2} />
              <CompactMetric label="Known HODs" value={data.totals.hodPeople} icon={UserRoundCog} />
              <CompactMetric label="Editions" value={data.editions.length} icon={GitMerge} />
            </div>
          </AdminCard>

          <AdminCard className="!p-0 overflow-hidden">
            <div className="p-4 sm:p-5">
              <AdminCardHeader
                eyebrow="Continuity"
                title="Edition health"
                description="Participation, service projection and HOD-history coverage by edition."
                action={<Link to="/admin/hod-history" className="admin-action-secondary !min-h-10"><UserRoundCog className="size-4" /> HOD history</Link>}
              />
            </div>
            <div className="divide-y divide-white/[0.07]">
              {data.editions.map((edition) => (
                <div key={edition.id} className="p-4 sm:p-5">
                  <div className="flex min-w-0 items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <AdminStatus tone={edition.health === "healthy" ? "ready" : edition.health === "attention" ? "attention" : "neutral"}>
                          {edition.health === "healthy" ? "Healthy" : edition.health === "attention" ? "Attention" : "Idle"}
                        </AdminStatus>
                        <span className="text-xs text-muted-foreground">Revision {edition.dataRevision}</span>
                      </div>
                      <h3 className="mt-2 text-base font-bold text-foreground">
                        {edition.editionNumber ? `SSC ${edition.editionNumber}` : edition.name}
                      </h3>
                      {edition.editionNumber && edition.name !== `SSC${edition.editionNumber}` && edition.name !== `SSC ${edition.editionNumber}` ? <p className="mt-1 text-xs text-muted-foreground">{edition.name}</p> : null}
                    </div>
                    <span className={cn("grid size-9 shrink-0 place-items-center rounded-xl border", edition.health === "healthy" ? "border-emerald-200/15 bg-emerald-200/[0.05] text-emerald-100" : edition.health === "attention" ? "border-amber-200/15 bg-amber-200/[0.05] text-amber-100" : "border-white/[0.07] bg-white/[0.03] text-muted-foreground")}>
                      {edition.health === "healthy" ? <CheckCircle2 className="size-4" /> : edition.health === "attention" ? <AlertTriangle className="size-4" /> : <Snowflake className="size-4" />}
                    </span>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <SmallStat label="Confirmed" value={edition.confirmedParticipants} />
                    <SmallStat label="Entries" value={edition.entries} />
                    <SmallStat label="Voting rounds" value={edition.televotingRounds} />
                    <SmallStat label="HOD coverage" value={`${edition.hodCoveragePercent}%`} />
                  </div>

                  <details className="mt-3 rounded-xl border border-white/[0.07] bg-white/[0.018] p-3">
                    <summary className="cursor-pointer text-xs font-semibold text-muted-foreground hover:text-foreground">More continuity details</summary>
                    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <SmallStat label="Confirmations" value={edition.confirmationSubmissions} />
                      <SmallStat label="Stale rounds" value={edition.staleTelevotingRounds} attention={edition.staleTelevotingRounds > 0} />
                      <SmallStat label="Frozen rounds" value={edition.frozenTelevotingRounds} />
                      <SmallStat label="HOD mapped" value={edition.hodMappedDelegations} />
                    </div>
                    {(edition.withdrawnParticipants > 0 || edition.pendingEntries > 0 || edition.confirmationEntries > 0 || edition.hodUnmappedDelegations > 0 || edition.hodChannelOverrides > 0) ? (
                      <div className="mt-3 space-y-1 text-xs leading-relaxed text-muted-foreground">
                        {edition.withdrawnParticipants > 0 ? <p>{edition.withdrawnParticipants} withdrawn participant{edition.withdrawnParticipants === 1 ? "" : "s"}</p> : null}
                        {edition.pendingEntries > 0 ? <p>{edition.pendingEntries} entr{edition.pendingEntries === 1 ? "y" : "ies"} awaiting selection</p> : null}
                        {edition.selectedEntries > 0 ? <p>{edition.selectedEntries} selected entr{edition.selectedEntries === 1 ? "y" : "ies"}</p> : null}
                        {edition.confirmationEntries > 0 ? <p>{edition.confirmationEntries} entry link{edition.confirmationEntries === 1 ? "" : "s"} from Confirmations</p> : null}
                        {edition.hodUnmappedDelegations > 0 ? <p>{edition.hodUnmappedDelegations} delegation{edition.hodUnmappedDelegations === 1 ? "" : "s"} without historical HOD attribution</p> : null}
                        {edition.hodChannelOverrides > 0 ? <p>{edition.hodChannelOverrides} jury/televote HOD override{edition.hodChannelOverrides === 1 ? "" : "s"}</p> : null}
                      </div>
                    ) : null}
                  </details>
                </div>
              ))}
            </div>
            <div className="border-t border-white/[0.07] bg-violet-200/[0.025] p-4 text-xs leading-relaxed text-muted-foreground">
              <strong className="text-violet-100/80">HOD coverage is informational.</strong> Missing historical controller data limits attribution in Analytics and Friend Voting, but does not by itself mean synchronization is broken.
            </div>
          </AdminCard>

          <AdminCard>
            <AdminCardHeader
              eyebrow="Integration queue"
              title="Problems & retries"
              description="Only failed, pending or retrying integration events appear here."
              action={!data.recentProblems.length ? <AdminStatus tone="ready">Clear</AdminStatus> : <AdminStatus tone="attention">{data.recentProblems.length} open</AdminStatus>}
            />
            {!data.recentProblems.length ? (
              <AdminEmptyState icon={CheckCircle2} title="No unresolved integration events" description="Everything currently resolves to the canonical Solaris record." />
            ) : (
              <div className="divide-y divide-white/[0.07]">
                {data.recentProblems.map((event) => (
                  <div key={event.id} className="py-3 first:pt-0 last:pb-0">
                    <div className="flex min-w-0 items-start gap-3">
                      <span className={cn("grid size-9 shrink-0 place-items-center rounded-xl border", event.status === "failed" ? "border-rose-200/15 bg-rose-200/[0.055] text-rose-100" : "border-amber-200/15 bg-amber-200/[0.05] text-amber-100")}>
                        <AlertTriangle className="size-3.5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold text-foreground">{event.service} · {humanize(event.eventType)}</p>
                          <AdminStatus tone={event.status === "failed" ? "blocked" : "attention"}>{humanize(event.status)}</AdminStatus>
                        </div>
                        <p className="mt-1 break-words text-xs leading-relaxed text-muted-foreground">{event.lastError ?? "Waiting for retry"}</p>
                        <p className="mt-1 text-xs text-muted-foreground">Updated {new Date(event.updatedAt).toLocaleString()}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </AdminCard>
        </>
      )}
    </AdminPage>
  );
}

function Metric({ label, value, icon: Icon, attention = false }: { label: string; value: number; icon: typeof Link2; attention?: boolean }) {
  return (
    <div className={cn("admin-card px-3 py-3", attention && "!border-amber-200/15 !bg-amber-200/[0.045]")}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold text-muted-foreground">{label}</p>
        <Icon className={cn("size-3.5", attention ? "text-amber-100" : "text-sky-100/60")} />
      </div>
      <p className={cn("numeric mt-2 text-xl font-bold", attention && "text-amber-100")}>{value}</p>
    </div>
  );
}

function CompactMetric({ label, value, icon: Icon }: { label: string; value: number; icon: typeof Link2 }) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
      <div className="flex items-center gap-2 text-muted-foreground"><Icon className="size-3.5" /><p className="text-[11px] font-semibold">{label}</p></div>
      <p className="numeric mt-2 text-xl font-bold text-foreground">{value}</p>
    </div>
  );
}

function SmallStat({ label, value, attention = false }: { label: string; value: string | number; attention?: boolean }) {
  return (
    <div className={cn("rounded-xl border border-white/[0.07] bg-white/[0.025] px-3 py-2.5", attention && "border-amber-200/15 bg-amber-200/[0.05]")}>
      <p className="text-[11px] font-semibold text-muted-foreground">{label}</p>
      <p className={cn("numeric mt-1 text-lg font-bold text-foreground", attention && "text-amber-100")}>{value}</p>
    </div>
  );
}

function RuntimeStat({ label, ready }: { label: string; ready: boolean }) {
  return (
    <div className={cn("rounded-xl border px-3 py-2.5", ready ? "border-emerald-200/15 bg-emerald-200/[0.05]" : "border-amber-200/15 bg-amber-200/[0.05]")}>
      <p className="text-[11px] font-semibold text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-sm font-semibold", ready ? "text-emerald-100" : "text-amber-100")}>{ready ? "Ready" : "Unavailable"}</p>
    </div>
  );
}

function humanize(value: string) {
  return value.replaceAll("_", " ").replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
