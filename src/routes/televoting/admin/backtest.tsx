import { useMutation } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Activity, FlaskConical, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { AdminDataView, type AdminDataColumn } from "@/components/admin/AdminDataView";
import {
  AdminCard,
  AdminCardHeader,
  AdminEmptyState,
  AdminPageHeader,
  AdminStatus,
} from "@/components/admin/AdminUI";
import { runHistoricalTelevoteBacktest } from "@/integrations/televoting/backtest.functions";

type AttackRow = {
  attackers: number;
  target: string;
  legacyRankBefore: number;
  legacyRankAfter: number;
  legacyPointGain: number;
  robustRankBefore: number;
  robustRankAfter: number;
  robustPointGain: number;
};

const attackColumns: readonly AdminDataColumn<AttackRow>[] = [
  {
    key: "attackers",
    header: "Attackers",
    mobileLabel: "Attack",
    primary: true,
    render: (attack) => `${attack.attackers} attacker${attack.attackers === 1 ? "" : "s"}`,
  },
  { key: "target", header: "Target", render: (attack) => attack.target },
  {
    key: "legacy-rank",
    header: "Legacy rank",
    render: (attack) => <>#{attack.legacyRankBefore} → #{attack.legacyRankAfter}</>,
  },
  {
    key: "legacy-gain",
    header: "Legacy gain",
    align: "right",
    render: (attack) => <>+{attack.legacyPointGain}</>,
  },
  {
    key: "robust-rank",
    header: "Robust rank",
    render: (attack) => <>#{attack.robustRankBefore} → #{attack.robustRankAfter}</>,
  },
  {
    key: "robust-gain",
    header: "Robust gain",
    align: "right",
    render: (attack) => <>+{attack.robustPointGain}</>,
  },
];

export const Route = createFileRoute("/televoting/admin/backtest")({
  component: TelevoteBacktestPage,
});

function pct(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function TelevoteBacktestPage() {
  const runBacktest = useServerFn(runHistoricalTelevoteBacktest);
  const mutation = useMutation({
    mutationFn: () => runBacktest({ data: { limit: 40 } }),
    onError: (caught) => toast.error(caught instanceof Error ? caught.message : "Backtest failed"),
  });
  const data = mutation.data;

  return (
    <div className="admin-page mx-auto max-w-6xl pb-8">
      <AdminPageHeader
        eyebrow="Televote calibration"
        title="Historical backtest"
        description="Compare legacy rank-weighted v1 with Robust Televote v2 on stored SSC ballots, then stress both engines with coordinated 1-, 2- and 3-voter maximum-score attacks. No official result is changed."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link to="/televoting/admin/result-integrity" className="admin-action-secondary"><ShieldCheck className="size-4" /> Result integrity</Link>
            <button type="button" className="admin-action-primary" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
              <FlaskConical className="size-4" /> {mutation.isPending ? "Running…" : "Run historical backtest"}
            </button>
          </div>
        }
      />

      {!data ? (
        <AdminCard>
          <AdminEmptyState
            icon={FlaskConical}
            title="Backtest has not been run"
            description="Run it to compare both calculation engines on up to 40 recent stored televote rounds. This is read-only simulation."
          />
        </AdminCard>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Metric label="Rounds analysed" value={data.summary.roundsAnalysed.toFixed(0)} />
            <Metric label="Winner changes" value={data.summary.winnerChanges.toFixed(0)} />
            <Metric label="Legacy max voter move" value={data.summary.averageLegacyMaxVoterMovement.toFixed(1)} />
            <Metric label="Robust max voter move" value={data.summary.averageRobustMaxVoterMovement.toFixed(1)} />
          </div>

          <AdminCard>
            <AdminCardHeader
              eyebrow="Distribution"
              title="Average winner share"
              action={<AdminStatus tone={data.summary.averageRobustTopShare <= data.summary.averageLegacyTopShare ? "ready" : "info"}>Read-only comparison</AdminStatus>}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4"><p className="text-xs text-muted-foreground">Legacy v1</p><p className="numeric mt-2 text-2xl font-black">{pct(data.summary.averageLegacyTopShare)}</p></div>
              <div className="rounded-xl border border-sky-200/15 bg-sky-200/[0.04] p-4"><p className="text-xs text-muted-foreground">Robust v2</p><p className="numeric mt-2 text-2xl font-black text-sky-100">{pct(data.summary.averageRobustTopShare)}</p></div>
            </div>
          </AdminCard>

          {data.rounds.map((round) => (
            <AdminCard key={round.roundId}>
              <AdminCardHeader
                eyebrow={`${round.voters} voters · ${round.participants} entries`}
                title={round.roundName}
                action={<AdminStatus tone={round.winnerChangedBetweenEngines ? "attention" : "ready"}>{round.winnerChangedBetweenEngines ? "Winner differs" : "Same winner"}</AdminStatus>}
              />
              <div className="grid gap-3 md:grid-cols-2">
                <EngineCard title="Legacy v1" summary={round.legacy} />
                <EngineCard title="Robust v2" summary={round.robust} />
              </div>
              <div className="mt-4 rounded-xl border border-white/[0.07] bg-black/10 p-4">
                <div className="flex items-center gap-2"><Activity className="size-4 text-amber-200" /><p className="text-sm font-semibold">Coordinated attack simulation</p></div>
                <AdminDataView
                  className="mt-3"
                  rows={round.attacks}
                  rowKey={(attack) => String(attack.attackers)}
                  ariaLabel={`${round.roundName} coordinated attack simulation`}
                  columns={attackColumns}
                />
              </div>
            </AdminCard>
          ))}
        </div>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <AdminCard className="!p-4"><p className="numeric text-2xl font-black">{value}</p><p className="mt-1 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{label}</p></AdminCard>;
}

function EngineCard({ title, summary }: { title: string; summary: { winner: string | null; winnerPoints: number; winnerMargin: number; topShare: number; maxSingleVoterPointMovement: number; winnerSensitiveVoters: number; zeroPointEntries: number } }) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
      <p className="text-xs font-bold uppercase tracking-[0.1em] text-muted-foreground">{title}</p>
      <p className="mt-2 text-xl font-black">{summary.winner ?? "–"} · {summary.winnerPoints} pts</p>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">Winner margin {summary.winnerMargin} · winner share {pct(summary.topShare)} · max one-voter movement {summary.maxSingleVoterPointMovement} pts · {summary.winnerSensitiveVoters} winner-sensitive voter{summary.winnerSensitiveVoters === 1 ? "" : "s"} · {summary.zeroPointEntries} zero-point entries</p>
    </div>
  );
}
