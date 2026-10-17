import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Activity, AlertTriangle, Network, ShieldAlert, ShieldCheck, Users } from "lucide-react";

import { useAdminContext } from "@/components/admin/AdminContext";
import {
  AdminCard,
  AdminCardHeader,
  AdminEmptyState,
  AdminPageHeader,
  AdminStatus,
} from "@/components/admin/AdminUI";
import { getEditionScopedResultIntegrity } from "@/integrations/televoting/result-integrity.functions";
import { getMergedTelevotingRoundsPage } from "@/integrations/televoting/rounds.functions";

export const Route = createFileRoute("/televoting/admin/result-integrity")({
  head: () => ({
    meta: [
      { title: "Result Integrity — Solaris Organizer" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ResultIntegrityPage,
});

function ResultIntegrityPage() {
  const { editionId } = useAdminContext();

  if (!editionId) {
    return (
      <div className="admin-page mx-auto max-w-6xl pb-8">
        <AdminCard>
          <AdminEmptyState
            icon={ShieldAlert}
            title="Choose an edition"
            description="Result Integrity is edition-scoped Organizer work. Select the exact edition before Solaris loads voting rounds or forensic result evidence."
            action={<Link to="/televoting/admin" className="admin-action-secondary">Back to Voting</Link>}
          />
        </AdminCard>
      </div>
    );
  }

  return <EditionScopedResultIntegrity key={editionId} editionId={editionId} />;
}

function EditionScopedResultIntegrity({ editionId }: { editionId: string }) {
  const getRoundsPage = useServerFn(getMergedTelevotingRoundsPage);
  const getIntegrity = useServerFn(getEditionScopedResultIntegrity);
  const [roundId, setRoundId] = useState("");

  const roundsQuery = useQuery({
    queryKey: ["v3-result-integrity-rounds", editionId],
    queryFn: () => getRoundsPage({ data: { editionId } }),
    staleTime: 10_000,
  });
  const linked = roundsQuery.data?.linked === true;
  const rounds = roundsQuery.data?.edition?.rounds ?? [];
  const effectiveRoundId = roundId || rounds.find((round) => round.status === "closed")?.id || rounds[0]?.id || "";

  const { data, isLoading, error } = useQuery({
    queryKey: ["v3-result-integrity", editionId, effectiveRoundId],
    queryFn: () => getIntegrity({ data: { editionId, roundId: effectiveRoundId } }),
    enabled: Boolean(effectiveRoundId && linked),
    staleTime: 10_000,
  });

  return (
    <div className="admin-page mx-auto max-w-6xl pb-8" data-v3-result-integrity-edition={editionId}>
      <AdminPageHeader
        eyebrow="Voting · Result integrity"
        title="Result integrity"
        description="Inspect stored influence, concentration and pre-submit evidence for the exact edition selected in Solaris Organizer. This V3 surface is read-only until recompute has governed, replay-safe server authority."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link to="/admin/friend-voting" className="admin-action-secondary"><Network className="size-4" /> Friend-voting intelligence</Link>
            <AdminStatus tone="info">Read-only evidence</AdminStatus>
          </div>
        }
      />

      <AdminCard className="mb-4 !border-amber-200/15">
        <div className="flex items-start gap-3">
          <ShieldAlert className="mt-0.5 size-4 shrink-0 text-amber-100" />
          <div>
            <p className="text-sm font-semibold">Recompute is intentionally unavailable here</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Rebuilding cluster-influence evidence changes stored derived data. Solaris keeps that control disabled in the edition-scoped V3 workspace until the server can apply it atomically, version-check it and reconcile uncertain outcomes.
            </p>
          </div>
        </div>
      </AdminCard>

      {roundsQuery.isLoading ? (
        <AdminCard className="py-10 text-center text-sm text-muted-foreground">Loading edition-scoped rounds…</AdminCard>
      ) : roundsQuery.error ? (
        <AdminCard className="border-rose-200/15 bg-rose-200/[0.045] text-sm text-rose-100">
          {roundsQuery.error instanceof Error ? roundsQuery.error.message : "Voting rounds could not be loaded for this edition."}
        </AdminCard>
      ) : roundsQuery.data && !linked ? (
        <AdminCard>
          <AdminEmptyState
            icon={ShieldAlert}
            title="Voting edition is not linked"
            description="Result Integrity cannot resolve authoritative voting rounds for this Solaris edition yet. Link the edition from Voting before reviewing result evidence."
          />
        </AdminCard>
      ) : !rounds.length ? (
        <AdminCard><AdminEmptyState icon={ShieldCheck} title="No televote rounds in this edition" description="Create or link a televoting round before result-integrity evidence can be reviewed." /></AdminCard>
      ) : (
        <div className="space-y-4">
          <AdminCard className="!p-3">
            <label className="block">
              <span className="admin-section-label">Round</span>
              <select
                value={effectiveRoundId}
                onChange={(event) => setRoundId(event.target.value)}
                className="mt-2 min-h-11 w-full rounded-xl border border-white/[0.1] bg-[#07111f] px-3 text-sm font-semibold"
              >
                {rounds.map((round) => <option key={round.id} value={round.id}>{round.name} · {round.status}</option>)}
              </select>
            </label>
          </AdminCard>

          {isLoading ? (
            <AdminCard className="py-10 text-center text-sm text-muted-foreground">Loading integrity evidence…</AdminCard>
          ) : error || !data ? (
            <AdminCard className="border-rose-200/15 bg-rose-200/[0.045] text-sm text-rose-100">{error instanceof Error ? error.message : "Result integrity could not be loaded."}</AdminCard>
          ) : (
            <>
              {data.round.engineVersion !== "robust-televote-v2" ? (
                <AdminCard className="border-amber-200/15 bg-amber-200/[0.04]">
                  <AdminCardHeader eyebrow="Legacy engine" title="Counterfactual cluster analysis is unavailable" />
                  <p className="text-sm leading-relaxed text-muted-foreground">This round uses {data.round.engineVersion}. Historical results remain reproducible, but ballot-level breadth and leave-out analysis belongs to Robust Televote v2.</p>
                </AdminCard>
              ) : null}

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Metric icon={Users} label="Voters analysed" value={data.summary.votersAnalysed} />
                <Metric icon={Network} label="Clusters analysed" value={data.summary.clustersAnalysed} />
                <Metric icon={Activity} label="Outcome-sensitive" value={data.summary.winnerSensitive + data.summary.topThreeSensitive} />
                <Metric icon={AlertTriangle} label="High-risk preflights" value={data.summary.highRiskPreflights} />
              </div>

              <AdminCard>
                <AdminCardHeader
                  eyebrow="Influence"
                  title="Who could actually move the result?"
                  action={<AdminStatus tone={data.summary.winnerSensitive ? "attention" : "ready"}>{data.summary.winnerSensitive ? `${data.summary.winnerSensitive} winner-sensitive` : "Winner stable"}</AdminStatus>}
                />
                {data.influences.length ? (
                  <div className="divide-y divide-white/[0.07]">
                    {data.influences.slice(0, 30).map((row: any) => (
                      <div key={`${row.subject_type}:${row.subject_key}`} className="grid gap-3 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate text-sm font-semibold">{row.label}</p>
                            <span className="rounded-full border border-white/10 px-2 py-0.5 text-[9px] uppercase tracking-[0.1em] text-muted-foreground">{row.subject_type}</span>
                            {row.winner_changed ? <AdminStatus tone="attention">Winner changes</AdminStatus> : null}
                            {!row.winner_changed && row.top_three_changed ? <AdminStatus tone="info">Top 3 changes</AdminStatus> : null}
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Max rank movement {row.max_rank_movement} · max point movement {row.max_point_movement}{row.most_affected_entry ? ` · most affected ${row.most_affected_entry}` : ""}
                          </p>
                          {row.subject_type === "cluster" && row.memberLabels?.length ? <p className="mt-1 text-[11px] text-muted-foreground">{row.memberLabels.join(" · ")}</p> : null}
                        </div>
                        <span className="numeric text-sm font-bold text-sky-100">impact {row.severityScore}/100</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <AdminEmptyState icon={Activity} title="No stored influence snapshots" description="Stored influence evidence will appear here once a governed integrity analysis has produced it. This V3 view does not recompute evidence itself." />
                )}
              </AdminCard>

              <AdminCard>
                <AdminCardHeader eyebrow="Support breadth" title="Entries with the most concentrated support" />
                {data.concentration.length ? (
                  <div className="divide-y divide-white/[0.07]">
                    {data.concentration.map((row) => (
                      <div key={row.countryCode} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-3">
                        <div className="min-w-0">
                          <p className="font-semibold">{row.countryCode}</p>
                          <p className="mt-1 text-xs text-muted-foreground">{row.supporterCount} supporters · {row.effectiveSupporters.toFixed(2)} effective supporters · breadth factor {row.breadthFactor.toFixed(3)}</p>
                        </div>
                        <div className="text-right"><p className="numeric font-bold text-sky-100">{row.finalPoints} pts</p><p className="mt-1 text-[10px] text-muted-foreground">robust rank #{row.robustRank || "–"}</p></div>
                      </div>
                    ))}
                  </div>
                ) : <p className="text-sm text-muted-foreground">No Robust v2 result rows are stored yet.</p>}
              </AdminCard>

              <AdminCard>
                <AdminCardHeader
                  eyebrow="Pre-submit integrity"
                  title="Risk, confidence and intervention"
                  action={<AdminStatus tone={data.summary.declarations ? "attention" : "ready"}>{data.summary.declarations} declaration{data.summary.declarations === 1 ? "" : "s"}</AdminStatus>}
                />
                {data.preflights.length ? (
                  <div className="divide-y divide-white/[0.07]">
                    {data.preflights.slice(0, 40).map((row) => (
                      <div key={row.id} className="grid gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                        <div>
                          <p className="text-sm font-semibold">{row.username} · {row.countryCode}</p>
                          <p className="mt-1 text-xs text-muted-foreground">{row.interventionLevel.replaceAll("_", " ")} · {row.modelVersion} · {row.reasonCategories.join(", ") || "no notable reason category"}</p>
                        </div>
                        <div className="flex gap-2 text-xs"><span className="rounded-full border border-white/10 px-2.5 py-1">risk {row.riskScore}</span><span className="rounded-full border border-white/10 px-2.5 py-1">confidence {row.confidence}</span></div>
                      </div>
                    ))}
                  </div>
                ) : <p className="text-sm text-muted-foreground">No pre-submit integrity checks are stored for this round.</p>}
              </AdminCard>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Metric({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: number }) {
  return (
    <AdminCard className="!p-4">
      <Icon className="size-4 text-sky-100" />
      <p className="numeric mt-3 text-2xl font-black">{value}</p>
      <p className="mt-1 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
    </AdminCard>
  );
}