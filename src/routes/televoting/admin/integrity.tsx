import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  CheckCircle2,
  Eye,
  Globe,
  RotateCcw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Wifi,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getMergedTelevotingAdmin } from "@/integrations/televoting/admin-auth.functions";
import {
  listMergedModerationSubmissions,
  restoreMergedSubmission,
  setMergedSubmissionStatus,
  softDeleteMergedSubmission,
  updateMergedSubmissionNote,
} from "@/integrations/televoting/moderation.functions";
import type { MergedModerationSubmission } from "@/integrations/televoting/moderation.server";
import { getMergedTelevotingRounds } from "@/integrations/televoting/rounds.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/televoting/admin/integrity")({
  head: () => ({ meta: [{ title: "Televoting Integrity — Solaris Studio" }, { name: "robots", content: "noindex" }] }),
  component: IntegrityPage,
});

type FilterStatus = "all" | "active" | "suspicious" | "verified" | "deleted";

const STATUS_STYLE: Record<string, string> = {
  active: "border-white/10 bg-white/[0.04] text-white/55",
  suspicious: "border-amber-300/25 bg-amber-300/10 text-amber-100",
  verified: "border-emerald-300/25 bg-emerald-300/10 text-emerald-100",
  deleted: "border-red-300/25 bg-red-300/10 text-red-100",
};

function IntegrityPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const getAdmin = useServerFn(getMergedTelevotingAdmin);
  const getRounds = useServerFn(getMergedTelevotingRounds);
  const listVotes = useServerFn(listMergedModerationSubmissions);
  const setStatus = useServerFn(setMergedSubmissionStatus);
  const deleteVote = useServerFn(softDeleteMergedSubmission);
  const restoreVote = useServerFn(restoreMergedSubmission);
  const saveNote = useServerFn(updateMergedSubmissionNote);

  const [roundId, setRoundId] = useState("all");
  const [status, setStatusFilter] = useState<FilterStatus>("all");
  const [query, setQuery] = useState("");
  const [detail, setDetail] = useState<MergedModerationSubmission | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<MergedModerationSubmission | null>(null);
  const [deleteReason, setDeleteReason] = useState("");

  const { data: admin, isLoading: adminLoading } = useQuery({
    queryKey: ["merged-televoting-admin"],
    queryFn: () => getAdmin(),
  });

  useEffect(() => {
    if (!adminLoading && !admin) void navigate({ to: "/televoting/admin/sign-in" });
  }, [admin, adminLoading, navigate]);

  const { data: editions = [] } = useQuery({
    queryKey: ["merged-televoting-rounds"],
    queryFn: () => getRounds(),
    enabled: Boolean(admin),
  });
  const rounds = editions.flatMap((edition) => edition.rounds.map((round) => ({ ...round, editionName: edition.name })));

  const { data: submissions = [], isLoading, error } = useQuery({
    queryKey: ["merged-televoting-moderation", roundId],
    queryFn: () => listVotes({ data: { roundId: roundId === "all" ? null : roundId } }),
    enabled: Boolean(admin),
    refetchInterval: 15_000,
  });

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return submissions.filter((submission) => {
      if (status !== "all" && submission.status !== status) return false;
      if (!term) return true;
      const haystack = [
        submission.username,
        submission.username_normalized,
        submission.country_code,
        submission.country_name,
        submission.ip_country ?? "",
        submission.round_name,
        submission.moderator_note ?? "",
        ...submission.entries.flatMap((entry) => [entry.target_country_code, entry.target_name, entry.target_code]),
      ].join(" ").toLowerCase();
      return haystack.includes(term);
    });
  }, [query, status, submissions]);

  const counts = useMemo(() => ({
    all: submissions.length,
    active: submissions.filter((row) => row.status === "active").length,
    suspicious: submissions.filter((row) => row.status === "suspicious").length,
    verified: submissions.filter((row) => row.status === "verified").length,
    deleted: submissions.filter((row) => row.status === "deleted").length,
  }), [submissions]);

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["merged-televoting-moderation"] }),
      queryClient.invalidateQueries({ queryKey: ["merged-televoting-analytics"] }),
      queryClient.invalidateQueries({ queryKey: ["merged-televoting-admin-overview"] }),
    ]);
  };

  const statusMutation = useMutation({
    mutationFn: (value: { id: string; status: "active" | "suspicious" | "verified" }) => setStatus({ data: value }),
    onSuccess: async () => { toast.success("Vote status updated"); await refresh(); },
    onError: (caught) => toast.error(caught instanceof Error ? caught.message : "Status could not be updated"),
  });

  const noteMutation = useMutation({
    mutationFn: (value: { id: string; note: string }) => saveNote({ data: value }),
    onSuccess: async () => { toast.success("Moderator note saved"); await refresh(); },
    onError: (caught) => toast.error(caught instanceof Error ? caught.message : "Note could not be saved"),
  });

  const deleteMutation = useMutation({
    mutationFn: (value: { id: string; reason: string }) => deleteVote({ data: value }),
    onSuccess: async () => {
      toast.success("Vote removed from official results");
      setDeleteTarget(null);
      setDeleteReason("");
      setDetail(null);
      await refresh();
    },
    onError: (caught) => toast.error(caught instanceof Error ? caught.message : "Vote could not be deleted"),
  });

  async function restore(submission: MergedModerationSubmission) {
    try {
      await restoreVote({ data: { id: submission.id, reason: "Restored from merged integrity workspace" } });
      toast.success("Vote restored");
      await refresh();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Vote could not be restored");
    }
  }

  return (
    <div className="mx-auto max-w-7xl py-4 sm:py-8">
      <div className="mb-5"><Link to="/televoting/admin" className="text-xs text-muted-foreground hover:text-foreground">← Televoting control centre</Link></div>

      <header className="mb-8">
        <p className="text-[10px] uppercase tracking-[0.22em] text-amber-100/70">Integrity & moderation</p>
        <h1 className="font-display mt-2 text-5xl uppercase leading-none sm:text-6xl">Vote integrity</h1>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground">Review supporting evidence without redefining voter identity. The selected Solaris country remains the permanent delegation identity; usernames, IP geography, VPN flags and risk scores are supporting signals only.</p>
      </header>

      <section className="glass mb-4 grid gap-3 p-4 lg:grid-cols-[220px_1fr_auto] lg:items-end">
        <div>
          <label className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Round</label>
          <select value={roundId} onChange={(event) => setRoundId(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-white/12 bg-black/20 px-3 text-sm">
            <option value="all">All rounds</option>
            {rounds.map((round) => <option key={round.id} value={round.id}>{round.editionName} · {round.name}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Search</label>
          <div className="relative mt-2"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Country, username, target, note…" className="pl-9" /></div>
        </div>
        <div className="flex max-w-full gap-1 overflow-x-auto rounded-2xl border border-white/8 bg-black/10 p-1.5">
          {(["all", "active", "suspicious", "verified", "deleted"] as FilterStatus[]).map((item) => <button key={item} type="button" onClick={() => setStatusFilter(item)} className={cn("shrink-0 rounded-xl px-3 py-2 text-xs capitalize transition", status === item ? "bg-sky-200/12 text-sky-100" : "text-muted-foreground hover:text-foreground")}>{item} {counts[item]}</button>)}
        </div>
      </section>

      {adminLoading || isLoading ? (
        <section className="glass-strong p-8 text-center text-sm text-muted-foreground">Loading moderation evidence…</section>
      ) : error ? (
        <section className="glass-strong border-destructive/30 p-6 text-sm text-destructive">{error instanceof Error ? error.message : "Moderation data could not be loaded."}</section>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
          <section className="space-y-2">
            {filtered.map((submission) => (
              <article key={submission.id} className={cn("glass p-4 transition", detail?.id === submission.id && "ring-1 ring-sky-200/30")}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-xl border border-white/10 bg-white/[0.04]">{submission.country_flag_url ? <img src={submission.country_flag_url} alt="" className="h-full w-full object-cover" /> : <span>{submission.country_flag || "✦"}</span>}</div>
                    <div className="min-w-0"><p className="truncate font-medium">{submission.country_name}</p><p className="mt-0.5 truncate text-xs text-muted-foreground">{submission.country_code} · {submission.username} · {submission.round_name}</p></div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={cn("rounded-full border px-2.5 py-1 text-[9px] uppercase tracking-[0.14em]", STATUS_STYLE[submission.status])}>{submission.status}</span>
                    <span className={cn("rounded-full border px-2.5 py-1 text-[9px] tabular-nums", submission.risk_score >= 65 ? "border-red-300/25 bg-red-300/10 text-red-100" : submission.risk_score >= 40 ? "border-amber-300/25 bg-amber-300/10 text-amber-100" : "border-white/10 text-muted-foreground")}>Risk {submission.risk_score}</span>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-2 text-[10px] text-muted-foreground"><span>{new Date(submission.created_at).toLocaleString()}</span>{submission.ip_country ? <span className="inline-flex items-center gap-1"><Globe className="size-3" /> IP {submission.ip_country}</span> : null}{submission.is_vpn ? <span className="inline-flex items-center gap-1 text-amber-100"><Wifi className="size-3" /> VPN/proxy flag</span> : null}{submission.edited_at ? <span>Edited</span> : null}</div>

                <div className="mt-3 flex flex-wrap gap-1.5">
                  {submission.entries.slice(0, 6).map((entry) => <span key={entry.target_country_code} className="rounded-lg border border-white/8 bg-black/10 px-2 py-1 text-[10px] text-white/55">{entry.target_code} <strong className="text-white/80">{entry.points}</strong></span>)}
                  {submission.entries.length > 6 ? <span className="px-2 py-1 text-[10px] text-muted-foreground">+{submission.entries.length - 6} more</span> : null}
                </div>

                <div className="mt-3 flex justify-end"><Button size="sm" variant="outline" onClick={() => { setDetail(submission); setNoteDraft(submission.moderator_note ?? ""); }}><Eye className="size-3.5" /> Review</Button></div>
              </article>
            ))}
            {!filtered.length ? <div className="glass-strong p-8 text-center text-sm text-muted-foreground">No votes match this filter.</div> : null}
          </section>

          <aside className="xl:sticky xl:top-24 xl:self-start">
            {detail ? (
              <section className="glass-strong p-5">
                <div className="flex items-start justify-between gap-3"><div><p className="text-[9px] uppercase tracking-[0.16em] text-sky-100/60">Ballot review</p><h2 className="mt-2 text-xl font-medium">{detail.country_name}</h2><p className="mt-1 text-xs text-muted-foreground">{detail.username} · {detail.round_name}</p></div><span className={cn("rounded-full border px-2.5 py-1 text-[9px] uppercase tracking-[0.14em]", STATUS_STYLE[detail.status])}>{detail.status}</span></div>

                <div className="mt-4 grid grid-cols-3 gap-2"><Evidence label="Risk" value={detail.risk_score} warn={detail.risk_score >= 65} /><Evidence label="IP country" value={detail.ip_country ?? "—"} /><Evidence label="VPN" value={detail.is_vpn ? "Flagged" : "No"} warn={detail.is_vpn} /></div>

                <div className="mt-4 space-y-1.5">
                  {detail.entries.map((entry) => <div key={entry.target_country_code} className="flex items-center justify-between gap-3 rounded-xl border border-white/8 bg-black/10 px-3 py-2"><div className="flex min-w-0 items-center gap-2"><div className="grid size-7 shrink-0 place-items-center overflow-hidden rounded-lg border border-white/8">{entry.target_image ? <img src={entry.target_image} alt="" className="h-full w-full object-cover" /> : <span className="text-xs">{entry.target_flag || "✦"}</span>}</div><span className="truncate text-sm">{entry.target_name}</span></div><span className="font-medium tabular-nums text-primary">{entry.points}</span></div>)}
                </div>

                <div className="mt-5"><label className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Moderator note</label><textarea value={noteDraft} onChange={(event) => setNoteDraft(event.target.value)} className="mt-2 min-h-24 w-full rounded-xl border border-white/12 bg-black/20 px-3 py-2 text-sm" maxLength={2000} /><Button size="sm" className="mt-2" disabled={noteMutation.isPending} onClick={() => noteMutation.mutate({ id: detail.id, note: noteDraft })}>Save note</Button></div>

                <div className="mt-5 border-t border-white/8 pt-4"><p className="text-[9px] uppercase tracking-[0.15em] text-muted-foreground">Moderation status</p><div className="mt-2 flex flex-wrap gap-2"><Button size="sm" variant={detail.status === "active" ? "default" : "outline"} onClick={() => statusMutation.mutate({ id: detail.id, status: "active" })}>Active</Button><Button size="sm" variant={detail.status === "suspicious" ? "default" : "outline"} onClick={() => statusMutation.mutate({ id: detail.id, status: "suspicious" })}><ShieldAlert className="size-3.5" /> Suspicious</Button><Button size="sm" variant={detail.status === "verified" ? "default" : "outline"} onClick={() => statusMutation.mutate({ id: detail.id, status: "verified" })}><ShieldCheck className="size-3.5" /> Verified</Button></div></div>

                <div className="mt-4 flex flex-wrap gap-2">{detail.status === "deleted" ? <Button size="sm" variant="outline" onClick={() => void restore(detail)}><RotateCcw className="size-3.5" /> Restore vote</Button> : <Button size="sm" variant="outline" className="text-red-100" onClick={() => { setDeleteTarget(detail); setDeleteReason(""); }}><Trash2 className="size-3.5" /> Delete vote</Button>}</div>
              </section>
            ) : (
              <section className="glass-strong p-8 text-center"><CheckCircle2 className="mx-auto size-7 text-sky-100/65" /><h2 className="mt-3 text-lg font-medium">Select a ballot</h2><p className="mt-2 text-sm text-muted-foreground">Open a vote to review its evidence, complete score breakdown and moderation history fields.</p></section>
            )}
          </aside>
        </div>
      )}

      {deleteTarget ? <div className="fixed inset-0 z-[120] grid place-items-center bg-black/70 p-4 backdrop-blur-sm"><section className="glass-strong w-full max-w-md p-6"><div className="flex items-center gap-3 text-red-100"><Trash2 className="size-5" /><h2 className="text-lg font-medium">Delete this vote?</h2></div><p className="mt-3 text-sm leading-relaxed text-muted-foreground">The ballot remains in integrity history but is removed from official results and normal analytics. A reason is required and will be audit-logged.</p><textarea autoFocus value={deleteReason} onChange={(event) => setDeleteReason(event.target.value)} placeholder="Reason for deletion…" className="mt-4 min-h-28 w-full rounded-xl border border-white/12 bg-black/20 px-3 py-2 text-sm" /><div className="mt-4 flex justify-end gap-2"><Button variant="ghost" onClick={() => setDeleteTarget(null)}>Cancel</Button><Button disabled={!deleteReason.trim() || deleteMutation.isPending} onClick={() => deleteMutation.mutate({ id: deleteTarget.id, reason: deleteReason })}><Trash2 className="size-4" /> Delete vote</Button></div></section></div> : null}
    </div>
  );
}

function Evidence({ label, value, warn = false }: { label: string; value: string | number; warn?: boolean }) {
  return <div className={cn("rounded-xl border p-3", warn ? "border-amber-300/20 bg-amber-300/8" : "border-white/8 bg-black/10")}><p className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground">{label}</p><p className={cn("mt-1 truncate text-sm font-medium", warn && "text-amber-100")}>{value}</p></div>;
}
