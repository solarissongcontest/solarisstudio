import { useNavigate } from "@tanstack/react-router";
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

import {
  AdminActionItem,
  AdminCard,
  AdminConfirmSheet,
  AdminEmptyState,
  AdminPageHeader,
  AdminSheet,
  AdminStatus,
} from "@/components/admin/AdminUI";
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

type FilterStatus = "all" | "suspicious" | "active" | "verified" | "deleted";

export function IntegrityReviewView() {
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
  const [excludeTarget, setExcludeTarget] = useState<MergedModerationSubmission | null>(null);
  const [excludeReason, setExcludeReason] = useState("");
  const [restoreTarget, setRestoreTarget] = useState<MergedModerationSubmission | null>(null);

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

  const rounds = useMemo(
    () => editions.flatMap((edition) => edition.rounds.map((round) => ({ ...round, editionName: edition.name }))),
    [editions],
  );

  const { data: submissions = [], isLoading, error } = useQuery({
    queryKey: ["merged-televoting-moderation", roundId],
    queryFn: () => listVotes({ data: { roundId: roundId === "all" ? null : roundId } }),
    enabled: Boolean(admin),
    refetchInterval: 15_000,
  });

  const counts = useMemo(
    () => ({
      all: submissions.length,
      active: submissions.filter((row) => row.status === "active").length,
      suspicious: submissions.filter((row) => row.status === "suspicious").length,
      verified: submissions.filter((row) => row.status === "verified").length,
      deleted: submissions.filter((row) => row.status === "deleted").length,
    }),
    [submissions],
  );

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return submissions
      .filter((submission) => {
        if (status !== "all" && submission.status !== status) return false;
        if (!term) return true;
        return [
          submission.username,
          submission.username_normalized,
          submission.country_code,
          submission.country_name,
          submission.ip_country ?? "",
          submission.round_name,
          submission.moderator_note ?? "",
          ...submission.entries.flatMap((entry) => [entry.target_country_code, entry.target_name, entry.target_code]),
        ]
          .join(" ")
          .toLowerCase()
          .includes(term);
      })
      .sort((a, b) => {
        const statusPriority = (value: string) => (value === "suspicious" ? 0 : value === "active" ? 1 : value === "verified" ? 2 : 3);
        const statusDiff = statusPriority(a.status) - statusPriority(b.status);
        if (statusDiff) return statusDiff;
        return Number(b.risk_score) - Number(a.risk_score);
      });
  }, [query, status, submissions]);

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["merged-televoting-moderation"] }),
      queryClient.invalidateQueries({ queryKey: ["merged-televoting-analytics"] }),
      queryClient.invalidateQueries({ queryKey: ["merged-televoting-admin-overview"] }),
    ]);
  };

  const statusMutation = useMutation({
    mutationFn: (value: { id: string; status: "active" | "suspicious" | "verified" }) => setStatus({ data: value }),
    onSuccess: async (_result, variables) => {
      toast.success(variables.status === "verified" ? "Ballot verified" : variables.status === "suspicious" ? "Ballot flagged for review" : "Ballot returned to active");
      await refresh();
      setDetail((current) => current ? { ...current, status: variables.status } : current);
    },
    onError: (caught) => toast.error(caught instanceof Error ? caught.message : "Ballot status could not be updated"),
  });

  const noteMutation = useMutation({
    mutationFn: (value: { id: string; note: string }) => saveNote({ data: value }),
    onSuccess: async () => {
      toast.success("Moderator note saved");
      await refresh();
      setDetail((current) => current ? { ...current, moderator_note: noteDraft } : current);
    },
    onError: (caught) => toast.error(caught instanceof Error ? caught.message : "Note could not be saved"),
  });

  const excludeMutation = useMutation({
    mutationFn: (value: { id: string; reason: string }) => deleteVote({ data: value }),
    onSuccess: async () => {
      toast.success("Ballot excluded from official results");
      setExcludeTarget(null);
      setExcludeReason("");
      setDetail(null);
      await refresh();
    },
    onError: (caught) => toast.error(caught instanceof Error ? caught.message : "Ballot could not be excluded"),
  });

  async function restore(submission: MergedModerationSubmission) {
    try {
      await restoreVote({ data: { id: submission.id, reason: "Restored from organizer integrity review" } });
      toast.success("Ballot restored to official results");
      setRestoreTarget(null);
      setDetail(null);
      await refresh();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Ballot could not be restored");
    }
  }

  function openDetail(submission: MergedModerationSubmission) {
    setDetail(submission);
    setNoteDraft(submission.moderator_note ?? "");
  }

  return (
    <div className="admin-page mx-auto max-w-6xl pb-5">
      <AdminPageHeader
        eyebrow="Voting"
        title="Integrity review"
        description="Review evidence as cases. Country identity stays authoritative; usernames, IP geography, VPN flags and risk scores are supporting signals only."
        actions={<AdminStatus tone={counts.suspicious ? "attention" : "ready"}>{counts.suspicious} flagged</AdminStatus>}
      />

      <AdminCard className="mb-4 !p-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="admin-section-label">Round</span>
            <select value={roundId} onChange={(event) => setRoundId(event.target.value)} className="mt-2 min-h-11 w-full rounded-xl border border-white/[0.1] bg-[#07111f] px-3 text-sm font-semibold outline-none focus:border-sky-200/30">
              <option value="all">All voting rounds</option>
              {rounds.map((round) => <option key={round.id} value={round.id}>{round.editionName} · {round.name}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="admin-section-label">Search</span>
            <span className="relative mt-2 block"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Country, username, target or note…" className="min-h-11 pl-9" /></span>
          </label>
        </div>
        <div className="scroll-slim mt-3 flex gap-2 overflow-x-auto pb-1">
          <FilterChip active={status === "all"} onClick={() => setStatusFilter("all")} label="All" count={counts.all} />
          <FilterChip active={status === "suspicious"} onClick={() => setStatusFilter("suspicious")} label="Needs review" count={counts.suspicious} tone="attention" />
          <FilterChip active={status === "active"} onClick={() => setStatusFilter("active")} label="Active" count={counts.active} />
          <FilterChip active={status === "verified"} onClick={() => setStatusFilter("verified")} label="Verified" count={counts.verified} />
          <FilterChip active={status === "deleted"} onClick={() => setStatusFilter("deleted")} label="Excluded" count={counts.deleted} />
        </div>
      </AdminCard>

      {adminLoading || isLoading ? (
        <AdminCard className="py-10 text-center text-sm text-muted-foreground">Loading integrity cases…</AdminCard>
      ) : error ? (
        <AdminCard className="border-rose-200/15 bg-rose-200/[0.045] text-sm text-rose-100">{error instanceof Error ? error.message : "Integrity data could not be loaded."}</AdminCard>
      ) : filtered.length ? (
        <section className="space-y-2">
          {filtered.map((submission) => (
            <button key={submission.id} type="button" onClick={() => openDetail(submission)} className="admin-card block w-full p-4 text-left transition hover:border-white/[0.12] hover:bg-white/[0.035]">
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <div className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.025]">
                    {submission.country_flag_url ? <img src={submission.country_flag_url} alt="" className="h-full w-full object-cover" /> : <span>{submission.country_flag || "✦"}</span>}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate text-sm font-bold sm:text-base">{submission.country_name}</h2>
                    <p className="mt-1 truncate text-xs text-muted-foreground">{submission.username} · {submission.round_name}</p>
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <AdminStatus tone={submissionTone(submission.status)}>{submissionLabel(submission.status)}</AdminStatus>
                  <span className={cn("numeric text-[11px] font-semibold", submission.risk_score >= 65 ? "text-rose-200" : submission.risk_score >= 40 ? "text-amber-200" : "text-muted-foreground")}>Risk {submission.risk_score}</span>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                {submission.ip_country ? <span className="inline-flex items-center gap-1"><Globe className="size-3" /> IP {submission.ip_country}</span> : null}
                {submission.is_vpn ? <span className="inline-flex items-center gap-1 text-amber-100"><Wifi className="size-3" /> VPN/proxy signal</span> : null}
                {submission.edited_at ? <span>Edited ballot</span> : null}
                <span>{submission.entries.length} scored entries</span>
              </div>
            </button>
          ))}
        </section>
      ) : (
        <AdminCard><AdminEmptyState icon={CheckCircle2} title="No cases in this view" description={status === "suspicious" ? "No ballots are currently flagged for manual review." : "Try another filter, round or search term."} /></AdminCard>
      )}

      <AdminSheet open={Boolean(detail)} onClose={() => setDetail(null)} title={detail ? `${detail.country_name} ballot` : "Ballot review"} description={detail ? `${detail.username} · ${detail.round_name}` : undefined}>
        {detail ? (
          <div className="space-y-5">
            <div className="grid grid-cols-3 gap-2">
              <Evidence label="Risk" value={detail.risk_score} warn={detail.risk_score >= 65} />
              <Evidence label="IP country" value={detail.ip_country ?? "—"} />
              <Evidence label="VPN" value={detail.is_vpn ? "Flagged" : "No"} warn={detail.is_vpn} />
            </div>

            <section>
              <p className="admin-section-label">Ballot</p>
              <div className="mt-2 space-y-1.5">
                {detail.entries.map((entry) => (
                  <div key={entry.target_country_code} className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <div className="grid size-7 shrink-0 place-items-center overflow-hidden rounded-lg border border-white/[0.07]">
                        {entry.target_image ? <img src={entry.target_image} alt="" className="h-full w-full object-cover" /> : <span className="text-xs">{entry.target_flag || "✦"}</span>}
                      </div>
                      <span className="truncate text-sm font-semibold">{entry.target_name}</span>
                    </div>
                    <span className="numeric shrink-0 font-bold text-sky-100">{entry.points}</span>
                  </div>
                ))}
              </div>
            </section>

            <section>
              <label className="admin-section-label" htmlFor="integrity-note">Moderator note</label>
              <textarea id="integrity-note" value={noteDraft} onChange={(event) => setNoteDraft(event.target.value)} className="mt-2 min-h-24 w-full rounded-xl border border-white/[0.1] bg-white/[0.02] px-3 py-2 text-sm outline-none focus:border-sky-200/25" maxLength={2000} placeholder="Record context or why a decision was made…" />
              <button type="button" disabled={noteMutation.isPending || noteDraft === (detail.moderator_note ?? "")} onClick={() => noteMutation.mutate({ id: detail.id, note: noteDraft })} className="admin-action-secondary mt-2 w-full">{noteMutation.isPending ? "Saving…" : "Save note"}</button>
            </section>

            <section className="rounded-2xl border border-white/[0.08] bg-white/[0.018] p-3">
              <div className="mb-2 flex items-center justify-between gap-3"><div><p className="text-sm font-bold">Decision</p><p className="mt-1 text-xs text-muted-foreground">Status is a moderation judgement. It does not redefine delegation identity.</p></div><AdminStatus tone={submissionTone(detail.status)}>{submissionLabel(detail.status)}</AdminStatus></div>
              <div className="divide-y divide-white/[0.07]">
                {detail.status !== "verified" ? <AdminActionItem icon={ShieldCheck} title="Verify ballot" description="Evidence reviewed; keep this ballot in the official result." disabled={statusMutation.isPending} onClick={() => statusMutation.mutate({ id: detail.id, status: "verified" })} /> : null}
                {detail.status !== "suspicious" && detail.status !== "deleted" ? <AdminActionItem icon={ShieldAlert} title="Keep under review" description="Flag the ballot as suspicious without excluding it from the result." disabled={statusMutation.isPending} onClick={() => statusMutation.mutate({ id: detail.id, status: "suspicious" })} /> : null}
                {detail.status !== "active" && detail.status !== "deleted" ? <AdminActionItem icon={Eye} title="Return to active" description="Clear the manual label without marking the ballot verified." disabled={statusMutation.isPending} onClick={() => statusMutation.mutate({ id: detail.id, status: "active" })} /> : null}
                {detail.status === "deleted" ? <AdminActionItem icon={RotateCcw} title="Restore ballot" description="Return this ballot to official results and normal analytics." onClick={() => setRestoreTarget(detail)} /> : <AdminActionItem icon={Trash2} title="Exclude from official results" description="Requires an audit reason. The ballot remains in integrity history." tone="danger" onClick={() => { setExcludeTarget(detail); setExcludeReason(""); }} />}
              </div>
            </section>
          </div>
        ) : null}
      </AdminSheet>

      <AdminSheet open={Boolean(excludeTarget)} onClose={() => !excludeMutation.isPending && setExcludeTarget(null)} title="Exclude ballot from official results" description="This is a moderation action, not a deletion from history. A reason is required and will be audit-logged.">
        <div className="space-y-4">
          <div className="rounded-xl border border-rose-200/15 bg-rose-200/[0.05] p-3 text-sm text-rose-100">{excludeTarget ? `${excludeTarget.country_name} · ${excludeTarget.round_name}` : "Selected ballot"}</div>
          <label className="block"><span className="text-xs font-semibold">Reason</span><textarea autoFocus value={excludeReason} onChange={(event) => setExcludeReason(event.target.value)} placeholder="Why should this ballot be excluded?" className="mt-2 min-h-28 w-full rounded-xl border border-white/[0.1] bg-white/[0.02] px-3 py-2 text-sm outline-none focus:border-rose-200/25" /></label>
          <div className="admin-sticky-actions grid grid-cols-[auto_minmax(0,1fr)] gap-2"><button type="button" disabled={excludeMutation.isPending} onClick={() => setExcludeTarget(null)} className="admin-action-secondary">Cancel</button><button type="button" disabled={!excludeTarget || !excludeReason.trim() || excludeMutation.isPending} onClick={() => excludeTarget && excludeMutation.mutate({ id: excludeTarget.id, reason: excludeReason.trim() })} className="admin-action-danger w-full"><Trash2 className="size-4" /> {excludeMutation.isPending ? "Excluding…" : "Exclude ballot"}</button></div>
        </div>
      </AdminSheet>

      <AdminConfirmSheet open={Boolean(restoreTarget)} onClose={() => setRestoreTarget(null)} onConfirm={() => restoreTarget ? restore(restoreTarget) : undefined} title="Restore ballot to official results?" description={restoreTarget ? `${restoreTarget.country_name}'s ballot will return to official results and normal analytics. The moderation history remains intact.` : "The ballot will return to official results."} confirmLabel="Restore ballot" />
    </div>
  );
}

