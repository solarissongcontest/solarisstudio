import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  LockKeyhole,
  RefreshCw,
  Save,
  Trophy,
  XCircle,
} from "lucide-react";

import {
  AdminCard,
  AdminCardHeader,
  AdminConfirmSheet,
  AdminPageHeader,
  AdminStatus,
} from "@/components/admin/AdminUI";
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
      { title: "Delegation Review — Solaris Organizer" },
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

type PendingWinner = {
  entry: ReviewEntry;
  reason: string;
} | null;

function ResponseDetailPage() {
  const { id } = Route.useParams();
  const syncToSolaris = useServerFn(syncConfirmationSnapshotToSolaris);
  const [data, setData] = useState<ResponseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingAllowed, setEditingAllowed] = useState(false);
  const [locked, setLocked] = useState(false);
  const [notes, setNotes] = useState("");
  const [savingControls, setSavingControls] = useState(false);
  const [solarisSync, setSolarisSync] = useState<ConfirmationSolarisSyncResult | null>(null);
  const [solarisSyncError, setSolarisSyncError] = useState<string | null>(null);
  const [syncingSolaris, setSyncingSolaris] = useState(false);
  const [pendingWinner, setPendingWinner] = useState<PendingWinner>(null);
  const [winnerBusy, setWinnerBusy] = useState(false);

  const syncSnapshot = useCallback(
    async (detail: ResponseDetail) => {
      setSyncingSolaris(true);
      setSolarisSyncError(null);
      try {
        const result = await syncToSolaris({ data: { snapshot: detail } });
        setSolarisSync(result);
        if (!result.ok) {
          setSolarisSyncError(result.message ?? "Solaris sync needs attention.");
        }
      } catch (caught) {
        setSolarisSync(null);
        setSolarisSyncError(
          caught instanceof Error ? caught.message : "Could not sync this response to Solaris.",
        );
      } finally {
        setSyncingSolaris(false);
      }
    },
    [syncToSolaris],
  );

  const load = useCallback(async () => {
    setError(null);

    // UnifiedServiceAdminGate already authenticates the Solaris organizer.
    // Do not require the retired standalone Confirmations browser session here.
    const { data: result, error: rpcError } = await confirmationsSupabase.rpc(
      "admin_confirmation_response",
      { _submission_id: id },
    );

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
    await syncSnapshot(detail);
  }, [id, syncSnapshot]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveControls() {
    if (!data) return;
    setSavingControls(true);
    setError(null);

    try {
      const { error: rpcError } = await confirmationsSupabase.rpc(
        "admin_update_confirmation_controls",
        {
          _submission_id: data.id,
          _editing_allowed: editingAllowed,
          _locked: locked,
          _admin_notes: notes,
        },
      );
      if (rpcError) throw rpcError;
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save response controls.");
    } finally {
      setSavingControls(false);
    }
  }

  async function confirmWinner() {
    if (!data?.national_final || !pendingWinner) return;
    setWinnerBusy(true);
    setError(null);

    try {
      const { error: rpcError } = await confirmationsSupabase.rpc(
        "admin_set_confirmation_winner",
        {
          _national_final_id: data.national_final.id,
          _entry_id: pendingWinner.entry.id,
          _reason: pendingWinner.reason,
        },
      );
      if (rpcError) throw rpcError;
      setPendingWinner(null);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not set the National Final winner.");
    } finally {
      setWinnerBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl">
        <AdminCard>
          <p className="py-7 text-center text-sm text-muted-foreground">Loading response…</p>
        </AdminCard>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="mx-auto max-w-4xl">
        <Link to="/confirmations/admin/responses" className="admin-action-secondary mb-4">
          <ArrowLeft className="size-4" /> Responses
        </Link>
        <AdminCard>
          <div className="rounded-xl border border-rose-200/15 bg-rose-200/[0.055] p-4 text-sm text-rose-100">
            {error ?? "Response not found."}
          </div>
        </AdminCard>
      </div>
    );
  }

  const editionContext = data.edition ? `SSC ${data.edition.edition_number}` : "Solaris Song Contest";
  const selectionLabel = data.selection_method?.replaceAll("_", " ") ?? "Unknown";

  return (
    <div className="mx-auto max-w-5xl">
      <AdminPageHeader
        eyebrow={`${editionContext} · ${data.round?.name ?? "Confirmation"}`}
        title={data.country}
        description={`@${data.instagram_username.replace(/^@/, "")} · submitted ${new Date(data.submitted_at).toLocaleString()}`}
        actions={
          <Link to="/confirmations/admin/responses" className="admin-action-secondary">
            <ArrowLeft className="size-4" /> Queue
          </Link>
        }
      />

      {error ? (
        <div className="mb-4 rounded-xl border border-rose-200/15 bg-rose-200/[0.055] p-3 text-sm text-rose-100">
          {error}
        </div>
      ) : null}

      <AdminCard strong className="mb-4">
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="admin-section-label">Submission</p>
            <h2 className="mt-1 text-lg font-bold capitalize tracking-[-.02em]">{selectionLabel}</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {data.participating ? "Participating" : "Not participating"} · {data.edit_count} {data.edit_count === 1 ? "edit" : "edits"}
            </p>
          </div>
          <AdminStatus tone={data.reviewed ? "ready" : "attention"}>
            {data.reviewed ? "Reviewed" : "Needs review"}
          </AdminStatus>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 rounded-xl border border-white/[0.06] bg-white/[0.018] p-3 sm:grid-cols-4">
          <Fact label="Country account" value={data.country_account || (data.has_country_account ? "Provided" : "None")} />
          <Fact label="Editing" value={data.editing_allowed ? "Allowed" : "Closed"} />
          <Fact label="Lock" value={data.locked ? "Locked" : "Open"} />
          <Fact label="Updated" value={new Date(data.updated_at).toLocaleDateString()} />
        </div>
      </AdminCard>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_21rem]">
        <div className="min-w-0 space-y-4">
          {data.internal_entry ? (
            <AdminCard>
              <AdminCardHeader
                eyebrow="Entry review"
                title="Internal selection"
                description="Accept the entry when it is valid. Declines require a reason and ask for confirmation."
              />
              <EntryReviewCard
                entry={data.internal_entry}
                targetType="internal"
                onChanged={load}
              />
            </AdminCard>
          ) : null}

          {data.national_final ? (
            <AdminCard>
              <AdminCardHeader
                eyebrow="National Final"
                title={data.national_final.nf_name || "National Final"}
                description={`${data.national_final.entries.length} submitted ${data.national_final.entries.length === 1 ? "entry" : "entries"}. Review each entry, then select the winner when the result is known.`}
              />
              <div className="space-y-3">
                {data.national_final.entries.map((entry) => (
                  <EntryReviewCard
                    key={entry.id}
                    entry={entry}
                    targetType="national_final"
                    winner={data.national_final?.winning_entry_id === entry.id}
                    onChanged={load}
                    onWinner={(reason) => setPendingWinner({ entry, reason })}
                  />
                ))}
              </div>
            </AdminCard>
          ) : null}

          {!data.internal_entry && !data.national_final ? (
            <AdminCard>
              <p className="text-sm text-muted-foreground">
                No entry information has been submitted for review yet.
              </p>
            </AdminCard>
          ) : null}

          <AdminCard>
            <AdminCardHeader
              eyebrow="Audit trail"
              title="Review history"
              description="Reasons and actions already recorded for this response."
            />
            {data.history.length ? (
              <div className="divide-y divide-white/[0.07]">
                {data.history.map((item) => (
                  <div key={item.id} className="py-3 first:pt-0 last:pb-0">
                    <div className="flex min-w-0 items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">
                          {item.artist ? `${item.artist} · ${item.song_title ?? ""}` : "Entry"}
                        </p>
                        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{item.reason}</p>
                      </div>
                      <AdminStatus tone={reviewTone(item.action)}>{item.action}</AdminStatus>
                    </div>
                    <p className="mt-2 text-[10px] text-muted-foreground">
                      {new Date(item.created_at).toLocaleString()}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No review actions recorded yet.</p>
            )}
          </AdminCard>
        </div>

        <aside className="min-w-0 space-y-4">
          <AdminCard>
            <AdminCardHeader
              eyebrow="Solaris data"
              title={
                syncingSolaris
                  ? "Syncing…"
                  : solarisSync?.ok
                    ? solarisSync.officialEntryKnown
                      ? "Entry linked"
                      : "Participation linked"
                    : "Sync needs attention"
              }
              description={
                solarisSync?.ok && !solarisSync.officialEntryKnown
                  ? "The delegation is linked. The official entry can populate after an accepted internal entry or National Final winner exists."
                  : "Keep the delegation snapshot aligned with Solaris Studio."
              }
            />
            <div className="flex items-center justify-between gap-3">
              <AdminStatus tone={syncingSolaris ? "info" : solarisSync?.ok ? "ready" : "attention"}>
                {syncingSolaris ? "Syncing" : solarisSync?.ok ? "Linked" : "Check"}
              </AdminStatus>
              <button
                type="button"
                disabled={syncingSolaris}
                onClick={() => void syncSnapshot(data)}
                className="admin-action-secondary !min-h-10"
              >
                <RefreshCw className={`size-4 ${syncingSolaris ? "animate-spin" : ""}`} />
                Sync
              </button>
            </div>
            {solarisSyncError ? (
              <p className="mt-3 text-xs leading-relaxed text-rose-100">{solarisSyncError}</p>
            ) : null}
          </AdminCard>

          <AdminCard className="lg:sticky lg:top-24">
            <AdminCardHeader
              eyebrow="Access"
              title="Response controls"
              description="Participant access and private organizer notes."
            />

            <div className="space-y-3">
              <ControlRow
                title="Editing allowed"
                description="Participant can update this response."
                checked={editingAllowed}
                onCheckedChange={setEditingAllowed}
              />
              <ControlRow
                title="Locked"
                description="Blocks participant changes."
                checked={locked}
                onCheckedChange={setLocked}
              />

              <label className="block">
                <span className="text-xs font-semibold text-foreground">Organizer notes</span>
                <Textarea
                  rows={5}
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="Private notes about this delegation…"
                  className="mt-2"
                />
              </label>
            </div>

            <div className="admin-sticky-actions mt-4">
              <button
                type="button"
                disabled={savingControls}
                onClick={() => void saveControls()}
                className="admin-action-primary w-full"
              >
                <Save className="size-4" /> {savingControls ? "Saving…" : "Save response controls"}
              </button>
            </div>
          </AdminCard>
        </aside>
      </div>

      <AdminConfirmSheet
        open={Boolean(pendingWinner)}
        onClose={() => setPendingWinner(null)}
        title="Set National Final winner?"
        description={
          pendingWinner ? (
            <>
              <strong className="text-foreground">
                {pendingWinner.entry.artist ?? "Unknown artist"} · {pendingWinner.entry.song_title ?? "Unknown song"}
              </strong>{" "}
              will become the official winning entry for this National Final. The reason will be stored in the review history.
            </>
          ) : null
        }
        confirmLabel="Set winner"
        busy={winnerBusy}
        onConfirm={confirmWinner}
      />
    </div>
  );
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
  onWinner?: (reason: string) => void;
}) {
  const [reason, setReason] = useState(entry.review_reason ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingStatus, setPendingStatus] = useState<"declined" | "removed" | null>(null);

  async function review(status: "accepted" | "declined" | "removed") {
    if (status !== "accepted" && !reason.trim()) {
      setError("Add a reason first. Declines and removals must be explainable in the audit history.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const { error: rpcError } = await confirmationsSupabase.rpc(
        "admin_review_confirmation_entry",
        {
          _target_type: targetType,
          _entry_id: entry.id,
          _status: status,
          _reason: reason.trim(),
        },
      );
      if (rpcError) throw rpcError;
      setPendingStatus(null);
      await onChanged();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Review action failed.");
    } finally {
      setBusy(false);
    }
  }

  const currentStatus = entry.removed ? "removed" : entry.review_status;

  return (
    <article className={`rounded-xl border p-3.5 ${winner ? "border-amber-200/20 bg-amber-200/[0.045]" : "border-white/[0.07] bg-white/[0.018]"}`}>
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            {winner ? <Trophy className="size-4 shrink-0 text-amber-100" /> : null}
            <p className="truncate text-sm font-semibold">
              {entry.artist ?? "Unknown artist"} · {entry.song_title ?? "Unknown song"}
            </p>
          </div>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
            {entry.song_url ? (
              <a
                href={entry.song_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-sky-100/75 hover:text-sky-100"
              >
                Open song <ExternalLink className="size-3" />
              </a>
            ) : null}
            {entry.preview_start ? (
              <span>Preview {entry.preview_start}{entry.preview_end ? `–${entry.preview_end}` : ""}</span>
            ) : null}
          </div>
        </div>
        <AdminStatus tone={reviewTone(currentStatus)}>{currentStatus}</AdminStatus>
      </div>

      {entry.review_reason ? (
        <p className="mt-3 rounded-xl bg-black/10 p-2.5 text-xs leading-relaxed text-muted-foreground">
          Current reason: {entry.review_reason}
        </p>
      ) : null}

      <label className="mt-3 block">
        <span className="text-xs font-semibold text-foreground">Review reason</span>
        <Textarea
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Required for decline/remove; useful for winner decisions."
          rows={2}
          className="mt-2"
        />
      </label>

      {error ? <p className="mt-2 text-xs leading-relaxed text-rose-100">{error}</p> : null}

      <div className="mt-3 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        <button
          type="button"
          disabled={busy}
          onClick={() => void review("accepted")}
          className="admin-action-primary"
        >
          <CheckCircle2 className="size-4" /> Accept
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            if (!reason.trim()) {
              setError("Add a reason before declining this entry.");
              return;
            }
            setPendingStatus("declined");
          }}
          className="admin-action-secondary"
        >
          <XCircle className="size-4" /> Decline
        </button>
        {targetType === "national_final" ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (!reason.trim()) {
                setError("Add a reason before removing this entry.");
                return;
              }
              setPendingStatus("removed");
            }}
            className="admin-action-danger"
          >
            Remove
          </button>
        ) : null}
        {onWinner && !winner ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (!reason.trim()) {
                setError("Add a reason before selecting the National Final winner.");
                return;
              }
              onWinner(reason.trim());
            }}
            className="admin-action-secondary"
          >
            <Trophy className="size-4" /> Set winner
          </button>
        ) : null}
      </div>

      <AdminConfirmSheet
        open={pendingStatus !== null}
        onClose={() => setPendingStatus(null)}
        title={pendingStatus === "removed" ? "Remove this entry?" : "Decline this entry?"}
        description={
          <>
            <strong className="text-foreground">
              {entry.artist ?? "Unknown artist"} · {entry.song_title ?? "Unknown song"}
            </strong>{" "}
            will be marked {pendingStatus === "removed" ? "removed" : "declined"}. Your reason will be stored in the review history.
          </>
        }
        confirmLabel={pendingStatus === "removed" ? "Remove entry" : "Decline entry"}
        danger={pendingStatus === "removed"}
        busy={busy}
        onConfirm={() => pendingStatus && review(pendingStatus)}
      />
    </article>
  );
}

function ControlRow({
  title,
  description,
  checked,
  onCheckedChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.07] bg-white/[0.018] p-3">
      <div className="min-w-0">
        <p className="text-sm font-semibold">{title}</p>
        <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-xs font-semibold text-foreground">{value}</p>
    </div>
  );
}

function reviewTone(status: string): "ready" | "attention" | "blocked" | "info" | "neutral" {
  if (status === "accepted") return "ready";
  if (status === "declined" || status === "removed") return "blocked";
  if (status === "pending") return "attention";
  return "neutral";
}
