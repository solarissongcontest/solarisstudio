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
  applyConfirmationRoundChange,
  loadConfirmationEditions,
  previewConfirmationRoundChange,
  type ConfirmationEdition,
  type ConfirmationRound,
  type ConfirmationRoundChangeKind,
  type ConfirmationRoundChangePayload,
  type ConfirmationRoundChangePreview,
} from "@/integrations/confirmations/admin";
import { createOrganisationCommand } from "@/lib/organisation-operation-contract";

export const Route = createFileRoute("/confirmations/admin/rounds")({
  head: () => ({
    meta: [
      { title: "Submission rounds — Solaris Studio" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: RoundsPage,
});

type PendingRoundChange = {
  kind: ConfirmationRoundChangeKind;
  roundId: string | null;
  payload: ConfirmationRoundChangePayload;
  preview: ConfirmationRoundChangePreview;
  operationId: string;
  idempotencyKey: string;
  restoreFormOnCancel: boolean;
};

const emptyForm = {
  name: "",
  status: "draft" as ConfirmationRound["status"],
  opens_at: "",
  closes_at: "",
  response_limit: "",
  editing_enabled: true,
};

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
  const [pendingChange, setPendingChange] = useState<PendingRoundChange | null>(null);
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
      status: round.status,
      opens_at: toLocalInput(round.opens_at),
      closes_at: toLocalInput(round.closes_at),
      response_limit: round.response_limit ? String(round.response_limit) : "",
      editing_enabled: round.editing_enabled,
    });
    setError(null);
    setFormOpen(true);
  }

  async function prepareChange(input: {
    kind: ConfirmationRoundChangeKind;
    roundId?: string | null;
    payload?: ConfirmationRoundChangePayload;
    restoreFormOnCancel?: boolean;
  }) {
    setError(null);
    if (input.roundId) setRoundBusy(input.roundId);
    else setBusy(true);

    try {
      const preview = await previewConfirmationRoundChange({
        roundId: input.roundId ?? null,
        kind: input.kind,
        payload: input.payload ?? {},
      });

      if (preview.alreadyApplied && preview.blockers.length === 0) {
        if (input.restoreFormOnCancel) setFormOpen(false);
        toast.success("That round state is already current.");
        return;
      }

      const operation = createOrganisationCommand({
        command: `confirmation.round.${input.kind}`,
        riskClass: preview.riskClass,
        expectedVersion: preview.expectedVersion,
        scope: {
          editionId: preview.editionId,
          entityId: preview.roundId ?? preview.editionId,
        },
        payload: {
          roundId: preview.roundId,
          changeKind: input.kind,
          payload: input.payload ?? {},
        },
      });

      if (input.restoreFormOnCancel) setFormOpen(false);

      setPendingChange({
        kind: input.kind,
        roundId: input.roundId ?? null,
        payload: input.payload ?? {},
        preview,
        operationId: operation.operationId,
        idempotencyKey: operation.idempotencyKey,
        restoreFormOnCancel: input.restoreFormOnCancel === true,
      });
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : "Round impact preview could not be loaded.";
      if (input.restoreFormOnCancel) setError(message);
      else toast.error(message);
    } finally {
      if (input.roundId) setRoundBusy(null);
      else setBusy(false);
    }
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

    const payload: ConfirmationRoundChangePayload = {
      editionId,
      name: form.name.trim(),
      opensAt: opens,
      closesAt: closes,
      responseLimit: form.response_limit ? Number(form.response_limit) : null,
      editingEnabled: form.editing_enabled,
    };

    await prepareChange({
      kind: form.id ? "update" : "create",
      roundId: form.id ?? null,
      payload,
      restoreFormOnCancel: true,
    });
  }

  async function requestStatusChange(
    round: ConfirmationRound,
    status: "open" | "closed",
  ) {
    await prepareChange({
      kind: "status",
      roundId: round.id,
      payload: { status },
    });
  }

  async function requestEditingChange(
    round: ConfirmationRound,
    enabled: boolean,
  ) {
    await prepareChange({
      kind: "editing",
      roundId: round.id,
      payload: { enabled },
    });
  }

  async function requestDelete(round: ConfirmationRound) {
    await prepareChange({
      kind: "delete",
      roundId: round.id,
      payload: {},
    });
  }

  async function applyPendingChange() {
    if (!pendingChange || pendingChange.preview.blockers.length > 0) return;

    const pending = pendingChange;
    setBusy(true);
    if (pending.roundId) setRoundBusy(pending.roundId);

    try {
      const receipt = await applyConfirmationRoundChange({
        roundId: pending.roundId,
        kind: pending.kind,
        payload: pending.payload,
        operationId: pending.operationId,
        idempotencyKey: pending.idempotencyKey,
        expectedVersion: pending.preview.expectedVersion,
      });

      setPendingChange(null);
      setForm(emptyForm);
      await refresh(editionId);

      if (pending.kind === "create") {
        toast.success("Submission round created as a draft.");
      } else if (pending.kind === "delete") {
        toast.success("Submission round deleted.");
      } else if (pending.kind === "editing") {
        toast.success(
          receipt.editingEnabled
            ? `Corrections enabled for ${receipt.affectedResponses} response${receipt.affectedResponses === 1 ? "" : "s"}.`
            : `Corrections paused for ${receipt.affectedResponses} response${receipt.affectedResponses === 1 ? "" : "s"}.`,
        );
      } else if (pending.kind === "status") {
        toast.success(
          receipt.status === "open"
            ? "Submissions are open. No new confirmation requirements were created."
            : "New submissions are closed. Existing correction access is unchanged.",
        );
      } else {
        toast.success("Round configuration updated.");
      }
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Round change could not be applied.");
    } finally {
      setBusy(false);
      setRoundBusy(null);
    }
  }

  function cancelPendingChange() {
    const reopenForm = pendingChange?.restoreFormOnCancel === true;
    setPendingChange(null);
    if (reopenForm) setFormOpen(true);
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
                        onClick={() => void requestEditingChange(round, !round.editing_enabled)}
                      />
                      <AdminActionItem
                        icon={Trash2}
                        title="Delete round"
                        description="Remove an unused round. Any round with responses is protected from deletion."
                        tone="danger"
                        onClick={() => void requestDelete(round)}
                      />
                    </div>
                  </AdminMoreMenu>
                </div>

                <div className="mt-4 grid grid-cols-[1fr_auto] gap-2">
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => void requestStatusChange(round, isOpen ? "closed" : "open")}
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
              {busy ? "Preparing…" : form.id ? "Review changes" : "Review new round"}
            </button>
          </div>
        </div>
      </AdminSheet>

      <AdminConfirmSheet
        open={Boolean(pendingChange)}
        onClose={cancelPendingChange}
        onConfirm={applyPendingChange}
        title={pendingChange ? roundChangeTitle(pendingChange) : "Confirm round change"}
        description={
          pendingChange ? (
            <RoundImpactPreview pending={pendingChange} />
          ) : (
            "Review the server-computed impact before applying this round change."
          )
        }
        confirmLabel={pendingChange ? roundChangeConfirmLabel(pendingChange) : "Apply change"}
        confirmationText={
          pendingChange?.preview.riskClass === "R3"
            ? pendingChange.preview.roundName ?? undefined
            : undefined
        }
        confirmationHint={
          pendingChange?.preview.riskClass === "R3" && pendingChange.preview.roundName
            ? `Type ${pendingChange.preview.roundName} to confirm this R3 deletion`
            : undefined
        }
        busy={busy || Boolean(pendingChange?.roundId && roundBusy === pendingChange.roundId)}
        danger={pendingChange?.preview.riskClass === "R3"}
        confirmDisabled={Boolean(pendingChange?.preview.blockers.length)}
      />
    </div>
  );
}
