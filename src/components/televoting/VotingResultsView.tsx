import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Calculator,
  CheckCircle2,
  ExternalLink,
  LockKeyhole,
  RefreshCw,
  Send,
  Settings2,
  ShieldCheck,
  Trophy,
} from "lucide-react";
import { toast } from "sonner";

import {
  AdminActionItem,
  AdminCard,
  AdminCardHeader,
  AdminConfirmSheet,
  AdminEmptyState,
  AdminMoreMenu,
  AdminPageHeader,
  AdminSheet,
  AdminStatus,
} from "@/components/admin/AdminUI";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getMergedTelevotingAdmin } from "@/integrations/televoting/admin-auth.functions";
import {
  checkMergedPublicationReadiness,
  getMergedTelevoteConversion,
  recalculateMergedConversion,
  setMergedResultsStatus,
  updateMergedConversionConfig,
} from "@/integrations/televoting/conversion.functions";
import { getMergedTelevotingRounds } from "@/integrations/televoting/rounds.functions";

export function VotingResultsView() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const getAdmin = useServerFn(getMergedTelevotingAdmin);
  const getRounds = useServerFn(getMergedTelevotingRounds);
  const getConversion = useServerFn(getMergedTelevoteConversion);
  const updateConfig = useServerFn(updateMergedConversionConfig);
  const recalculate = useServerFn(recalculateMergedConversion);
  const checkReadiness = useServerFn(checkMergedPublicationReadiness);
  const setStatus = useServerFn(setMergedResultsStatus);

  const [roundId, setRoundId] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [totalPoints, setTotalPoints] = useState("");
  const [exponent, setExponent] = useState("");
  const [advanced, setAdvanced] = useState(false);
  const [broadcastMode, setBroadcastMode] = useState<"original" | "converted" | "combined">("converted");
  const [readiness, setReadiness] = useState<string[] | null>(null);
  const [publishOpen, setPublishOpen] = useState(false);
  const [protectedRecalcOpen, setProtectedRecalcOpen] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);

  const { data: admin, isLoading: adminLoading } = useQuery({
    queryKey: ["merged-televoting-admin"],
    queryFn: () => getAdmin(),
  });

  useEffect(() => {
    if (!adminLoading && !admin) void navigate({ to: "/televoting/admin/sign-in" });
  }, [admin, adminLoading, navigate]);

  const { data: editions = [], isLoading: roundsLoading } = useQuery({
    queryKey: ["merged-televoting-rounds"],
    queryFn: () => getRounds(),
    enabled: Boolean(admin),
  });

  const allRounds = useMemo(
    () => editions.flatMap((edition) => edition.rounds.map((round) => ({ ...round, editionName: edition.name }))),
    [editions],
  );

  const effectiveRoundId = roundId || allRounds.find((round) => round.status === "closed")?.id || allRounds[0]?.id || "";

  const { data, isLoading, error } = useQuery({
    queryKey: ["merged-televoting-conversion", effectiveRoundId],
    queryFn: () => getConversion({ data: { roundId: effectiveRoundId } }),
    enabled: Boolean(admin && effectiveRoundId),
  });

  useEffect(() => {
    if (!data?.round) return;
    setTotalPoints(String(data.round.total_points_to_distribute ?? 0));
    setExponent(String(data.round.rank_exponent ?? 1.33));
    setAdvanced(Boolean(data.round.public_advanced_transparency));
    setBroadcastMode(data.round.broadcast_display_mode ?? "converted");
    setReadiness(null);
    setPublishOpen(false);
  }, [data?.round, effectiveRoundId]);

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["merged-televoting-conversion", effectiveRoundId] }),
      queryClient.invalidateQueries({ queryKey: ["merged-televoting-published-results"] }),
      queryClient.invalidateQueries({ queryKey: ["merged-televoting-admin-overview"] }),
    ]);
  };

  const saveMutation = useMutation({
    mutationFn: () =>
      updateConfig({
        data: {
          roundId: effectiveRoundId,
          totalPoints: Number(totalPoints),
          rankExponent: Number(exponent),
          advancedTransparency: advanced,
          broadcastMode,
        },
      }),
    onSuccess: async (result) => {
      setSettingsOpen(false);
      toast.success(result.outdated ? "Settings saved · result needs recalculation" : "Result settings saved");
      await invalidate();
    },
    onError: (caught) => toast.error(caught instanceof Error ? caught.message : "Settings could not be saved"),
  });

  const recalcMutation = useMutation({
    mutationFn: (confirmProtected: boolean) => recalculate({ data: { roundId: effectiveRoundId, confirm: confirmProtected } }),
    onSuccess: async (result) => {
      setProtectedRecalcOpen(false);
      toast.success(`Calculation v${result.version} stored · ${result.distributedTotal}/${result.totalPoints} points distributed`);
      await invalidate();
    },
    onError: (caught) => toast.error(caught instanceof Error ? caught.message : "Calculation failed"),
  });

  async function runReadiness() {
    try {
      const result = await checkReadiness({ data: { roundId: effectiveRoundId } });
      setReadiness(result.problems);
      if (!result.problems.length) toast.success("Publication checks passed");
      return result.problems;
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Readiness check failed");
      return null;
    }
  }

  async function preparePublish() {
    const problems = await runReadiness();
    if (problems && problems.length === 0) setPublishOpen(true);
  }

  async function changeStatus(status: "calculated" | "locked" | "published") {
    setStatusBusy(true);
    try {
      await setStatus({ data: { roundId: effectiveRoundId, status } });
      toast.success(status === "locked" ? "Official televote locked" : status === "published" ? "Televote result published" : "Result returned to calculated state");
      setPublishOpen(false);
      await invalidate();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Result status could not be changed");
    } finally {
      setStatusBusy(false);
    }
  }

  const storedRows = (data?.stored ?? []) as Array<{
    country_code: string;
    original_votes: number;
    original_rank: number;
    final_points: number;
  }>;

  const sortedRows = useMemo(
    () => [...storedRows].sort((a, b) => Number(b.final_points) - Number(a.final_points) || Number(a.original_rank) - Number(b.original_rank)),
    [storedRows],
  );

  return (
    <div className="admin-page mx-auto max-w-5xl pb-5">
      <AdminPageHeader
        eyebrow="Voting"
        title="Televote result"
        description="One guided path from closed voting to a published official result. Conversion details remain available without dominating the workflow."
        actions={
          <AdminMoreMenu label="Result actions" title="Result tools" description="Configuration, recalculation and public preview.">
            <div className="divide-y divide-white/[0.07]">
              <AdminActionItem icon={Settings2} title="Conversion settings" description="Point pool, rank exponent, public transparency and broadcast display." onClick={() => setSettingsOpen(true)} />
              <AdminActionItem icon={RefreshCw} title="Recalculate result" description="Re-run the stored conversion using current entries and settings." onClick={() => {
                const protectedResult = data?.round.results_status === "locked" || data?.round.results_status === "published";
                if (protectedResult) setProtectedRecalcOpen(true);
                else recalcMutation.mutate(false);
              }} disabled={!data || recalcMutation.isPending} />
              <Link to="/televoting/results" className="admin-action-row">
                <span className="admin-action-row-icon"><ExternalLink className="size-4" /></span>
                <span className="min-w-0 flex-1 text-left"><span className="block text-sm font-semibold">Open public results</span><span className="mt-1 block text-xs text-muted-foreground">Preview the visitor-facing results route.</span></span>
              </Link>
            </div>
          </AdminMoreMenu>
        }
      />

      {adminLoading || roundsLoading ? (
        <AdminCard className="py-10 text-center text-sm text-muted-foreground">Loading result workspace…</AdminCard>
      ) : !allRounds.length ? (
        <AdminCard><AdminEmptyState icon={Calculator} title="No voting round yet" description="Create and run a voting round before calculating a televote result." action={<Link to="/televoting/admin/rounds" className="admin-action-primary">Go to voting rounds</Link>} /></AdminCard>
      ) : (
        <div className="space-y-4">
          <AdminCard className="!p-3">
            <label className="block">
              <span className="admin-section-label">Round</span>
              <select id="result-round" value={effectiveRoundId} onChange={(event) => setRoundId(event.target.value)} className="mt-2 min-h-11 w-full rounded-xl border border-white/[0.1] bg-[#07111f] px-3 text-sm font-semibold text-foreground outline-none focus:border-sky-200/30">
                {allRounds.map((round) => <option key={round.id} value={round.id}>{round.editionName} · {round.name} · {round.status}</option>)}
              </select>
            </label>
          </AdminCard>

          {isLoading ? (
            <AdminCard className="py-10 text-center text-sm text-muted-foreground">Loading result data…</AdminCard>
          ) : error || !data ? (
            <AdminCard className="border-rose-200/15 bg-rose-200/[0.045] text-sm text-rose-100">{error instanceof Error ? error.message : "Result data could not be loaded."}</AdminCard>
          ) : (
            <>
              <AdminCard strong>
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="admin-section-label">Official workflow</p>
                    <h2 className="mt-1 truncate text-lg font-bold tracking-[-.02em]">{data.round.name}</h2>
                    <p className="mt-1 text-xs text-muted-foreground">Calculation v{data.round.calculation_version} · {data.participants.length} entries</p>
                  </div>
                  <AdminStatus tone={resultTone(data.round.results_status)}>{resultLabel(data.round.results_status)}</AdminStatus>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2">
                  <Step number="1" label="Vote" done={data.round.status === "closed" || data.round.results_status !== "draft"} active={data.round.status !== "closed" && data.round.results_status === "draft"} />
                  <Step number="2" label="Calculate" done={data.round.calculation_version > 0 && !data.round.results_outdated} active={data.round.status === "closed" && (data.round.calculation_version <= 0 || data.round.results_outdated)} />
                  <Step number="3" label="Publish" done={data.round.results_status === "published"} active={data.round.results_status === "locked"} />
                </div>

                {data.round.results_outdated ? (
                  <div className="mt-4 rounded-xl border border-amber-200/15 bg-amber-200/[0.05] p-3 text-sm leading-relaxed text-amber-100">The line-up or conversion settings changed after the stored calculation. Recalculate before locking or publishing.</div>
                ) : null}

                <div className="mt-4">{primaryAction(data)}</div>
              </AdminCard>

              {readiness !== null ? (
                <AdminCard className={readiness.length ? "border-amber-200/15 bg-amber-200/[0.035]" : "border-emerald-200/15 bg-emerald-200/[0.03]"}>
                  <AdminCardHeader eyebrow="Publication check" title={readiness.length ? `${readiness.length} issue${readiness.length === 1 ? "" : "s"} to fix` : "Ready to publish"} action={<AdminStatus tone={readiness.length ? "attention" : "ready"}>{readiness.length ? "Blocked" : "Passed"}</AdminStatus>} />
                  {readiness.length ? <ul className="space-y-2 text-sm text-amber-100/90">{readiness.map((problem) => <li key={problem} className="rounded-xl border border-amber-200/10 bg-black/10 px-3 py-2">{problem}</li>)}</ul> : <p className="text-sm text-muted-foreground">Voting, line-up and converted totals passed the publication gate.</p>}
                </AdminCard>
              ) : null}

              <AdminCard className="!p-0 overflow-hidden">
                <div className="border-b border-white/[0.07] p-4 sm:p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2"><Trophy className="size-4 text-sky-100" /><h2 className="truncate text-sm font-bold">Stored result</h2></div>
                    <span className="numeric shrink-0 text-xs text-muted-foreground">{storedRows.reduce((sum, row) => sum + Number(row.final_points ?? 0), 0)} / {data.round.total_points_to_distribute} pts</span>
                  </div>
                </div>
                {sortedRows.length ? (
                  <div className="divide-y divide-white/[0.06]">
                    {sortedRows.map((row, index) => (
                      <div key={row.country_code} className="grid grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-2 px-4 py-3 text-sm sm:px-5">
                        <span className="numeric text-center text-xs text-muted-foreground">{index + 1}</span>
                        <div className="min-w-0"><p className="truncate font-semibold">{row.country_code}</p><p className="mt-0.5 text-[11px] text-muted-foreground">{row.original_votes} raw votes · raw rank #{row.original_rank}</p></div>
                        <span className="numeric text-right font-bold text-sky-100">{row.final_points} pts</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-4"><AdminEmptyState icon={Calculator} title="No stored calculation" description="Close voting and calculate the result when the ballot set is final." /></div>
                )}
              </AdminCard>
            </>
          )}
        </div>
      )}

      <AdminSheet open={settingsOpen} onClose={() => !saveMutation.isPending && setSettingsOpen(false)} title="Conversion settings" description="Advanced calculation and display controls. Changing them can make an existing stored result outdated.">
        <div className="space-y-4">
          <div className="space-y-2"><Label>Total points</Label><Input inputMode="numeric" value={totalPoints} onChange={(event) => setTotalPoints(event.target.value)} className="min-h-11" /></div>
          <div className="space-y-2"><Label>Rank exponent</Label><Input inputMode="decimal" value={exponent} onChange={(event) => setExponent(event.target.value)} className="min-h-11" /></div>
          <div className="space-y-2"><Label>Broadcast display</Label><select value={broadcastMode} onChange={(event) => setBroadcastMode(event.target.value as typeof broadcastMode)} className="min-h-11 w-full rounded-xl border border-white/[0.1] bg-[#07111f] px-3 text-sm"><option value="converted">Converted points</option><option value="original">Original votes</option><option value="combined">Both</option></select></div>
          <label className="flex min-h-14 items-center justify-between gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3 text-sm"><span><span className="block font-semibold">Advanced public transparency</span><span className="mt-1 block text-xs text-muted-foreground">Show conversion intermediates after publication.</span></span><input type="checkbox" checked={advanced} onChange={(event) => setAdvanced(event.target.checked)} className="size-5 shrink-0" /></label>
          <div className="admin-sticky-actions grid grid-cols-[auto_minmax(0,1fr)] gap-2"><button type="button" disabled={saveMutation.isPending} onClick={() => setSettingsOpen(false)} className="admin-action-secondary">Cancel</button><button type="button" disabled={saveMutation.isPending} onClick={() => saveMutation.mutate()} className="admin-action-primary w-full">{saveMutation.isPending ? "Saving…" : "Save settings"}</button></div>
        </div>
      </AdminSheet>

      <AdminConfirmSheet open={protectedRecalcOpen} onClose={() => setProtectedRecalcOpen(false)} onConfirm={() => recalcMutation.mutate(true)} title="Replace protected calculation?" description="This result is locked or published. Recalculation will replace the saved conversion using the current line-up and settings. Official SSC results are not changed by this tool." confirmLabel="Recalculate result" danger busy={recalcMutation.isPending} />

      <AdminConfirmSheet open={publishOpen} onClose={() => setPublishOpen(false)} onConfirm={() => changeStatus("published")} title="Publish televote result?" description="The stored converted televote will become available on the public Televoting Results page. The publication readiness check has passed for this round." confirmLabel="Publish result" busy={statusBusy} />
    </div>
  );

  function primaryAction(current: NonNullable<typeof data>) {
    if (current.round.status !== "closed" && current.round.results_status !== "published") {
      return <Link to="/televoting/admin/rounds" className="admin-action-primary w-full"><LockKeyhole className="size-4" /> Close voting first</Link>;
    }
    if (current.round.calculation_version <= 0 || current.round.results_outdated || !storedRows.length) {
      return <button type="button" disabled={recalcMutation.isPending} onClick={() => recalcMutation.mutate(false)} className="admin-action-primary w-full"><Calculator className="size-4" /> {recalcMutation.isPending ? "Calculating…" : current.round.results_outdated ? "Recalculate official result" : "Calculate official result"}</button>;
    }
    if (current.round.results_status === "calculated" || current.round.results_status === "draft") {
      return <button type="button" disabled={statusBusy} onClick={() => void changeStatus("locked")} className="admin-action-primary w-full"><LockKeyhole className="size-4" /> {statusBusy ? "Working…" : "Lock official result"}</button>;
    }
    if (current.round.results_status === "locked") {
      return <button type="button" disabled={statusBusy} onClick={() => void preparePublish()} className="admin-action-primary w-full"><ShieldCheck className="size-4" /> Check & publish</button>;
    }
    return <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-200/15 bg-emerald-200/[0.04] p-3"><span className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-100"><CheckCircle2 className="size-4" /> Published</span><Link to="/televoting/results" className="admin-action-secondary"><Send className="size-4" /> View public</Link></div>;
  }
}

function Step({ number, label, done, active }: { number: string; label: string; done: boolean; active: boolean }) {
  return <div className={done ? "rounded-xl border border-emerald-200/12 bg-emerald-200/[0.035] p-2.5 text-center" : active ? "rounded-xl border border-sky-200/15 bg-sky-200/[0.055] p-2.5 text-center" : "rounded-xl border border-white/[0.06] bg-white/[0.015] p-2.5 text-center"}><span className="numeric text-[10px] text-muted-foreground">{done ? "✓" : number}</span><p className="mt-1 text-xs font-semibold">{label}</p></div>;
}

function resultTone(status: string): "ready" | "attention" | "info" | "neutral" {
  if (status === "published") return "ready";
  if (status === "locked") return "info";
  if (status === "calculated") return "attention";
  return "neutral";
}

function resultLabel(status: string) {
  if (status === "published") return "Published";
  if (status === "locked") return "Locked";
  if (status === "calculated") return "Calculated";
  return status.replaceAll("_", " ");
}
