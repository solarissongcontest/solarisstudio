import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  LockKeyhole,
  RefreshCw,
  Settings2,
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

function reviewTone(status: string) {
  if (status === "accepted") return "ready" as const;
  if (status === "declined" || status === "removed") return "blocked" as const;
  return "attention" as const;
}

function reviewLabel(entry: ReviewEntry) {
  return entry.removed ? "removed" : entry.review_status || "pending";
}

function EntryReviewCard({
  entry,
  targetType,
  winner,
  onChanged,
  onWinner,
}: {
  entry: ReviewEntry;
  targetType: "internal" | "national_final";
  winner?: boolean;
  onChanged: () => Promise<void>;
  onWinner?: (reason: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState(entry.review_reason ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const status = reviewLabel(entry);

  async function review(nextStatus: "accepted" | "declined" | "removed") {
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
            : "Entry removed",
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

  return (
    <>
      <AdminCard className={winner ? "border-amber-200/20 bg-amber-200/[0.035] !p-4" : "!p-4"}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              {winner ? <Trophy className="size-4 shrink-0 text-amber-200" /> : null}
              <h3 className="truncate text-sm font-bold">
                {entry.artist ?? "Unknown artist"} — {entry.song_title ?? "Unknown song"}
              </h3>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
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
              {entry.preview_start ? (
                <span>Preview {entry.preview_start}{entry.preview_end ? `–${entry.preview_end}` : ""}</span>
              ) : null}
            </div>
          </div>
          <AdminStatus tone={reviewTone(status)}>{status}</AdminStatus>
        </div>

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
        description="Accept the entry or record an organiser decision. Declines, removals and winner selections require a reason."
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.08] bg-white/[0.025] p-3">
            <span className="text-sm font-semibold">Current status</span>
            <AdminStatus tone={reviewTone(status)}>{status}</AdminStatus>
          </div>

          <div className="space-y-2">
            <Label htmlFor={`review-reason-${entry.id}`}>Organiser reason</Label>
            <Textarea
              id={`review-reason-${entry.id}`}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Required for decline, remove or selecting a winner."
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
                disabled={busy || !reason.trim()}
                onClick={() => void chooseWinner()}
                className="admin-action-secondary w-full"
              >
                <Trophy className="size-4" /> Select as NF winner
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

            {targetType === "national_final" ? (
              <button
                type="button"
                disabled={busy || !reason.trim()}
                onClick={() => void review("removed")}
                className="admin-action-danger w-full"
              >
                Remove entry
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingAllowed, setEditingAllowed] = useState(false);
  const [locked, setLocked] = useState(false);
  const [notes, setNotes] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [savingControls, setSavingControls] = useState(false);
  const [solarisSync, setSolarisSync] = useState<ConfirmationSolarisSyncResult | null>(null);
  const [solarisSyncError, setSolarisSyncError] = useState<string | null>(null);
  const [syncingSolaris, setSyncingSolaris] = useState(false);

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

    try {
      await syncSnapshot(detail);
    } catch {
      // The review screen stays usable even if the canonical sync is temporarily unavailable.
    }
  }, [id, navigate, syncSnapshot]);

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

  const entryCount = data.internal_entry ? 1 : data.national_final?.entries.length ?? 0;
  const acceptedCount = [data.internal_entry, ...(data.national_final?.entries ?? [])].filter(
    (entry): entry is ReviewEntry => Boolean(entry && !entry.removed && entry.review_status === "accepted"),
  ).length;

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
              description="Access controls and technical tools that are not part of the normal review flow."
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
                  description="Refresh canonical participation and official-entry data."
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
        <AdminCard strong>
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
            <AdminStatus tone={data.participating ? "ready" : "neutral"}>
              {data.participating ? "Confirmed" : "Declined"}
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
              description={`${data.national_final.entries.length} ${data.national_final.entries.length === 1 ? "entry" : "entries"}${data.national_final.winning_entry_id ? " · winner selected" : " · winner not selected"}`}
              action={
                data.national_final.winning_entry_id ? (
                  <AdminStatus tone="ready">Winner set</AdminStatus>
                ) : (
                  <AdminStatus tone="attention">Winner needed</AdminStatus>
                )
              }
            />
            <div className="space-y-3">
              {data.national_final.entries.map((entry) => (
                <EntryReviewCard
                  key={entry.id}
                  entry={entry}
                  targetType="national_final"
                  winner={data.national_final?.winning_entry_id === entry.id}
                  onChanged={load}
                  onWinner={(reason) => setWinner(entry, reason)}
                />
              ))}
            </div>
          </AdminCard>
        ) : null}

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
                  <AdminStatus tone={reviewTone(item.action)}>{item.action}</AdminStatus>
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
      </div>

      <AdminSheet
        open={settingsOpen}
        onClose={savingControls ? () => undefined : () => setSettingsOpen(false)}
        title="Response settings"
        description="These controls affect delegation access. They are intentionally kept outside the normal entry-review workflow."
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
