import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  CalendarClock,
  ExternalLink,
  LockKeyhole,
  Pencil,
  Plus,
  Trash2,
  UnlockKeyhole,
} from "lucide-react";
import { toast } from "sonner";

import { useAdminContext } from "@/components/admin/AdminContext";
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
import {
  applyConfirmationRoundStatus,
  deleteConfirmationRound,
  loadConfirmationEditions,
  previewConfirmationRoundStatus,
  saveConfirmationRound,
  setConfirmationRoundEditing,
  type ConfirmationEdition,
  type ConfirmationRound,
  type ConfirmationRoundStatusPreview,
} from "@/integrations/confirmations/admin";

export const Route = createFileRoute("/confirmations/admin/rounds")({
  head: () => ({
    meta: [
      { title: "Submission rounds — Solaris Studio" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: RoundsPage,
});

const emptyForm = {
  name: "",
  opens_at: "",
  closes_at: "",
  response_limit: "",
  editing_enabled: true,
};

function ConfirmationRoundImpactPreview({
  pending,
}: {
  pending: {
    round: ConfirmationRound;
    status: "open" | "closed";
    preview: ConfirmationRoundStatusPreview;
  };
}) {
  const { preview, status } = pending;

  return (
    <div className="space-y-3">
      <p>
        <strong className="text-foreground">R2 impact review.</strong>{" "}
        {status === "open"
          ? "This opens a submission window only. It does not create a new confirmation requirement for anyone."
          : "This stops new confirmation submissions. Existing responses and requirement history stay intact."}
      </p>

      <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        <ImpactValue label="Responses" value={preview.responseCount} />
        <ImpactValue
          label="Still required"
          value={preview.requiredRequirementCount}
        />
        <ImpactValue
          label="Already satisfied"
          value={preview.satisfiedRequirementCount}
        />
        <ImpactValue label="Waived" value={preview.waivedRequirementCount} />
      </div>

      {status === "open" ? (
        <p className="text-xs leading-5">
          Only the <strong className="text-foreground">{preview.requiredRequirementCount}</strong>{" "}
          currently unresolved edition requirement
          {preview.requiredRequirementCount === 1 ? "" : "s"} remain actionable.
          The {preview.satisfiedRequirementCount} satisfied and {preview.waivedRequirementCount} waived
          requirement{preview.satisfiedRequirementCount + preview.waivedRequirementCount === 1 ? "" : "s"} stay resolved.
        </p>
      ) : null}

      {preview.futureOpeningTimeWillBecomeNow ? (
        <p className="text-xs leading-5 text-amber-100">
          The scheduled opening time is still in the future. Opening now will move it to the current server time.
        </p>
      ) : null}

      {preview.expiredClosingTimeWillBeCleared ? (
        <p className="text-xs leading-5 text-amber-100">
          The saved closing time has already expired. Reopening will clear that old deadline until a new one is saved.
        </p>
      ) : null}

      {preview.responseLimit !== null ? (
        <p className="text-xs leading-5">
          Capacity: <strong className="text-foreground">{preview.responseCount} / {preview.responseLimit}</strong>.
        </p>
      ) : null}

      {preview.blockers.length ? (
        <div className="rounded-lg border border-rose-200/20 bg-rose-200/[0.06] p-3 text-xs text-rose-100">
          <p className="font-bold">This transition is blocked:</p>
          <ul className="mt-1 list-disc space-y-1 pl-4">
            {preview.blockers.map((blocker) => (
              <li key={blocker}>{blocker}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function ImpactValue({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-white/[0.08] bg-white/[0.025] p-2">
      <span className="block text-muted-foreground">{label}</span>
      <strong className="mt-1 block text-base text-foreground tabular-nums">{value}</strong>
    </div>
  );
}

function toLocalInput(iso: string | null) {
  if (!iso) return "";
  const date = new Date(iso);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function roundTone(status: ConfirmationRound["status"]) {
  if (status === "open") return "ready" as const;
  if (status === "draft") return "attention" as const;
  return "neutral" as const;
}

function RoundsPage() {
  const { editionId: organizerEditionId, setEditionId: setOrganizerEditionId } = useAdminContext();
  const [editions, setEditions] = useState<ConfirmationEdition[]>([]);
  const [editionId, setEditionId] = useState("");
  const [form, setForm] = useState<typeof emptyForm & { id?: string }>(emptyForm);
  const [formOpen, setFormOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ConfirmationRound | null>(null);
  const [pendingStatus, setPendingStatus] = useState<{
    round: ConfirmationRound;
    status: "open" | "closed";
    preview: ConfirmationRoundStatusPreview;
    operationId: string;
    idempotencyKey: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [roundBusy, setRoundBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh(preferredEditionId?: string) {
    const rows = await loadConfirmationEditions();
    setEditions(rows);
    setEditionId((current) =>
      preferredEditionId ??
      current ??
      rows.find((item) => item.id === organizerEditionId)?.id ??
      rows.find((item) => item.status === "active")?.id ??
      rows[0]?.id ??
      "",
    );
  }

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const rows = await loadConfirmationEditions();
        if (!alive) return;
        setEditions(rows);
        setEditionId(
          rows.find((item) => item.id === organizerEditionId)?.id ??
            rows.find((item) => item.status === "active")?.id ??
            rows[0]?.id ??
            "",
        );
      } catch (caught) {
        if (alive) {
          setError(caught instanceof Error ? caught.message : "Could not load submission rounds.");
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const edition = useMemo(
    () => editions.find((item) => item.id === editionId) ?? null,
    [editions, editionId],
  );

  useEffect(() => {
    if (
      organizerEditionId &&
      organizerEditionId !== editionId &&
      editions.some((item) => item.id === organizerEditionId)
    ) {
      setEditionId(organizerEditionId);
      setForm(emptyForm);
    }
  }, [editionId, editions, organizerEditionId]);
  const rounds = edition?.rounds ?? [];

  function startCreate() {
    setForm(emptyForm);
    setError(null);
    setFormOpen(true);
  }

  function startEdit(round: ConfirmationRound) {
    setForm({
      id: round.id,
      name: round.name,
      opens_at: toLocalInput(round.opens_at),
      closes_at: toLocalInput(round.closes_at),
      response_limit: round.response_limit ? String(round.response_limit) : "",
      editing_enabled: round.editing_enabled,
    });
    setError(null);
    setFormOpen(true);
  }

  async function submit() {
    setError(null);
    if (!editionId) return setError("Create an edition first.");
    if (!form.name.trim()) return setError("Round name is required.");
    if (form.response_limit && !/^\d+$/.test(form.response_limit)) {
      return setError("Response limit must be a whole number.");
    }

    const opens = form.opens_at ? new Date(form.opens_at).toISOString() : null;
    const closes = form.closes_at ? new Date(form.closes_at).toISOString() : null;
    if (opens && closes && new Date(closes) <= new Date(opens)) {
      return setError("Closing time must be after opening time.");
    }

    setBusy(true);
    try {
      await saveConfirmationRound({
        ...(form.id ? { id: form.id } : {}),
        edition_id: editionId,
        name: form.name.trim(),
        opens_at: opens,
        closes_at: closes,
        response_limit: form.response_limit ? Number(form.response_limit) : null,
        editing_enabled: form.editing_enabled,
      });
      toast.success(form.id ? "Round updated" : "Round created");
      setForm(emptyForm);
      setFormOpen(false);
      await refresh(editionId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Round could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  async function requestStatus(round: ConfirmationRound, status: "open" | "closed") {
    setRoundBusy(round.id);
    try {
      const preview = await previewConfirmationRoundStatus({
        roundId: round.id,
        status,
      });
      setPendingStatus({
        round,
        status,
        preview,
        operationId: crypto.randomUUID(),
        idempotencyKey: crypto.randomUUID(),
      });
    } catch (caught) {
      toast.error(
        caught instanceof Error
          ? caught.message
          : "Round impact preview could not be loaded",
      );
    } finally {
      setRoundBusy(null);
    }
  }

  async function confirmStatus() {
    if (!pendingStatus || pendingStatus.preview.blockers.length) return;

    const pending = pendingStatus;
    setRoundBusy(pending.round.id);
    try {
      await applyConfirmationRoundStatus({
        roundId: pending.round.id,
        status: pending.status,
        operationId: pending.operationId,
        idempotencyKey: pending.idempotencyKey,
        expectedVersion: pending.preview.expectedVersion,
      });
      await refresh(editionId);
      toast.success(
        pending.status === "open"
          ? pending.preview.expiredClosingTimeWillBeCleared
            ? `${pending.round.name} is open. Its expired closing time was cleared.`
            : `${pending.round.name} is open`
          : `${pending.round.name} is closed`,
      );
      setPendingStatus(null);
    } catch (caught) {
      toast.error(
        caught instanceof Error
          ? caught.message
          : "Round status could not be changed",
      );
    } finally {
      setRoundBusy(null);
    }
  }

  async function changeEditing(round: ConfirmationRound, enabled: boolean) {
    setRoundBusy(round.id);
    try {
      await setConfirmationRoundEditing(round.id, enabled);
      await refresh(editionId);
      toast.success(enabled ? "Corrections enabled for unlocked responses" : "Delegation corrections paused");
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Editing access could not be changed");
    } finally {
      setRoundBusy(null);
    }
  }

  async function removeRound() {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setRoundBusy(target.id);
    try {
      await deleteConfirmationRound(target.id);
      await refresh(editionId);
      toast.success("Round deleted");
      setDeleteTarget(null);
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Round could not be deleted");
    } finally {
      setRoundBusy(null);
    }
  }

  return (
    <div className="admin-page pb-5">
      <AdminPageHeader
        eyebrow="Delegations"
        title="Submission rounds"
        description="Control when new confirmations are accepted. Reopening an expired wave starts it now and clears its old closing time; set a new deadline in Edit round if needed. Delegation corrections remain separate from submissions."
        actions={
          <button type="button" onClick={startCreate} className="admin-action-primary">
            <Plus className="size-4" /> New round
          </button>
        }
      />

      <div className="mb-4 grid gap-2 sm:grid-cols-[1fr_auto]">
        <label className="AdminCard block rounded-xl border border-white/[0.08] bg-white/[0.025] p-3">
          <span className="admin-section-label">Edition</span>
          <select
            value={editionId}
            onChange={(event) => {
              const nextEditionId = event.target.value;
              setEditionId(nextEditionId);
              setOrganizerEditionId(nextEditionId);
              setForm(emptyForm);
            }}
            className="mt-2 min-h-11 w-full rounded-xl border border-white/[0.1] bg-[#07111f] px-3 text-sm text-foreground outline-none"
          >
            {editions.map((item) => (
              <option key={item.id} value={item.id}>
                {`SSC ${item.edition_number} — ${item.name}`}
              </option>
            ))}
          </select>
        </label>
        <Link to="/confirmations/next-in-line" className="admin-action-secondary min-h-11 sm:self-end">
          <ExternalLink className="size-4" /> Public queue
        </Link>
      </div>

      {loading ? (
        <AdminCard className="py-8 text-center text-sm text-muted-foreground">Loading rounds…</AdminCard>
      ) : error && !formOpen ? (
        <AdminCard className="border-rose-200/20 bg-rose-200/[0.045] text-sm text-rose-100">
          {error}
        </AdminCard>
      ) : rounds.length ? (
        <section className="space-y-3">
          {rounds.map((round) => {
            const isBusy = roundBusy === round.id;
            const isOpen = round.status === "open";

            return (
              <AdminCard key={round.id} className="!p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <AdminStatus tone={roundTone(round.status)}>
                        {round.status.replace("_", " ")}
                      </AdminStatus>
                      <span className="text-xs text-muted-foreground">
                        {round.response_count}
                        {round.response_limit ? ` / ${round.response_limit}` : ""} responses
                      </span>
                    </div>
                    <h2 className="mt-2 text-lg font-bold tracking-[-.02em]">{round.name}</h2>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      {round.opens_at
                        ? `Opens ${new Date(round.opens_at).toLocaleString()}`
                        : "No opening time"}
                      {" · "}
                      {round.closes_at
                        ? `Closes ${new Date(round.closes_at).toLocaleString()}`
                        : "No closing time"}
                    </p>
                  </div>

                  <AdminMoreMenu
                    label={`${round.name} actions`}
                    title={round.name}
                    description="Configuration and lower-frequency controls."
                  >
                    <div className="space-y-1">
                      <AdminActionItem
                        icon={Pencil}
                        title="Edit round"
                        description="Name, schedule, capacity and default editing access."
                        onClick={() => startEdit(round)}
                      />
                      <AdminActionItem
                        icon={round.editing_enabled ? LockKeyhole : UnlockKeyhole}
                        title={round.editing_enabled ? "Pause delegation corrections" : "Allow delegation corrections"}
                        description={
                          round.editing_enabled
                            ? "Responses in this round will become read-only."
                            : "Existing responses in this round can be corrected even if submissions stay closed. Individually locked responses stay locked."
                        }
                        disabled={isBusy}
                        onClick={() => void changeEditing(round, !round.editing_enabled)}
                      />
                      <AdminActionItem
                        icon={Trash2}
                        title="Delete round"
                        description="Permanently remove this submission round if the database allows it."
                        tone="danger"
                        onClick={() => setDeleteTarget(round)}
                      />
                    </div>
                  </AdminMoreMenu>
                </div>

                <div className="mt-4 grid grid-cols-[1fr_auto] gap-2">
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => void requestStatus(round, isOpen ? "closed" : "open")}
                    className={isOpen ? "admin-action-secondary w-full" : "admin-action-primary w-full"}
                  >
                    {isBusy
                      ? "Working…"
                      : isOpen
                        ? "Close submissions"
                        : round.closes_at && new Date(round.closes_at).getTime() <= Date.now()
                          ? "Reopen submissions"
                          : "Open submissions"}
                  </button>
                  <AdminStatus tone={round.editing_enabled ? "info" : "neutral"}>
                    {round.editing_enabled ? "Corrections on" : "Corrections off"}
                  </AdminStatus>
                </div>
              </AdminCard>
            );
          })}
        </section>
      ) : (
        <AdminCard>
          <AdminEmptyState
            icon={CalendarClock}
            title="No submission rounds yet"
            description="Create the first confirmation wave for this edition."
            action={
              <button type="button" onClick={startCreate} className="admin-action-primary">
                <Plus className="size-4" /> Create round
              </button>
            }
          />
        </AdminCard>
      )}

      <AdminSheet
        open={formOpen}
        onClose={busy ? () => undefined : () => setFormOpen(false)}
        title={form.id ? "Edit submission round" : "Create submission round"}
        description="A round controls new confirmations. Existing-response editing can stay open independently."
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Name</Label>
            <Input
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              placeholder="Second wave"
              className="min-h-11"
            />
          </div>

          <div className="space-y-2">
            <Label>Response limit</Label>
            <Input
              inputMode="numeric"
              value={form.response_limit}
              onChange={(event) => setForm({ ...form, response_limit: event.target.value })}
              placeholder="Leave empty for no limit"
              className="min-h-11"
            />
          </div>

          <div className="space-y-2">
            <Label>Opens at</Label>
            <Input
              type="datetime-local"
              value={form.opens_at}
              onChange={(event) => setForm({ ...form, opens_at: event.target.value })}
              className="min-h-11"
            />
          </div>

          <div className="space-y-2">
            <Label>Closes at</Label>
            <Input
              type="datetime-local"
              value={form.closes_at}
              onChange={(event) => setForm({ ...form, closes_at: event.target.value })}
              className="min-h-11"
            />
          </div>

          <label className="flex min-h-14 items-center justify-between gap-3 rounded-xl border border-white/[0.08] bg-white/[0.025] p-3 text-sm">
            <span>
              <span className="block font-semibold">Allow delegation corrections</span>
              <span className="mt-1 block text-xs text-muted-foreground">
                Existing responses can be edited even after submissions close. Enabling this applies to responses in this round; individual locks still win.
              </span>
            </span>
            <input
              type="checkbox"
              checked={form.editing_enabled}
              onChange={(event) => setForm({ ...form, editing_enabled: event.target.checked })}
              className="size-5 shrink-0"
            />
          </label>

          {error ? (
            <div className="rounded-xl border border-rose-200/20 bg-rose-200/[0.05] p-3 text-sm text-rose-100">
              {error}
            </div>
          ) : null}

          <div className="admin-sticky-actions grid grid-cols-[auto_1fr] gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => setFormOpen(false)}
              className="admin-action-secondary"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busy || !editionId}
              onClick={() => void submit()}
              className="admin-action-primary"
            >
              {busy ? "Saving…" : form.id ? "Save changes" : "Create round"}
            </button>
          </div>
        </div>
      </AdminSheet>

      <AdminConfirmSheet
        open={Boolean(pendingStatus)}
        onClose={() => {
          if (pendingStatus && roundBusy === pendingStatus.round.id) return;
          setPendingStatus(null);
        }}
        onConfirm={confirmStatus}
        title={
          pendingStatus?.status === "open"
            ? "Open confirmation submissions?"
            : "Close confirmation submissions?"
        }
        description={
          pendingStatus ? (
            <ConfirmationRoundImpactPreview pending={pendingStatus} />
          ) : (
            "Review this R2 submission-window transition."
          )
        }
        confirmLabel={
          pendingStatus?.status === "open" ? "Open submissions" : "Close submissions"
        }
        confirmationText={pendingStatus?.round.name}
        confirmationHint={
          pendingStatus
            ? `Type ${pendingStatus.round.name} to confirm this R2 window change`
            : undefined
        }
        confirmDisabled={Boolean(pendingStatus?.preview.blockers.length)}
        danger={pendingStatus?.status === "closed"}
        busy={Boolean(
          pendingStatus && roundBusy === pendingStatus.round.id,
        )}
      />

      <AdminConfirmSheet
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={removeRound}
        title="Delete submission round?"
        description={
          <>
            <strong className="text-foreground">{deleteTarget?.name}</strong> will be permanently removed.
            Any dependent responses are still protected by the database rules, so deletion may be refused if the round is already in use.
          </>
        }
        confirmLabel="Delete round"
        danger
        busy={Boolean(deleteTarget && roundBusy === deleteTarget.id)}
      />
    </div>
  );
}