function FilterChip({ active, onClick, label, count, tone = "normal" }: { active: boolean; onClick: () => void; label: string; count: number; tone?: "normal" | "attention" }) {
  return <button type="button" onClick={onClick} className={cn("inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl border px-3 text-xs font-semibold transition", active ? tone === "attention" ? "border-amber-200/20 bg-amber-200/[0.08] text-amber-100" : "border-sky-200/15 bg-sky-200/[0.08] text-sky-100" : "border-white/[0.07] bg-white/[0.02] text-muted-foreground hover:bg-white/[0.04] hover:text-foreground")}>{label}<span className="numeric text-[10px] opacity-70">{count}</span></button>;
}

function Evidence({ label, value, warn = false }: { label: string; value: string | number; warn?: boolean }) {
  return <div className={warn ? "rounded-xl border border-amber-200/15 bg-amber-200/[0.045] p-2.5" : "rounded-xl border border-white/[0.06] bg-white/[0.018] p-2.5"}><p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{label}</p><p className={warn ? "mt-1 truncate text-xs font-bold text-amber-100" : "mt-1 truncate text-xs font-bold"}>{value}</p></div>;
}

function submissionTone(status: string): "ready" | "attention" | "blocked" | "neutral" {
  if (status === "verified") return "ready";
  if (status === "suspicious") return "attention";
  if (status === "deleted") return "blocked";
  return "neutral";
}

function submissionLabel(status: string) {
  if (status === "verified") return "Verified";
  if (status === "suspicious") return "Needs review";
  if (status === "deleted") return "Excluded";
  return "Active";
}
