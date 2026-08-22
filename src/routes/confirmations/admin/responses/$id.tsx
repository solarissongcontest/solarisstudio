import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  Copy,
  ExternalLink,
  Link2,
  LockKeyhole,
  RefreshCw,
  RotateCcw,
  Settings2,
  Shield,
  Trash2,
  Trophy,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import {
  AdminActionItem,
  AdminCard,
  AdminCardHeader,
  AdminEmptyState,
  AdminMoreMenu,
  AdminPageHeader,
  AdminSheet,
  AdminStatus,
} from "@/components/admin/AdminUI";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { confirmationsSupabase } from "@/integrations/confirmations/client";
import {
  syncConfirmationSnapshotToSolaris,
  type ConfirmationSolarisSyncResult,
} from "@/integrations/confirmations/sync.functions";

export const Route = createFileRoute("/confirmations/admin/responses/$id")({
  head: () => ({
    meta: [
      { title: "Delegation response — Solaris Studio" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ResponseDetailPage,
});

type ReviewEntry = {
  id: string;
  artist: string | null;
  song_title: string | null;
  song_url: string | null;
  review_status: string;
  review_reason: string | null;
  reviewed_at: string | null;
  removed?: boolean;
  position?: number;
  preview_start?: string | null;
  preview_end?: string | null;
  final_clip_start?: string | null;
  final_clip_end?: string | null;
  replacement_video_required?: boolean;
  replacement_video_url?: string | null;
};

type HistoryItem = {
  id: string;
  target_type: string;
  target_entry_id: string | null;
  artist: string | null;
  song_title: string | null;
  action: string;
  reason: string;
  created_at: string;
};

type ResponseDetail = {
  id: string;
  country: string;
  instagram_username: string;
  country_account: string | null;
  has_country_account: boolean;
  participating: boolean;
  selection_method: string | null;
  entry_unknown: boolean;
  nf_entries_unknown: boolean;
  reveal_date_type: string | null;
  reveal_exact_date: string | null;
  reveal_approximate_text: string | null;
  nf_date_type: string | null;
  nf_exact_date: string | null;
  nf_approximate_text: string | null;
  nf_result_date_type: string | null;
  nf_result_exact_date: string | null;
  nf_result_approximate_text: string | null;
  editing_allowed: boolean;
  locked: boolean;
  reviewed: boolean;
  admin_notes: string | null;
  edit_count: number;
  submitted_at: string;
  updated_at: string;
  round: { id: string; name: string } | null;
  edition: { id: string; name: string; edition_number: number } | null;
  internal_entry: ReviewEntry | null;
  national_final: {
    id: string;
    nf_name: string | null;
    expected_entry_count: number | null;
    winning_entry_id: string | null;
    entries: ReviewEntry[];
  } | null;
  history: HistoryItem[];
};

type TechnicalData = {
  ip_history: Array<{
    id: string;
    ip_address: string;
    first_seen_at: string;
    last_seen_at: string;
  }>;
  tokens: Array<{
    id: string;
    token_type: string;
    active: boolean;
    created_at: string;
    expires_at: string | null;
    last_used_at: string | null;
    use_count: number;
  }>;
};

type DetailState = "review" | "issue" | "ready" | "neutral";

function reviewTone(status: string) {
  if (status === "accepted") return "ready" as const;
  if (status === "declined" || status === "removed") return "attention" as const;
  return "blocked" as const;
}

function reviewLabel(entry: ReviewEntry) {
  return entry.removed ? "removed" : entry.review_status || "pending";
}

function detailState(data: ResponseDetail): DetailState {
  if (!data.participating) return "neutral";

  if (data.selection_method === "internal") {
    const entry = data.internal_entry;
    if (!entry?.song_title || data.entry_unknown) return "neutral";
    const status = reviewLabel(entry);
    if (status === "declined" || status === "removed") return "issue";
    if (status === "pending") return "review";
    if (status === "accepted") return "ready";
    return "neutral";
  }

  if (data.selection_method === "national_final") {
    const entries = (data.national_final?.entries ?? []).filter(
      (entry) => !entry.removed && entry.review_status !== "removed",
    );
    if (!entries.length || data.nf_entries_unknown) return "neutral";
    if (entries.some((entry) => entry.review_status === "declined")) return "issue";
    if (entries.some((entry) => !entry.review_status || entry.review_status === "pending")) return "review";
    return data.national_final?.winning_entry_id ? "ready" : "neutral";
  }

  return "neutral";
}

function responseGlow(state: DetailState) {
  if (state === "review") {
    return "border-rose-400/65 bg-rose-400/[0.055] shadow-[0_0_18px_rgba(251,113,133,0.28),0_0_46px_rgba(244,63,94,0.14)]";
  }
  if (state === "issue") {
    return "border-amber-300/60 bg-amber-300/[0.05] shadow-[0_0_18px_rgba(252,211,77,0.24),0_0_46px_rgba(245,158,11,0.13)]";
  }
  if (state === "ready") {
    return "border-emerald-300/50 bg-emerald-300/[0.045] shadow-[0_0_18px_rgba(110,231,183,0.22),0_0_46px_rgba(16,185,129,0.12)]";
  }
  return "";
}

function entryCardClass(entry: ReviewEntry, winner?: boolean) {
  const status = reviewLabel(entry);
  if (status === "pending") {
    return "border-rose-300/35 bg-rose-300/[0.035] shadow-[0_0_16px_rgba(251,113,133,0.12)]";
  }
  if (status === "declined") {
    return "border-amber-300/35 bg-amber-300/[0.035] shadow-[0_0_16px_rgba(252,211,77,0.10)]";
  }
  if (status === "accepted") {
    return winner
      ? "border-emerald-300/40 bg-emerald-300/[0.04] shadow-[0_0_16px_rgba(110,231,183,0.12)]"
      : "border-emerald-300/25 bg-emerald-300/[0.025]";
  }
  return "opacity-70";
}

function formatRange(start?: string | null, end?: string | null) {
  if (!start) return "Not submitted";
  return end ? `${start} – ${end}` : start;
}

function TechnicalRows({ entry }: { entry: ReviewEntry }) {
  return (
    <div className="mt-3 grid gap-2 sm:grid-cols-3">
      <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
        <p className="admin-section-label">25s preview</p>
        <p className="mt-1 text-xs font-semibold">{formatRange(entry.preview_start, entry.preview_end)}</p>
      </div>
      <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
        <p className="admin-section-label">90s final clip</p>
        <p className="mt-1 text-xs font-semibold">{formatRange(entry.final_clip_start, entry.final_clip_end)}</p>
      </div>
      <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
        <p className="admin-section-label">Replacement video</p>
        {entry.replacement_video_required ? (
          entry.replacement_video_url ? (
            <a
              href={entry.replacement_video_url}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-sky-100/80 underline"
            >
              Open video <ExternalLink className="size-3" />
            </a>
          ) : (
            <p className="mt-1 text-xs font-semibold text-amber-100">Required · URL missing</p>
          )
        ) : (
          <p className="mt-1 text-xs font-semibold">Not needed</p>
        )}
      </div>
    </div>
  );
}

function EntryReviewCard({
  entry,
  targetType,
  winner,
  onChanged,
  onWinner,
  onClearWinner,
}: {
  entry: ReviewEntry;
  targetType: "internal" | "national_final";
  winner?: boolean;
  onChanged: () => Promise<void>;
  onWinner?: (reason: string) => Promise<void>;
  onClearWinner?: (reason: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState(entry.review_reason ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const status = reviewLabel(entry);

  async function review(nextStatus: "pending" | "accepted" | "declined" | "removed") {
    if (nextStatus !== "accepted" && !reason.trim()) {
      setError("Add an organiser reason first.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const { error: rpcError } = await confirmationsSupabase.rpc("admin_review_confirmation_entry", {
        _target_type: targetType,
        _entry_id: entry.id,
        _status: nextStatus,
        _reason: reason.trim(),
      });
      if (rpcError) throw rpcError;
      toast.success(
        nextStatus === "accepted"
          ? "Entry accepted"
          : nextStatus === "declined"
            ? "Entry declined"
            : nextStatus === "removed"
              ? "Entry removed"
              : "Entry reset to pending",
      );
      setOpen(false);
      await onChanged();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Review action failed.");
    } finally {
      setBusy(false);
    }
  }

  async function chooseWinner() {
    if (!onWinner) return;
    if (!reason.trim()) {
      setError("Add an organiser reason before selecting the winner.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onWinner(reason.trim());
      toast.success("National Final winner selected");
      setOpen(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Winner could not be selected.");
    } finally {
      setBusy(false);
    }
  }

  async function clearWinner() {
    if (!onClearWinner) return;
    if (!reason.trim()) {
      setError("Add an organiser reason before clearing the winner.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onClearWinner(reason.trim());
      toast.success("National Final winner cleared");
      setOpen(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Winner could not be cleared.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <AdminCard className={`!p-4 ${entryCardClass(entry, winner)}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              {winner ? <Trophy className="size-4 shrink-0 text-emerald-200" /> : null}
              <h3 className="truncate text-sm font-bold">
                {entry.artist ?? "Unknown artist"} — {entry.song_title ?? "Unknown song"}
              </h3>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              {typeof entry.position === "number" ? <span>Running order {entry.position}</span> : null}
              {entry.song_url ? (
                <a
                  href={entry.song_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-9 items-center gap-1 text-sky-100/75 hover:text-sky-100"
                >
                  Open song <ExternalLink className="size-3.5" />
                </a>
              ) : (
                <span>No song link</span>
              )}
            </div>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <AdminStatus tone={reviewTone(status)}>{status}</AdminStatus>
            {winner ? <AdminStatus tone="ready">Winner</AdminStatus> : null}
          </div>
        </div>

        <TechnicalRows entry={entry} />

        {entry.review_reason ? (
          <p className="mt-3 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3 text-xs leading-relaxed text-muted-foreground">
            <span className="font-semibold text-foreground">Review note:</span> {entry.review_reason}
          </p>
        ) : null}

        <button type="button" onClick={() => setOpen(true)} className="admin-action-secondary mt-4 w-full">
          {status === "pending" ? "Review entry" : "Review actions"}
        </button>
      </AdminCard>

      <AdminSheet
        open={open}
        onClose={busy ? () => undefined : () => setOpen(false)}
        title={`${entry.artist ?? "Unknown artist"} — ${entry.song_title ?? "Unknown song"}`}
        description="Accept, decline, remove or reset the song. Winner changes and every negative/reset action require an organiser reason."
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.08] bg-white/[0.025] p-3">
            <span className="text-sm font-semibold">Current status</span>
            <AdminStatus tone={reviewTone(status)}>{status}</AdminStatus>
          </div>

          <TechnicalRows entry={entry} />

          <div className="space-y-2">
            <Label htmlFor={`review-reason-${entry.id}`}>Organiser reason</Label>
            <Textarea
              id={`review-reason-${entry.id}`}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Required for decline, remove, reset or winner changes."
              rows={4}
            />
          </div>

          {error ? (
            <div className="rounded-xl border border-rose-200/20 bg-rose-200/[0.05] p-3 text-sm text-rose-100">
              {error}
            </div>
          ) : null}

          <div className="space-y-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void review("accepted")}
              className="admin-action-primary w-full"
            >
              <CheckCircle2 className="size-4" /> {busy ? "Working…" : "Accept entry"}
            </button>

            {onWinner && !winner ? (
              <button
                type="button"
                disabled={busy || !reason.trim() || entry.removed}
                onClick={() => void chooseWinner()}
                className="admin-action-secondary w-full"
              >
                <Trophy className="size-4" /> Select as NF winner
              </button>
            ) : null}

            {winner && onClearWinner ? (
              <button
                type="button"
                disabled={busy || !reason.trim()}
                onClick={() => void clearWinner()}
                className="admin-action-secondary w-full"
              >
                <RotateCcw className="size-4" /> Clear NF winner
              </button>
            ) : null}

            <button
              type="button"
              disabled={busy || !reason.trim()}
              onClick={() => void review("declined")}
              className="admin-action-secondary w-full"
            >
              <XCircle className="size-4" /> Decline entry
            </button>

            {status !== "pending" ? (
              <button
                type="button"
                disabled={busy || !reason.trim()}
                onClick={() => void review("pending")}
                className="admin-action-secondary w-full"
              >
                <RotateCcw className="size-4" /> Reset to pending
              </button>
            ) : null}

            {targetType === "national_final" && !entry.removed ? (
              <button
                type="button"
                disabled={busy || !reason.trim()}
                onClick={() => void review("removed")}
                className="admin-action-danger w-full"
              >
                Remove from National Final
              </button>
            ) : null}
          </div>
        </div>
      </AdminSheet>
    </>
  );
}

function ResponseDetailPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const syncToSolaris = useServerFn(syncConfirmationSnapshotToSolaris);
  const [data, setData] = useState<ResponseDetail | null>(null);
  const [technical, setTechnical] = useState<TechnicalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [technicalError, setTechnicalError] = useState<string | null>(null);
  const [editingAllowed, setEditingAllowed] = useState(false);
  const [locked, setLocked] = useState(false);
  const [notes, setNotes] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [savingControls, setSavingControls] = useState(false);
  const [solarisSync, setSolarisSync] = useState<ConfirmationSolarisSyncResult | null>(null);
  const [solarisSyncError, setSolarisSyncError] = useState<string | null>(null);
  const [syncingSolaris, setSyncingSolaris] = useState(false);
  const [linkType, setLinkType] = useState<"reusable" | "one_time">("reusable");
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);
  const [creatingLink, setCreatingLink] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const syncSnapshot = useCallback(async (detail: ResponseDetail) => {
    setSyncingSolaris(true);
    setSolarisSyncError(null);
    try {
      const result = await syncToSolaris({ data: { snapshot: detail } });
      setSolarisSync(result);
      if (!result.ok) setSolarisSyncError(result.message ?? "Solaris sync needs attention.");
      return result;
    } catch (caught) {
      setSolarisSync(null);
      const message = caught instanceof Error ? caught.message : "Could not sync this response to Solaris.";
      setSolarisSyncError(message);
      throw caught;
    } finally {
      setSyncingSolaris(false);
    }
  }, [syncToSolaris]);

  const loadTechnical = useCallback(async () => {
    setTechnicalError(null);
    const { data: result, error: rpcError } = await confirmationsSupabase.rpc("admin_confirmation_technical", {
      _submission_id: id,
    });
    if (rpcError) {
      setTechnicalError(rpcError.message);
      return;
    }
    setTechnical(result as unknown as TechnicalData);
  }, [id]);

  const load = useCallback(async () => {
    setError(null);
    const { data: sessionData } = await confirmationsSupabase.auth.getSession();
    if (!sessionData.session) {
      await navigate({ to: "/confirmations/admin/sign-in" });
      return;
    }

    const { data: result, error: rpcError } = await confirmationsSupabase.rpc("admin_confirmation_response", {
      _submission_id: id,
    });

    if (rpcError) {
      setError(rpcError.message);
      setLoading(false);
      return;
    }

    const detail = result as unknown as ResponseDetail;
    setData(detail);
    setEditingAllowed(detail.editing_allowed);
    setLocked(detail.locked);
    setNotes(detail.admin_notes ?? "");
    setLoading(false);

    await loadTechnical();

    try {
      await syncSnapshot(detail);
    } catch {
      // The review screen stays usable even if the canonical sync is temporarily unavailable.
    }
  }, [id, loadTechnical, navigate, syncSnapshot]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveControls() {
    if (!data) return;
    setSavingControls(true);
    setError(null);
    try {
      const { error: rpcError } = await confirmationsSupabase.rpc("admin_update_confirmation_controls", {
        _submission_id: data.id,
        _editing_allowed: editingAllowed,
        _locked: locked,
        _admin_notes: notes,
      });
      if (rpcError) throw rpcError;
      toast.success("Response settings saved");
      setSettingsOpen(false);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save response settings.");
    } finally {
      setSavingControls(false);
    }
  }

  async function setWinner(entry: ReviewEntry, reason: string) {
    if (!data?.national_final) return;
    const { error: rpcError } = await confirmationsSupabase.rpc("admin_set_confirmation_winner", {
      _national_final_id: data.national_final.id,
      _entry_id: entry.id,
      _reason: reason,
    });
    if (rpcError) throw rpcError;
    await load();
  }

  async function clearWinner(reason: string) {
    if (!data?.national_final) return;
    const { error: rpcError } = await confirmationsSupabase.rpc("admin_clear_confirmation_winner", {
      _national_final_id: data.national_final.id,
      _reason: reason,
    });
    if (rpcError) throw rpcError;
    await load();
  }

  async function manualSync() {
    if (!data) return;
    try {
      const result = await syncSnapshot(data);
      if (result.ok) toast.success("Synced with Solaris Studio");
      else toast.error(result.message ?? "Solaris sync needs attention");
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Could not sync with Solaris Studio");
    }
  }

  async function copyValue(value: string, label: string) {
    if (!value.trim()) {
      toast.error("There is nothing to copy.");
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copied`);
    } catch {
      toast.error("Could not copy to the clipboard.");
    }
  }

  async function createEditLink() {
    if (!data) return;
    setCreatingLink(true);
    try {
      const { data: result, error: rpcError } = await confirmationsSupabase.rpc(
        "admin_confirmation_create_edit_token",
        {
          _submission_id: data.id,
          _token_type: linkType,
          _expires_in_hours: null,
        },
      );
      if (rpcError) throw rpcError;
      const token = (result as { token?: string } | null)?.token;
      if (!token) throw new Error("The edit token was not returned.");
      const url = `${window.location.origin}/confirmations/edit/${token}`;
      setGeneratedLink(url);
      await navigator.clipboard.writeText(url);
      toast.success("Edit link generated and copied");
      await loadTechnical();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Could not create the edit link.");
    } finally {
      setCreatingLink(false);
    }
  }

  async function revokeToken(tokenId: string) {
    const { error: rpcError } = await confirmationsSupabase.rpc("admin_confirmation_revoke_edit_token", {
      _token_id: tokenId,
    });
    if (rpcError) {
      toast.error(rpcError.message);
      return;
    }
    if (generatedLink) setGeneratedLink(null);
    toast.success("Edit link revoked");
    await loadTechnical();
  }

  async function deleteResponse() {
    if (!data || deleting) return;
    if (!window.confirm(`Delete ${data.country}'s confirmation permanently? This cannot be undone.`)) return;

    setDeleting(true);
    try {
      const { error: rpcError } = await confirmationsSupabase.rpc("admin_confirmation_delete_response", {
        _submission_id: data.id,
      });
      if (rpcError) throw rpcError;
      toast.success("Confirmation deleted");
      await navigate({ to: "/confirmations/admin/responses" });
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Could not delete the response.");
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <div className="admin-page pb-5">
        <AdminCard className="py-10 text-center text-sm text-muted-foreground">Loading response…</AdminCard>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="admin-page pb-5">
        <AdminPageHeader
          eyebrow="Delegations"
          title="Response unavailable"
          actions={
            <Link to="/confirmations/admin/responses" className="admin-action-secondary">
              <ArrowLeft className="size-4" /> Responses
            </Link>
          }
        />
        <AdminCard>
          <AdminEmptyState title="Response not found" description={error ?? "This response could not be loaded."} />
        </AdminCard>
      </div>
    );
  }

  const activeNfEntries = (data.national_final?.entries ?? []).filter(
    (entry) => !entry.removed && entry.review_status !== "removed",
  );
  const entryCount = data.internal_entry ? 1 : activeNfEntries.length;
  const acceptedCount = [data.internal_entry, ...activeNfEntries].filter(
    (entry): entry is ReviewEntry => Boolean(entry && !entry.removed && entry.review_status === "accepted"),
  ).length;
  const state = detailState(data);
  const copyArtists = activeNfEntries.map((entry) => entry.artist ?? "Unknown artist").join("\n");
  const copySongs = activeNfEntries.map((entry) => entry.song_title ?? "Unknown song").join("\n");
  const copyArtistSongs = activeNfEntries
    .map((entry) => `${entry.artist ?? "Unknown artist"} – ${entry.song_title ?? "Unknown song"}`)
    .join("\n");
  const activeTokens = technical?.tokens.filter((token) => token.active) ?? [];

  return (
    <div className="admin-page pb-5">
      <AdminPageHeader
        eyebrow={`${data.edition ? `SSC ${data.edition.edition_number}` : "Solaris Song Contest"} · ${data.round?.name ?? "Confirmation"}`}
        title={data.country}
        description={`@${data.instagram_username.replace(/^@/, "")} · submitted ${new Date(data.submitted_at).toLocaleString()}`}
        actions={
          <>
            <Link to="/confirmations/admin/responses" className="admin-action-secondary">
              <ArrowLeft className="size-4" /> Responses
            </Link>
            <AdminMoreMenu
              label="Response actions"
              title={`${data.country} actions`}
              description="Response controls and Solaris integration."
            >
              <div className="space-y-1">
                <AdminActionItem
                  icon={Settings2}
                  title="Response settings"
                  description="Editing access, lock state and private organiser notes."
                  onClick={() => setSettingsOpen(true)}
                />
                <AdminActionItem
                  icon={RefreshCw}
                  title="Sync with Solaris Studio"
                  description="Refresh participation and official entry details from Solaris."
                  disabled={syncingSolaris}
                  onClick={() => void manualSync()}
                  trailing={
                    <AdminStatus tone={solarisSync?.ok ? "ready" : solarisSyncError ? "attention" : "neutral"}>
                      {syncingSolaris ? "Syncing" : solarisSync?.ok ? "Linked" : "Check"}
                    </AdminStatus>
                  }
                />
              </div>
            </AdminMoreMenu>
          </>
        }
      />

      {error ? (
        <AdminCard className="mb-4 border-rose-200/20 bg-rose-200/[0.045] text-sm text-rose-100">
          {error}
        </AdminCard>
      ) : null}

      <div className="space-y-4">
        <AdminCard strong className={responseGlow(state)}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="admin-section-label">Submission</p>
              <h2 className="mt-1 text-xl font-bold tracking-[-.025em]">
                {data.participating ? "Participating" : "Not participating"}
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {data.selection_method
                  ? data.selection_method === "national_final"
                    ? data.national_final?.nf_name || "National Final"
                    : "Internal selection"
                  : "Selection method not provided"}
              </p>
            </div>
            <AdminStatus tone={state === "ready" ? "ready" : state === "issue" ? "attention" : state === "review" ? "blocked" : "neutral"}>
              {state === "ready" ? "Ready" : state === "issue" ? "Needs fixing" : state === "review" ? "Needs review" : "Waiting"}
            </AdminStatus>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-3">
              <p className="text-[11px] font-semibold text-muted-foreground">Entries</p>
              <p className="mt-1 text-2xl font-bold">{entryCount}</p>
            </div>
            <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-3">
              <p className="text-[11px] font-semibold text-muted-foreground">Accepted</p>
              <p className="mt-1 text-2xl font-bold">{acceptedCount}</p>
            </div>
            <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-3">
              <p className="text-[11px] font-semibold text-muted-foreground">Edits</p>
              <p className="mt-1 text-2xl font-bold">{data.edit_count}</p>
            </div>
            <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-3">
              <p className="text-[11px] font-semibold text-muted-foreground">Country account</p>
              <p className="mt-1 truncate text-sm font-bold">{data.country_account || (data.has_country_account ? "Provided" : "None")}</p>
            </div>
          </div>
        </AdminCard>

        {data.internal_entry ? (
          <section>
            <div className="mb-2 flex items-end justify-between gap-3 px-1">
              <div>
                <p className="admin-section-label">Entry review</p>
                <h2 className="mt-1 text-base font-bold">Internal selection</h2>
              </div>
              <AdminStatus tone={reviewTone(reviewLabel(data.internal_entry))}>
                {reviewLabel(data.internal_entry)}
              </AdminStatus>
            </div>
            <EntryReviewCard entry={data.internal_entry} targetType="internal" onChanged={load} />
          </section>
        ) : null}

        {data.national_final ? (
          <AdminCard>
            <AdminCardHeader
              eyebrow="Entry review"
              title={data.national_final.nf_name || "National Final"}
              description={`${activeNfEntries.length} active ${activeNfEntries.length === 1 ? "entry" : "entries"}${data.national_final.winning_entry_id ? " · winner selected" : " · winner not selected"}`}
              action={
                data.national_final.winning_entry_id ? (
                  <AdminStatus tone="ready">Winner set</AdminStatus>
                ) : activeNfEntries.length && activeNfEntries.every((entry) => entry.review_status === "accepted") ? (
                  <AdminStatus tone="neutral">Waiting for winner</AdminStatus>
                ) : (
                  <AdminStatus tone="attention">Review in progress</AdminStatus>
                )
              }
            />

            {activeNfEntries.length ? (
              <div className="mb-4 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
                <p className="admin-section-label">Copy National Final entries</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  <button type="button" onClick={() => void copyValue(copyArtists, "Artists")} className="admin-action-secondary">
                    <Copy className="size-4" /> Artists
                  </button>
                  <button type="button" onClick={() => void copyValue(copySongs, "Songs")} className="admin-action-secondary">
                    <Copy className="size-4" /> Songs
                  </button>
                  <button type="button" onClick={() => void copyValue(copyArtistSongs, "Artist – song list")} className="admin-action-secondary">
                    <Copy className="size-4" /> Artist – song
                  </button>
                </div>
              </div>
            ) : null}

            <div className="space-y-3">
              {data.national_final.entries.map((entry) => (
                <EntryReviewCard
                  key={entry.id}
                  entry={entry}
                  targetType="national_final"
                  winner={data.national_final?.winning_entry_id === entry.id}
                  onChanged={load}
                  onWinner={(reason) => setWinner(entry, reason)}
                  onClearWinner={data.national_final?.winning_entry_id === entry.id ? clearWinner : undefined}
                />
              ))}
            </div>
          </AdminCard>
        ) : null}

        <AdminCard>
          <AdminCardHeader
            eyebrow="Edit access"
            title="Private participant edit link"
            description="Generate a reusable or one-time link for the delegation. Creating a new link revokes the previous active link."
          />
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setLinkType("reusable")}
              className={linkType === "reusable" ? "admin-action-primary" : "admin-action-secondary"}
            >
              Reusable
            </button>
            <button
              type="button"
              onClick={() => setLinkType("one_time")}
              className={linkType === "one_time" ? "admin-action-primary" : "admin-action-secondary"}
            >
              One-time
            </button>
          </div>
          <button
            type="button"
            disabled={creatingLink}
            onClick={() => void createEditLink()}
            className="admin-action-primary mt-3 w-full"
          >
            <Link2 className="size-4" /> {creatingLink ? "Generating…" : "Generate edit link"}
          </button>

          {generatedLink ? (
            <div className="mt-3 rounded-xl border border-sky-200/15 bg-sky-200/[0.035] p-3">
              <p className="break-all text-xs text-muted-foreground">{generatedLink}</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button type="button" onClick={() => void copyValue(generatedLink, "Edit link")} className="admin-action-secondary">
                  <Copy className="size-4" /> Copy
                </button>
                <button type="button" onClick={() => window.open(generatedLink, "_blank", "noopener,noreferrer")} className="admin-action-secondary">
                  <ExternalLink className="size-4" /> Open
                </button>
              </div>
            </div>
          ) : null}

          {activeTokens.length ? (
            <div className="mt-4 space-y-2 border-t border-white/[0.07] pt-4">
              <p className="admin-section-label">Active link</p>
              {activeTokens.map((token) => (
                <div key={token.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
                  <div className="min-w-0 text-xs">
                    <p className="font-semibold capitalize">{token.token_type.replaceAll("_", " ")}</p>
                    <p className="mt-1 text-muted-foreground">Used {token.use_count} {token.use_count === 1 ? "time" : "times"}</p>
                  </div>
                  <button type="button" onClick={() => void revokeToken(token.id)} className="admin-action-secondary !min-h-9 !px-3 text-xs">
                    Revoke
                  </button>
                </div>
              ))}
            </div>
          ) : null}
        </AdminCard>

        <AdminCard>
          <AdminCardHeader
            eyebrow="Technical"
            title="Submission information"
            description="Organizer-only technical history from the original Confirmations system."
            action={<Shield className="size-4 text-muted-foreground" />}
          />
          {technicalError ? (
            <p className="text-sm text-amber-100">{technicalError}</p>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
                  <p className="admin-section-label">Known IPs</p>
                  <p className="mt-1 text-xl font-bold">{technical?.ip_history.length ?? 0}</p>
                </div>
                <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
                  <p className="admin-section-label">Edits made</p>
                  <p className="mt-1 text-xl font-bold">{data.edit_count}</p>
                </div>
              </div>

              {technical?.ip_history.length ? (
                <div className="rounded-xl border border-white/[0.07] bg-white/[0.02]">
                  {technical.ip_history.map((item) => (
                    <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.06] p-3 text-xs last:border-0">
                      <span className="font-mono">{item.ip_address}</span>
                      <span className="text-muted-foreground">Last seen {new Date(item.last_seen_at).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No stored IP history for this response.</p>
              )}
            </div>
          )}
        </AdminCard>

        <AdminCard>
          <AdminCardHeader
            eyebrow="Audit"
            title="Review history"
            description="A chronological record of organiser decisions for this response."
          />
          {data.history.length ? (
            <div>
              {data.history.map((item) => (
                <div key={item.id} className="admin-list-row items-start">
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">
                      {item.artist ? `${item.artist} — ${item.song_title ?? ""}` : "Entry"}
                    </span>
                    <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{item.reason}</span>
                    <span className="mt-1 block text-[11px] text-muted-foreground/70">
                      {new Date(item.created_at).toLocaleString()}
                    </span>
                  </span>
                  <AdminStatus tone={reviewTone(item.action)}>{item.action.replaceAll("_", " ")}</AdminStatus>
                </div>
              ))}
            </div>
          ) : (
            <AdminEmptyState
              title="No review decisions yet"
              description="Entry decisions will appear here automatically as the response is reviewed."
            />
          )}
        </AdminCard>

        {solarisSyncError ? (
          <AdminCard className="border-amber-200/15 bg-amber-200/[0.04]">
            <div className="flex items-start gap-3">
              <RefreshCw className="mt-0.5 size-4 shrink-0 text-amber-200" />
              <div>
                <p className="text-sm font-semibold">Solaris sync needs attention</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{solarisSyncError}</p>
              </div>
            </div>
          </AdminCard>
        ) : null}

        <AdminCard className="border-rose-300/15 bg-rose-300/[0.025]">
          <AdminCardHeader
            eyebrow="Danger zone"
            title="Delete response"
            description="Permanently delete this confirmation and its related data. This cannot be undone."
          />
          <button
            type="button"
            disabled={deleting}
            onClick={() => void deleteResponse()}
            className="admin-action-danger w-full"
          >
            <Trash2 className="size-4" /> {deleting ? "Deleting…" : "Delete response permanently"}
          </button>
        </AdminCard>
      </div>

      <AdminSheet
        open={settingsOpen}
        onClose={savingControls ? () => undefined : () => setSettingsOpen(false)}
        title="Response settings"
        description="These controls affect delegation access."
      >
        <div className="space-y-4">
          <label className="flex min-h-14 items-center justify-between gap-3 rounded-xl border border-white/[0.08] bg-white/[0.025] p-3">
            <span>
              <span className="block text-sm font-semibold">Allow editing</span>
              <span className="mt-1 block text-xs text-muted-foreground">The delegation can update this response.</span>
            </span>
            <Switch checked={editingAllowed} onCheckedChange={setEditingAllowed} />
          </label>

          <label className="flex min-h-14 items-center justify-between gap-3 rounded-xl border border-white/[0.08] bg-white/[0.025] p-3">
            <span>
              <span className="block text-sm font-semibold">Lock response</span>
              <span className="mt-1 block text-xs text-muted-foreground">Blocks delegation changes until unlocked.</span>
            </span>
            <Switch checked={locked} onCheckedChange={setLocked} />
          </label>

          <div className="space-y-2">
            <Label htmlFor="admin-notes">Private organiser notes</Label>
            <Textarea
              id="admin-notes"
              rows={6}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Notes visible only to organisers…"
            />
          </div>

          <div className="admin-sticky-actions grid grid-cols-[auto_1fr] gap-2">
            <button
              type="button"
              disabled={savingControls}
              onClick={() => setSettingsOpen(false)}
              className="admin-action-secondary"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={savingControls}
              onClick={() => void saveControls()}
              className="admin-action-primary"
            >
              <LockKeyhole className="size-4" /> {savingControls ? "Saving…" : "Save settings"}
            </button>
          </div>
        </div>
      </AdminSheet>
    </div>
  );
}
