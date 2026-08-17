import "@/confirmations.css";

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  LockKeyhole,
  Save,
  Trophy,
  XCircle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { confirmationsSupabase } from "@/integrations/confirmations/client";
import {
  syncConfirmationSnapshotToSolaris,
  type ConfirmationSolarisSyncResult,
} from "@/integrations/confirmations/sync.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/confirmations/admin/responses/$id")({
  head: () => ({
    meta: [
      { title: "Confirmation Response — Solaris Studio" },
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

function ReviewBadge({ status }: { status: string }) {
  const bad = status === "declined" || status === "removed";
  return (
    <span
      className={cn(
        "rounded-full border px-2.5 py-1 text-[9px] font-medium uppercase tracking-[0.15em]",
        status === "accepted" && "border-emerald-300/25 bg-emerald-300/10 text-emerald-100",
        bad && "border-red-300/25 bg-red-300/10 text-red-100",
        status !== "accepted" && !bad && "border-white/10 bg-white/[0.04] text-white/55",
      )}
    >
      {status}
    </span>
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
  onWinner?: () => Promise<void>;
}) {
  const [reason, setReason] = useState(entry.review_reason ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function review(status: "accepted" | "declined" | "removed") {
    if (status !== "accepted" && !reason.trim()) {
      setError("Add a reason before declining or removing an entry.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { error: rpcError } = await confirmationsSupabase.rpc("admin_review_confirmation_entry", {
        _target_type: targetType,
        _entry_id: entry.id,
        _status: status,
        _reason: reason.trim(),
      });
      if (rpcError) throw rpcError;
      await onChanged();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Review action failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className={cn("rounded-2xl border p-4", winner ? "border-amber-200/30 bg-amber-200/[0.06]" : "border-white/10 bg-black/10")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {winner ? <Trophy className="size-4 text-amber-100" /> : null}
            <p className="font-medium text-white">
              {entry.artist ?? "Unknown artist"} — {entry.song_title ?? "Unknown song"}
            </p>
          </div>
          {entry.song_url ? (
            <a href={entry.song_url} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs text-sky-100/65 hover:text-sky-100">
              Open song <ExternalLink className="size-3" />
            </a>
          ) : null}
          {entry.preview_start ? (
            <p className="mt-1 text-[10px] text-white/35">Preview {entry.preview_start}{entry.preview_end ? `–${entry.preview_end}` : ""}</p>
          ) : null}
        </div>
        <ReviewBadge status={entry.removed ? "removed" : entry.review_status} />
      </div>

      {entry.review_reason ? (
        <p className="mt-3 rounded-xl border border-white/8 bg-white/[0.025] p-3 text-xs leading-relaxed text-white/55">
          Current reason: {entry.review_reason}
        </p>
      ) : null}

      <div className="mt-4 space-y-2">
        <Label htmlFor={`reason-${entry.id}`}>Organiser reason</Label>
        <Textarea
          id={`reason-${entry.id}`}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Required for decline/remove; optional for acceptance."
          rows={2}
        />
      </div>

      {error ? <p className="mt-2 text-xs text-red-100">{error}</p> : null}

      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" disabled={busy} onClick={() => void review("accepted")}>
          <CheckCircle2 className="size-3.5" /> Accept
        </Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => void review("declined")}>
          <XCircle className="size-3.5" /> Decline
        </Button>
        {targetType === "national_final" ? (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => void review("removed")}>
            Remove
          </Button>
        ) : null}
        {onWinner && !winner ? (
          <Button
            size="sm"
            variant="outline"
            disabled={busy || !reason.trim()}
            onClick={() => void onWinner()}
            title={!reason.trim() ? "Add a reason before selecting a winner" : undefined}
          >
            <Trophy className="size-3.5" /> Set winner
          </Button>
        ) : null}
      </div>
    </article>
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
    } catch (caught) {
      setSolarisSync(null);
      setSolarisSyncError(caught instanceof Error ? caught.message : "Could not sync this response to Solaris.");
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
    await syncSnapshot(detail);
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
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save controls.");
    } finally {
      setSavingControls(false);
    }
  }

  async function setWinner(entry: ReviewEntry) {
    if (!data?.national_final) return;
    const reasonField = document.getElementById(`reason-${entry.id}`) as HTMLTextAreaElement | null;
    const reason = reasonField?.value.trim() ?? "";
    if (!reason) {
      setError("Add a reason on the entry before selecting it as winner.");
      return;
    }

    const { error: rpcError } = await confirmationsSupabase.rpc("admin_set_confirmation_winner", {
      _national_final_id: data.national_final.id,
      _entry_id: entry.id,
      _reason: reason,
    });
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    await load();
  }

  if (loading) {
    return (
      <div className="confirmations-theme min-h-screen">
        <div className="confirmations-backdrop" aria-hidden="true" />
        <main className="relative z-10 mx-auto max-w-3xl px-4 py-12">
          <div className="confirmations-surface p-8 text-center text-sm text-white/55">Loading response…</div>
        </main>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="confirmations-theme min-h-screen">
        <div className="confirmations-backdrop" aria-hidden="true" />
        <main className="relative z-10 mx-auto max-w-3xl px-4 py-12">
          <Link to="/confirmations/admin/responses" className="inline-flex items-center gap-2 text-xs text-white/55"><ArrowLeft className="size-3.5" /> Responses</Link>
          <div className="confirmations-surface mt-5 p-7 text-red-100">{error ?? "Response not found."}</div>
        </main>
      </div>
    );
  }

  return (
    <div className="confirmations-theme min-h-screen">
      <div className="confirmations-backdrop" aria-hidden="true" />
      <main className="relative z-10 mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
        <Link
          to="/confirmations/admin/responses"
          className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.045] px-3.5 py-2 text-xs text-white/65 backdrop-blur-xl transition hover:text-white"
        >
          <ArrowLeft className="size-3.5" /> Responses
        </Link>

        <header className="my-7">
          <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-sky-200/65">
            {data.edition ? `SSC ${data.edition.edition_number}` : "Solaris Song Contest"} · {data.round?.name ?? "Confirmation"}
          </p>
          <h1 className="confirmations-display mt-3 text-5xl font-normal uppercase leading-none sm:text-6xl">{data.country}</h1>
          <p className="mt-3 text-sm text-white/50">@{data.instagram_username.replace(/^@/, "")} · submitted {new Date(data.submitted_at).toLocaleString()}</p>
        </header>

        {error ? <div className="mb-4 rounded-xl border border-red-300/20 bg-red-300/10 p-3 text-sm text-red-100">{error}</div> : null}

        <div className="grid gap-4 lg:grid-cols-[1fr_0.72fr]">
          <div className="space-y-4">
            <section className="confirmations-surface p-5">
              <p className="text-[10px] uppercase tracking-[0.18em] text-white/35">Submission</p>
              <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                <div><p className="text-[10px] text-white/35">Participating</p><p className="mt-1 text-white">{data.participating ? "Yes" : "No"}</p></div>
                <div><p className="text-[10px] text-white/35">Selection</p><p className="mt-1 text-white">{data.selection_method?.replaceAll("_", " ") ?? "Unknown"}</p></div>
                <div><p className="text-[10px] text-white/35">Country account</p><p className="mt-1 text-white">{data.country_account || (data.has_country_account ? "Provided" : "None")}</p></div>
                <div><p className="text-[10px] text-white/35">Edits</p><p className="mt-1 text-white">{data.edit_count}</p></div>
              </div>
            </section>

            {data.internal_entry ? (
              <section className="confirmations-surface p-5">
                <p className="mb-4 text-[10px] uppercase tracking-[0.18em] text-white/35">Internal entry review</p>
                <EntryReviewCard entry={data.internal_entry} targetType="internal" onChanged={load} />
              </section>
            ) : null}

            {data.national_final ? (
              <section className="confirmations-surface p-5">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.18em] text-white/35">National Final</p>
                    <h2 className="mt-1 text-xl font-medium text-white">{data.national_final.nf_name || "National Final"}</h2>
                  </div>
                  <span className="text-xs text-white/40">{data.national_final.entries.length} entries</span>
                </div>
                <div className="space-y-3">
                  {data.national_final.entries.map((entry) => (
                    <EntryReviewCard
                      key={entry.id}
                      entry={entry}
                      targetType="national_final"
                      winner={data.national_final?.winning_entry_id === entry.id}
                      onChanged={load}
                      onWinner={() => setWinner(entry)}
                    />
                  ))}
                </div>
              </section>
            ) : null}

            <section className="confirmations-surface p-5">
              <p className="text-[10px] uppercase tracking-[0.18em] text-white/35">Review history</p>
              <div className="mt-4 space-y-3">
                {data.history.length ? data.history.map((item) => (
                  <div key={item.id} className="rounded-xl border border-white/8 bg-black/10 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-medium text-white">{item.artist ? `${item.artist} — ${item.song_title ?? ""}` : "Entry"}</p>
                      <ReviewBadge status={item.action} />
                    </div>
                    <p className="mt-2 text-xs leading-relaxed text-white/55">{item.reason}</p>
                    <p className="mt-2 text-[10px] text-white/30">{new Date(item.created_at).toLocaleString()}</p>
                  </div>
                )) : <p className="text-sm text-white/40">No organiser review actions yet.</p>}
              </div>
            </section>
          </div>

          <aside className="space-y-4">
            <section className="confirmations-surface p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.18em] text-white/35">Solaris canonical data</p>
                  <p className="mt-2 text-sm font-medium text-white">
                    {syncingSolaris
                      ? "Syncing…"
                      : solarisSync?.ok
                        ? solarisSync.officialEntryKnown
                          ? "Participation + official entry linked"
                          : "Participation linked · entry pending"
                        : "Needs sync"}
                  </p>
                </div>
                <span
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-[9px] uppercase tracking-[0.15em]",
                    syncingSolaris && "border-sky-200/20 bg-sky-200/10 text-sky-100",
                    !syncingSolaris && solarisSync?.ok && "border-emerald-300/25 bg-emerald-300/10 text-emerald-100",
                    !syncingSolaris && !solarisSync?.ok && "border-amber-200/25 bg-amber-200/10 text-amber-100",
                  )}
                >
                  {syncingSolaris ? "Syncing" : solarisSync?.ok ? "Linked" : "Check"}
                </span>
              </div>
              {solarisSyncError ? <p className="mt-3 text-xs leading-relaxed text-red-100">{solarisSyncError}</p> : null}
              {solarisSync?.ok && !solarisSync.officialEntryKnown ? (
                <p className="mt-3 text-xs leading-relaxed text-white/45">The country is in the canonical SSC participant list. Its official song will populate automatically after an accepted internal entry or accepted NF winner exists.</p>
              ) : null}
              <Button className="mt-4 w-full" size="sm" variant="outline" disabled={syncingSolaris} onClick={() => void syncSnapshot(data)}>
                {syncingSolaris ? "Syncing…" : "Sync now"}
              </Button>
            </section>

            <section className="confirmations-surface p-5 lg:sticky lg:top-6">
              <div className="flex items-center gap-2">
                <LockKeyhole className="size-4 text-sky-100/70" />
                <h2 className="font-medium text-white">Response controls</h2>
              </div>

              <div className="mt-5 space-y-4">
                <div className="flex items-center justify-between gap-3 rounded-xl border border-white/8 bg-black/10 p-3">
                  <div>
                    <p className="text-sm text-white">Editing allowed</p>
                    <p className="mt-1 text-[10px] text-white/35">Participant can update this response.</p>
                  </div>
                  <Switch checked={editingAllowed} onCheckedChange={setEditingAllowed} />
                </div>

                <div className="flex items-center justify-between gap-3 rounded-xl border border-white/8 bg-black/10 p-3">
                  <div>
                    <p className="text-sm text-white">Locked</p>
                    <p className="mt-1 text-[10px] text-white/35">Blocks participant changes.</p>
                  </div>
                  <Switch checked={locked} onCheckedChange={setLocked} />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="admin-notes">Admin notes</Label>
                  <Textarea id="admin-notes" rows={6} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Private organiser notes…" />
                </div>

                <Button className="w-full" disabled={savingControls} onClick={() => void saveControls()}>
                  <Save className="size-4" /> {savingControls ? "Saving…" : "Save controls"}
                </Button>
              </div>
            </section>
          </aside>
        </div>
      </main>
    </div>
  );
}
