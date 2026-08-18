import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Edit3, ExternalLink, Lock, LockOpen, Plus, Radio, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  AdminActionItem,
  AdminCard,
  AdminConfirmSheet,
  AdminEmptyState,
  AdminMoreMenu,
  AdminPageHeader,
  AdminSheet,
  AdminStatus,
} from "@/components/admin/AdminUI";
import { ConfirmationsAdminNav } from "@/components/confirmations/ConfirmationsAdminNav";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  deleteConfirmationRound,
  loadConfirmationEditions,
  saveConfirmationRound,
  setConfirmationRoundEditing,
  setConfirmationRoundStatus,
  type ConfirmationEdition,
  type ConfirmationRound,
} from "@/integrations/confirmations/admin";

const emptyForm = {
  name: "",
  opens_at: "",
  closes_at: "",
  response_limit: "",
  editing_enabled: true,
};

type RoundForm = typeof emptyForm & { id?: string; originalStatus?: ConfirmationRound["status"] };

function toLocalInput(iso: string | null) {
  if (!iso) return "";
  const date = new Date(iso);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export function DelegationRoundsView() {
  const [editions, setEditions] = useState<ConfirmationEdition[]>([]);
  const [editionId, setEditionId] = useState("");
  const [form, setForm] = useState<RoundForm>(emptyForm);
  const [editorOpen, setEditorOpen] = useState(false);
  const [deleteRound, setDeleteRound] = useState<ConfirmationRound | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh(preferredEditionId?: string) {
    const rows = await loadConfirmationEditions();
    setEditions(rows);
    setEditionId((current) => preferredEditionId ?? (current || rows.find((item) => item.status === "active")?.id || rows[0]?.id || ""));
  }

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const rows = await loadConfirmationEditions();
        if (!alive) return;
        setEditions(rows);
        setEditionId(rows.find((item) => item.status === "active")?.id ?? rows[0]?.id ?? "");
      } catch (caught) {
        if (alive) setError(caught instanceof Error ? caught.message : "Could not load submission rounds.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const edition = useMemo(() => editions.find((item) => item.id === editionId) ?? null, [editions, editionId]);
  const rounds = useMemo(
    () => [...(edition?.rounds ?? [])].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    [edition],
  );

  function openCreate() {
    setForm(emptyForm);
    setError(null);
    setEditorOpen(true);
  }

  function openEdit(round: ConfirmationRound) {
    setForm({
      id: round.id,
      originalStatus: round.status,
      name: round.name,
      opens_at: toLocalInput(round.opens_at),
      closes_at: toLocalInput(round.closes_at),
      response_limit: round.response_limit ? String(round.response_limit) : "",
      editing_enabled: round.editing_enabled,
    });
    setError(null);
    setEditorOpen(true);
  }

  async function submit() {
    setError(null);
    if (!editionId) return setError("Choose an edition first.");
    if (!form.name.trim()) return setError("Round name is required.");
    if (form.response_limit && !/^\d+$/.test(form.response_limit)) return setError("Response limit must be a whole number.");

    const opens = form.opens_at ? new Date(form.opens_at).toISOString() : null;
    const closes = form.closes_at ? new Date(form.closes_at).toISOString() : null;
    if (opens && closes && new Date(closes) <= new Date(opens)) return setError("Closing time must be after opening time.");

    setBusy("save");
    try {
      await saveConfirmationRound({
        ...(form.id ? { id: form.id } : {}),
        edition_id: editionId,
        name: form.name.trim(),
        status: form.originalStatus ?? "draft",
        opens_at: opens,
        closes_at: closes,
        response_limit: form.response_limit ? Number(form.response_limit) : null,
        editing_enabled: form.editing_enabled,
      });
      toast.success(form.id ? "Round details saved" : "Round created as draft");
      setEditorOpen(false);
      setForm(emptyForm);
      await refresh(editionId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Round could not be saved.");
    } finally {
      setBusy(null);
    }
  }

  async function changeStatus(round: ConfirmationRound, status: ConfirmationRound["status"]) {
    const key = `status:${round.id}`;
    setBusy(key);
    try {
      await setConfirmationRoundStatus(round.id, status);
      await refresh(editionId);
      toast.success(status === "open" ? `${round.name} is open` : status === "closed" ? `${round.name} is closed` : `${round.name} moved to draft`);
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Round status could not be changed");
    } finally {
      setBusy(null);
    }
  }

  async function changeEditing(round: ConfirmationRound, enabled: boolean) {
    const key = `editing:${round.id}`;
    setBusy(key);
    try {
      await setConfirmationRoundEditing(round.id, enabled);
      await refresh(editionId);
      toast.success(enabled ? "Delegation editing allowed" : "Delegation editing stopped");
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Editing access could not be changed");
    } finally {
      setBusy(null);
    }
  }

  async function removeRound(round: ConfirmationRound) {
    const key = `delete:${round.id}`;
    setBusy(key);
    try {
      await deleteConfirmationRound(round.id);
      await refresh(editionId);
      setDeleteRound(null);
      toast.success("Round deleted");
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Round could not be deleted");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-5xl">
      <AdminPageHeader
        eyebrow="Delegation operations"
        title="Submission rounds"
        description="Control when new confirmations are accepted and whether existing delegations can keep editing."
        actions={<button type="button" onClick={openCreate} className="admin-action-primary"><Plus className="size-4" /> New round</button>}
      />
      <ConfirmationsAdminNav current="/confirmations/admin/rounds" />

      <AdminCard className="mb-4 !p-3">
        <div className="flex items-center gap-2">
          <select value={editionId} onChange={(event) => setEditionId(event.target.value)} className="min-h-11 min-w-0 flex-1 rounded-xl border border-white/[0.08] bg-white/[0.025] px-3 text-sm font-semibold outline-none focus:border-sky-200/25">
            {editions.map((item) => <option key={item.id} value={item.id}>{`SSC ${item.edition_number} · ${item.name}`}</option>)}
          </select>
          <Link to="/confirmations/next-in-line" className="admin-action-secondary !min-h-11 !px-3" aria-label="Open Next in Line"><ExternalLink className="size-4" /></Link>
        </div>
      </AdminCard>

      {loading ? (
        <AdminCard className="py-10 text-center text-sm text-muted-foreground">Loading rounds…</AdminCard>
      ) : error && !editorOpen ? (
        <AdminCard className="border-rose-200/15 bg-rose-200/[0.045] text-sm text-rose-100">{error}</AdminCard>
      ) : rounds.length ? (
        <section className="space-y-3">
          {rounds.map((round) => {
            const statusTone = round.status === "open" ? "ready" : round.status === "draft" ? "attention" : "neutral";
            const statusLabel = round.status === "auto_closed" ? "Closed automatically" : round.status;
            const statusBusy = busy === `status:${round.id}`;
            const editingBusy = busy === `editing:${round.id}`;

            return (
              <AdminCard key={round.id} className="!p-0 overflow-hidden">
                <div className="p-4 sm:p-5">
                  <div className="flex min-w-0 items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <h2 className="truncate text-base font-bold sm:text-lg">{round.name}</h2>
                      <p className="mt-1 text-xs text-muted-foreground">{round.response_count}{round.response_limit ? ` / ${round.response_limit}` : ""} responses</p>
                    </div>
                    <AdminStatus tone={statusTone}>{statusLabel}</AdminStatus>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <Info label="Opens" value={round.opens_at ? formatDate(round.opens_at) : "No schedule"} />
                    <Info label="Closes" value={round.closes_at ? formatDate(round.closes_at) : "No schedule"} />
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-white/[0.018] px-3 py-2.5">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold">Existing responses</p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">{round.editing_enabled ? "Delegations can edit" : "Editing is locked"}</p>
                    </div>
                    <AdminStatus tone={round.editing_enabled ? "info" : "neutral"}>{round.editing_enabled ? "Editing on" : "Locked"}</AdminStatus>
                  </div>

                  <div className="mt-4 grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                    {round.status === "open" ? (
                      <button type="button" disabled={statusBusy} onClick={() => void changeStatus(round, "closed")} className="admin-action-primary w-full"><Lock className="size-4" /> {statusBusy ? "Working…" : "Close round"}</button>
                    ) : (
                      <button type="button" disabled={statusBusy} onClick={() => void changeStatus(round, "open")} className="admin-action-primary w-full"><Radio className="size-4" /> {statusBusy ? "Working…" : "Open round"}</button>
                    )}

                    <AdminMoreMenu label={`${round.name} actions`} title={round.name} description="Round actions and advanced controls.">
                      <div className="divide-y divide-white/[0.07]">
                        <AdminActionItem icon={Edit3} title="Edit round details" description="Name, schedule and response limit." onClick={() => openEdit(round)} />
                        <AdminActionItem icon={round.editing_enabled ? Lock : LockOpen} title={round.editing_enabled ? "Stop delegation editing" : "Allow delegation editing"} description={round.editing_enabled ? "Existing responses become read-only." : "Existing responses can be corrected again."} disabled={editingBusy} onClick={() => void changeEditing(round, !round.editing_enabled)} />
                        {round.status !== "draft" ? <AdminActionItem icon={Layers3} title="Move to draft" description="Stop treating this as an active confirmation wave." disabled={statusBusy} onClick={() => void changeStatus(round, "draft")} /> : null}
                        <AdminActionItem icon={Trash2} title="Delete round" description="Permanent. Dependent data rules are still enforced by the backend." tone="danger" onClick={() => setDeleteRound(round)} />
                      </div>
                    </AdminMoreMenu>
                  </div>
                </div>
              </AdminCard>
            );
          })}
        </section>
      ) : (
        <AdminCard><AdminEmptyState icon={Layers3} title="No submission rounds" description="Create the first round as a private draft, then open it when confirmations should begin." action={<button type="button" onClick={openCreate} className="admin-action-primary"><Plus className="size-4" /> Create round</button>} /></AdminCard>
      )}

      <AdminSheet open={editorOpen} onClose={() => busy !== "save" && setEditorOpen(false)} title={form.id ? "Edit round" : "Create round"} description={form.id ? "Change the round details. Opening and closing stays a separate deliberate action." : "The new round starts as a draft. You decide when it opens."}>
        <div className="space-y-4">
          <div className="space-y-2"><Label>Name</Label><Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Confirmations wave 2" /></div>
          <div className="space-y-2"><Label>Response limit</Label><Input inputMode="numeric" value={form.response_limit} onChange={(event) => setForm({ ...form, response_limit: event.target.value })} placeholder="No limit" /></div>
          <div className="space-y-2"><Label>Opens at</Label><Input type="datetime-local" value={form.opens_at} onChange={(event) => setForm({ ...form, opens_at: event.target.value })} /></div>
          <div className="space-y-2"><Label>Closes at</Label><Input type="datetime-local" value={form.closes_at} onChange={(event) => setForm({ ...form, closes_at: event.target.value })} /></div>
          <label className="flex min-h-12 items-center justify-between gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-2.5 text-sm"><span><span className="block font-semibold">Allow editing existing responses</span><span className="mt-1 block text-xs text-muted-foreground">This is separate from accepting new confirmations.</span></span><input type="checkbox" checked={form.editing_enabled} onChange={(event) => setForm({ ...form, editing_enabled: event.target.checked })} className="size-5" /></label>
          {error ? <div className="rounded-xl border border-rose-200/15 bg-rose-200/[0.05] p-3 text-sm text-rose-100">{error}</div> : null}
          <div className="admin-sticky-actions grid grid-cols-[auto_minmax(0,1fr)] gap-2"><button type="button" disabled={busy === "save"} onClick={() => setEditorOpen(false)} className="admin-action-secondary">Cancel</button><button type="button" disabled={busy === "save"} onClick={() => void submit()} className="admin-action-primary w-full">{busy === "save" ? "Saving…" : form.id ? "Save details" : "Create draft round"}</button></div>
        </div>
      </AdminSheet>

      <AdminConfirmSheet open={Boolean(deleteRound)} onClose={() => setDeleteRound(null)} title={deleteRound ? `Delete ${deleteRound.name}?` : "Delete round?"} description={<>This permanently removes the round. The database will still block deletion if protected dependent records make it unsafe.</>} confirmLabel="Delete round" confirmationText={deleteRound?.name} confirmationHint={deleteRound ? `Type ${deleteRound.name} to confirm` : undefined} danger busy={Boolean(deleteRound && busy === `delete:${deleteRound.id}`)} onConfirm={() => deleteRound ? removeRound(deleteRound) : undefined} />
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-white/[0.06] bg-white/[0.018] p-2.5"><p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{label}</p><p className="mt-1 truncate text-xs font-semibold">{value}</p></div>;
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "Invalid date";
}
