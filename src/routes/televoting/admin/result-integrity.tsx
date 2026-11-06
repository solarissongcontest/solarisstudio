import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Activity, AlertTriangle, Network, RefreshCw, ShieldCheck, Users } from "lucide-react";
import { toast } from "sonner";

import { useAdminContext } from "@/components/admin/AdminContext";
import {
  AdminCard,
  AdminCardHeader,
  AdminEmptyState,
  AdminPageHeader,
  AdminStatus,
} from "@/components/admin/AdminUI";
import { getResultIntegrity, recomputeResultIntegrity } from "@/integrations/televoting/result-integrity.functions";
import { getMergedTelevotingRoundsPage } from "@/integrations/televoting/rounds.functions";

export const Route = createFileRoute("/televoting/admin/result-integrity")({
  component: ResultIntegrityRoute,
});

function ResultIntegrityRoute() {
  const { editionId, editionLabel } = useAdminContext();

  if (!editionId) {
    return (
      <div className="admin-page mx-auto max-w-6xl pb-8">
        <AdminPageHeader
          eyebrow="Voting integrity"
          title="Result integrity"
          description="Result-integrity analysis is edition-scoped Organizer work."
        />
        <AdminCard>
          <AdminEmptyState
            icon={ShieldCheck}
            title="Choose an edition"
            description="Select the exact edition in the Organizer toolbar before loading or recomputing result-integrity evidence."
            action={<Link to="/televoting/admin" className="admin-action-secondary">Back to Voting</Link>}
          />
        </AdminCard>
      </div>
    );
  }

  return (
    <ResultIntegrityPage
      key={editionId}
      editionId={editionId}
      editionLabel={editionLabel?.trim() || editionId}
    />
  );
}

function ResultIntegrityPage({ editionId, editionLabel }: { editionId: string; editionLabel: string }) {
  const queryClient = useQueryClient();
  const getRoundsPage = useServerFn(getMergedTelevotingRoundsPage);
  const getIntegrity = useServerFn(getResultIntegrity);
  const recompute = useServerFn(recomputeResultIntegrity);
  const [roundId, setRoundId] = useState("");

  const { data: page, isLoading: loadingRounds, error: roundsError } = useQuery({
    queryKey: ["v3-organizer-result-integrity-rounds", editionId],
    queryFn: () => getRoundsPage({ data: { editionId } }),
    staleTime: 10_000,
  });
  const rounds = useMemo(
    () => (page?.edition?.rounds ?? []).map((round) => ({
      ...round,
      editionName: page?.edition?.name ?? "Selected edition",
    })),
    [page],
  );
  const effectiveRoundId = roundId || rounds.find((round) => round.status === "closed")?.id || rounds[0]?.id || "";

  const { data, isLoading, error } = useQuery({
    queryKey: ["televoting-result-integrity", editionId, effectiveRoundId],
    queryFn: async () => {
      if (!rounds.some((round) => round.id === effectiveRoundId)) {
        throw new Error("Result Integrity round is outside the selected edition scope");
      }
      const result = await getIntegrity({ data: { roundId: effectiveRoundId } });
      if (result.round.id !== effectiveRoundId) {
        throw new Error("Result Integrity returned evidence for a different voting round");
      }
      return result;
    },
    enabled: Boolean(effectiveRoundId && rounds.some((round) => round.id === effectiveRoundId)),
  });

  const recomputeMutation = useMutation({
    mutationFn: async () => {
      if (!effectiveRoundId || !rounds.some((round) => round.id === effectiveRoundId)) {
        throw Object.assign(
          new Error("Result Integrity round is outside the selected Organizer edition. Refresh before retrying."),
          { status: 409 },
        );
      }
      return recompute({ data: { roundId: effectiveRoundId } });
    },
    onSuccess: async (result) => {
      toast.success(`Integrity analysis refreshed · ${result.clustersAnalysed} current cluster${result.clustersAnalysed === 1 ? "" : "s"} analysed`);
      await queryClient.invalidateQueries({ queryKey: ["televoting-result-integrity", editionId, effectiveRoundId] });
    },
    onError: (caught) => toast.error(caught instanceof Error ? caught.message : "Integrity analysis failed"),
  });

  return (
    <div className="admin-page mx-auto max-w-6xl pb-8" data-v3-organizer-result-integrity-edition={editionId}>
      <AdminPageHeader
        eyebrow={`${editionLabel} · Voting integrity`}
        title="Result integrity"
        description="Separate suspicious-looking behaviour from evidence quality and actual result influence inside the exact selected edition. Counterfactuals are review evidence only and never delete ballots automatically."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link to="/admin/friend-voting" className="admin-action-secondary"><Network className="size-4" /> Friend-voting intelligence</Link>
            <button
              type="button"
              className="admin-action-primary"
              disabled={!effectiveRoundId || recomputeMutation.isPending || data?.round.engineVersion !== "robust-televote-v2"}
              onClick={() => recomputeMutation.mutate()}
            >
              <RefreshCw className={`size-4 ${recomputeMutation.isPending ? "animate-spin" : ""}`} />
              {recomputeMutation.isPending ? "Analysing…" : "Refresh cluster influence"}
            </button>
          </div>
        }
      />

      <div
        data-v3-organizer-context-lock="edition"
        className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.025] px-3 py-2"
      >
        <span className="admin-section-label">Edition context</span>
        <AdminStatus tone="info">{editionLabel}</AdminStatus>
      </div>

      {loadingRounds ? (
        <AdminCard className="py-10 text-center text-sm text-muted-foreground">Loading rounds…</AdminCard>
      ) : roundsError ? (
        <AdminCard className="border-rose-200/15 bg-rose-200/[0.045] text-sm text-rose-100">
          {roundsError instanceof Error ? roundsError.message : "Voting rounds could not be resolved for this edition."}
        </AdminCard>
      ) : page && !page.linked ? (
        <AdminCard><AdminEmptyState icon={ShieldCheck} title="Voting edition is not linked" description="Link this Solaris edition to Televoting before result-integrity analysis can run." /></AdminCard>
      ) : !rounds.length ? (
        <AdminCard><AdminEmptyState icon={ShieldCheck} title="No televote rounds" description="Create a televoting round in this edition before result-integrity analysis can run." /></AdminCard>
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
                {rounds.map((round) => <option key={round.id} value={round.id}>{round.editionName} · {round.name} · {round.status}</option>)}
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
                  <p className="text-sm leading-relaxed text-muted-foreground">This round uses {data.round.engineVersion}. Historical results remain reproducible, but the ballot-level breadth and leave-out analysis belongs to Robust Televote v2.</p>
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
                  <AdminEmptyState icon={Activity} title="No influence snapshots yet" description="Calculate a Robust v2 result, then refresh cluster influence." />
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