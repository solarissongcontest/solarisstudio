import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Calculator, CheckCircle2, LockKeyhole, RefreshCw, Send, ShieldCheck, Trophy } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
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
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/televoting/admin/results")({
  head: () => ({ meta: [{ title: "Televoting Results — Solaris Studio" }, { name: "robots", content: "noindex" }] }),
  component: TelevotingAdminResultsPage,
});

function TelevotingAdminResultsPage() {
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
  const [totalPoints, setTotalPoints] = useState("");
  const [exponent, setExponent] = useState("");
  const [advanced, setAdvanced] = useState(false);
  const [broadcastMode, setBroadcastMode] = useState<"original" | "converted" | "combined">("converted");
  const [readiness, setReadiness] = useState<string[]>([]);

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
    setReadiness([]);
  }, [data?.round]);

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["merged-televoting-conversion", effectiveRoundId] }),
      queryClient.invalidateQueries({ queryKey: ["merged-televoting-published-results"] }),
      queryClient.invalidateQueries({ queryKey: ["merged-televoting-admin-overview"] }),
    ]);
  };

  const saveMutation = useMutation({
    mutationFn: () => updateConfig({
      data: {
        roundId: effectiveRoundId,
        totalPoints: Number(totalPoints),
        rankExponent: Number(exponent),
        advancedTransparency: advanced,
        broadcastMode,
      },
    }),
    onSuccess: async (result) => {
      toast.success(result.outdated ? "Settings saved · recalculation required" : "Settings saved");
      await invalidate();
    },
    onError: (caught) => toast.error(caught instanceof Error ? caught.message : "Settings could not be saved"),
  });

  const recalcMutation = useMutation({
    mutationFn: async () => {
      const protectedResult = data?.round.results_status === "locked" || data?.round.results_status === "published";
      if (protectedResult && !confirm("This result is locked or published. Recalculate and replace the stored conversion?")) {
        throw new Error("Recalculation cancelled");
      }
      return recalculate({ data: { roundId: effectiveRoundId, confirm: protectedResult } });
    },
    onSuccess: async (result) => {
      toast.success(`Calculation v${result.version} stored · ${result.distributedTotal}/${result.totalPoints} points distributed`);
      await invalidate();
    },
    onError: (caught) => {
      const message = caught instanceof Error ? caught.message : "Calculation failed";
      if (!/cancelled/i.test(message)) toast.error(message);
    },
  });

  async function readinessCheck() {
    try {
      const result = await checkReadiness({ data: { roundId: effectiveRoundId } });
      setReadiness(result.problems);
      if (!result.problems.length) toast.success("Publication checks passed");
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Readiness check failed");
    }
  }

  async function changeStatus(status: "calculated" | "locked" | "published") {
    if (status === "published" && !confirm("Publish this televote result to the public Results page?")) return;
    try {
      await setStatus({ data: { roundId: effectiveRoundId, status } });
      toast.success(`Result ${status}`);
      await invalidate();
      if (status === "published") await readinessCheck();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Result status could not be changed");
    }
  }

  const storedRows = (data?.stored ?? []) as Array<{
    country_code: string;
    original_votes: number;
    original_rank: number;
    final_points: number;
  }>;

  return (
    <div className="mx-auto max-w-6xl py-4 sm:py-8">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <Link to="/televoting/admin" className="text-xs text-muted-foreground hover:text-foreground">← Televoting control centre</Link>
        <Link to="/televoting/results" className="text-xs text-muted-foreground hover:text-foreground">Public results →</Link>
      </div>

      <header className="mb-8">
        <p className="text-[10px] uppercase tracking-[0.22em] text-sky-100/65">Official conversion</p>
        <h1 className="font-display mt-2 text-5xl uppercase leading-none sm:text-6xl">Televote results</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">Calculate, lock and publish the official converted televote using the same stored engine and integrity gates as the existing Televoting site.</p>
      </header>

      {adminLoading || roundsLoading ? (
        <section className="glass-strong p-8 text-center text-sm text-muted-foreground">Loading result workspace…</section>
      ) : !allRounds.length ? (
        <section className="glass-strong p-8 text-center text-sm text-muted-foreground">Create a Televoting round first.</section>
      ) : (
        <div className="space-y-5">
          <section className="glass p-4">
            <Label htmlFor="result-round">Round</Label>
            <select id="result-round" value={effectiveRoundId} onChange={(event) => setRoundId(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-white/12 bg-black/20 px-3 text-sm">
              {allRounds.map((round) => <option key={round.id} value={round.id}>{round.editionName} · {round.name} · {round.status}</option>)}
            </select>
          </section>

          {isLoading ? (
            <section className="glass-strong p-8 text-center text-sm text-muted-foreground">Loading conversion data…</section>
          ) : error || !data ? (
            <section className="glass-strong border-destructive/30 p-6 text-sm text-destructive">{error instanceof Error ? error.message : "Conversion data could not be loaded."}</section>
          ) : (
            <>
              <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <StatusTile label="Round" value={data.round.status} />
                <StatusTile label="Result" value={data.round.results_status} emphasis={data.round.results_status === "published"} />
                <StatusTile label="Calculation" value={`v${data.round.calculation_version}`} />
                <StatusTile label="Entries" value={String(data.participants.length)} />
              </section>

              {data.round.results_outdated ? <div className="rounded-xl border border-amber-300/20 bg-amber-300/8 p-4 text-sm text-amber-100">The line-up or conversion settings changed after the stored calculation. Recalculate before publishing.</div> : null}

              <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
                <section className="glass-strong h-fit p-5">
                  <div className="flex items-center gap-2"><Calculator className="size-4 text-sky-100" /><h2 className="font-medium">Conversion settings</h2></div>
                  <div className="mt-5 space-y-4">
                    <div className="space-y-1.5"><Label>Total points T</Label><Input inputMode="numeric" value={totalPoints} onChange={(event) => setTotalPoints(event.target.value)} /></div>
                    <div className="space-y-1.5"><Label>Rank exponent</Label><Input inputMode="decimal" value={exponent} onChange={(event) => setExponent(event.target.value)} /></div>
                    <div className="space-y-1.5"><Label>Broadcast mode</Label><select value={broadcastMode} onChange={(event) => setBroadcastMode(event.target.value as typeof broadcastMode)} className="h-10 w-full rounded-xl border border-white/12 bg-black/20 px-3 text-sm"><option value="converted">Converted</option><option value="original">Original</option><option value="combined">Combined</option></select></div>
                    <label className="flex items-center justify-between gap-3 rounded-xl border border-white/8 bg-black/10 p-3 text-sm"><span><span className="block font-medium">Advanced public transparency</span><span className="mt-0.5 block text-xs text-muted-foreground">Expose conversion intermediates after publication.</span></span><input type="checkbox" checked={advanced} onChange={(event) => setAdvanced(event.target.checked)} /></label>
                    <Button className="w-full" disabled={saveMutation.isPending} onClick={() => saveMutation.mutate()}>Save settings</Button>
                    <Button className="w-full" variant="outline" disabled={recalcMutation.isPending} onClick={() => recalcMutation.mutate()}><RefreshCw className={cn("size-4", recalcMutation.isPending && "animate-spin")} /> Recalculate official result</Button>
                  </div>
                </section>

                <section className="space-y-4">
                  <div className="glass-strong p-5">
                    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-medium">Publication gate</h2><p className="mt-1 text-sm text-muted-foreground">Voting must be closed, the line-up must match the stored calculation, and converted totals must remain exact.</p></div><Button size="sm" variant="outline" onClick={() => void readinessCheck()}><ShieldCheck className="size-4" /> Check readiness</Button></div>
                    {readiness.length ? <ul className="mt-4 space-y-1.5 text-sm text-amber-100">{readiness.map((problem) => <li key={problem}>• {problem}</li>)}</ul> : readiness.length === 0 && data.round.calculation_version > 0 ? <p className="mt-4 inline-flex items-center gap-2 text-sm text-emerald-100"><CheckCircle2 className="size-4" /> No cached publication problems. Run the check before publishing.</p> : null}
                    <div className="mt-4 flex flex-wrap gap-2"><Button size="sm" variant={data.round.results_status === "calculated" ? "default" : "outline"} onClick={() => void changeStatus("calculated")}><Calculator className="size-3.5" /> Calculated</Button><Button size="sm" variant={data.round.results_status === "locked" ? "default" : "outline"} onClick={() => void changeStatus("locked")}><LockKeyhole className="size-3.5" /> Lock</Button><Button size="sm" variant={data.round.results_status === "published" ? "default" : "outline"} onClick={() => void changeStatus("published")}><Send className="size-3.5" /> Publish</Button></div>
                  </div>

                  <div className="glass-strong overflow-hidden">
                    <div className="flex items-center justify-between border-b border-white/8 p-4"><div className="flex items-center gap-2"><Trophy className="size-4 text-sky-100" /><h2 className="font-medium">Stored result</h2></div><span className="text-xs text-muted-foreground">{storedRows.reduce((sum, row) => sum + Number(row.final_points ?? 0), 0)} / {data.round.total_points_to_distribute} points</span></div>
                    <div className="divide-y divide-white/8">
                      {[...storedRows].sort((a, b) => Number(b.final_points) - Number(a.final_points) || Number(a.original_rank) - Number(b.original_rank)).map((row, index) => (
                        <div key={row.country_code} className="grid grid-cols-[34px_minmax(0,1fr)_86px_86px] items-center gap-2 px-4 py-3 text-sm"><span className="text-center text-xs tabular-nums text-muted-foreground">{index + 1}</span><span className="truncate font-medium">{row.country_code}</span><span className="text-right text-xs text-muted-foreground">{row.original_votes} raw</span><span className="text-right font-medium text-primary">{row.final_points} pts</span></div>
                      ))}
                      {!storedRows.length ? <div className="p-8 text-center text-sm text-muted-foreground">No stored calculation yet.</div> : null}
                    </div>
                  </div>
                </section>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function StatusTile({ label, value, emphasis = false }: { label: string; value: string; emphasis?: boolean }) {
  return <div className="glass p-4"><p className="text-[9px] uppercase tracking-[0.15em] text-muted-foreground">{label}</p><p className={cn("mt-2 truncate text-xl font-medium capitalize", emphasis && "text-emerald-100")}>{value.replaceAll("_", " ")}</p></div>;
}
