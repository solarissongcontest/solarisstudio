import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useState } from "react";
import { Link2, RefreshCw, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";

import { useAdminContext } from "@/components/admin/AdminContext";
import { AdminPage } from "@/components/admin/AdminShell";
import {
  AdminActionItem,
  AdminCard,
  AdminCardHeader,
  AdminConfirmSheet,
  AdminEmptyState,
  AdminMoreMenu,
  AdminPageHeader,
  AdminStatus,
} from "@/components/admin/AdminUI";
import { requireConfirmationsAdmin } from "@/integrations/confirmations/admin";
import {
  applyConfirmationEditionBindingChange,
  loadConfirmationEditionBinding,
  previewConfirmationEditionBindingChange,
  type ConfirmationEditionBindingChangeKind,
  type ConfirmationEditionBindingPreview,
  type ConfirmationEditionBindingProjection,
  type ConfirmationEditionBindingReceipt,
} from "@/integrations/confirmations/edition-bindings";
import { createOrganisationCommand } from "@/lib/organisation-operation-contract";
import { reconcileSystemOperation } from "@/lib/system-operation.functions";

export const Route = createFileRoute("/confirmations/admin/editions")({
  head: () => ({
    meta: [
      { title: "Delegation Editions — Solaris Studio" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: EditionsPage,
});

type PendingChange = {
  kind: ConfirmationEditionBindingChangeKind;
  enabled: boolean | null;
  preview: ConfirmationEditionBindingPreview;
  operationId: string;
  idempotencyKey: string;
  correlationId: string;
};

function commandFor(kind: ConfirmationEditionBindingChangeKind) {
  if (kind === "bind") return "confirmation.edition_binding.bind";
  if (kind === "remove") return "confirmation.edition_binding.remove";
  return "confirmation.edition_editing.change";
}

function bindingTone(state: ConfirmationEditionBindingProjection["bindingState"]) {
  if (state === "linked") return "ready" as const;
  if (state === "stale") return "attention" as const;
  if (state === "conflict") return "blocked" as const;
  return "neutral" as const;
}

function EditionsPage() {
  const navigate = useNavigate();
  const { editionId } = useAdminContext();
  const reconcileOperation = useServerFn(reconcileSystemOperation);
  const [projection, setProjection] = useState<ConfirmationEditionBindingProjection | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<PendingChange | null>(null);
  const [receipt, setReceipt] = useState<ConfirmationEditionBindingReceipt | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (targetEditionId: string) => {
    const current = await loadConfirmationEditionBinding(targetEditionId);
    setProjection(current);
    return current;
  }, []);

  useEffect(() => {
    let alive = true;
    setPending(null);
    setReceipt(null);
    setError(null);

    if (!editionId) {
      setProjection(null);
      setLoading(false);
      return () => {
        alive = false;
      };
    }

    setLoading(true);
    void (async () => {
      try {
        const admin = await requireConfirmationsAdmin();
        if (!admin) {
          await navigate({ to: "/auth", search: { redirect: "/confirmations/admin/editions" } });
          return;
        }
        if (!alive) return;
        await refresh(editionId);
      } catch (caught) {
        if (alive) {
          setProjection(null);
          setError(caught instanceof Error ? caught.message : "Could not load edition binding.");
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [editionId, navigate, refresh]);

  async function prepareChange(
    kind: ConfirmationEditionBindingChangeKind,
    enabled: boolean | null = null,
  ) {
    if (!editionId || busy) return;
    setBusy(true);
    setError(null);
    try {
      const preview = await previewConfirmationEditionBindingChange({
        editionId,
        kind,
        enabled,
      });

      if (preview.blockers.length > 0) {
        const message = `This operation is blocked: ${preview.blockers.join(", ")}.`;
        setError(message);
        toast.error(message);
        return;
      }

      if (preview.alreadyApplied) {
        await refresh(editionId);
        toast.success(kind === "bind" ? "Edition binding is already current." : "That edition state is already current.");
        return;
      }

      const operation = createOrganisationCommand({
        command: commandFor(kind),
        riskClass: preview.riskClass,
        expectedVersion: preview.expectedVersion,
        scope: { editionId, entityId: editionId },
        payload: { editionId, changeKind: kind, enabled },
      });

      setPending({
        kind,
        enabled,
        preview,
        operationId: operation.operationId,
        idempotencyKey: operation.idempotencyKey,
        correlationId: operation.correlationId,
      });
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Edition change preview could not be loaded.";
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  async function applyPendingChange() {
    if (!pending || !editionId || busy || pending.preview.blockers.length > 0) return;
    const current = pending;
    setBusy(true);
    setError(null);

    try {
      const operationReceipt = await applyConfirmationEditionBindingChange({
        editionId,
        kind: current.kind,
        enabled: current.enabled,
        operationId: current.operationId,
        idempotencyKey: current.idempotencyKey,
        correlationId: current.correlationId,
        expectedVersion: current.preview.expectedVersion,
      });

      setReceipt(operationReceipt);
      setPending(null);
      await refresh(editionId);

      if (current.kind === "bind") toast.success("Delegation edition binding reconciled.");
      else if (current.kind === "remove") toast.success("Delegation edition binding removed.");
      else toast.success(current.enabled ? "Response editing opened." : "Response editing closed.");
    } catch (caught) {
      // The request may have committed even if the browser lost the response.
      // Reconcile the exact operation before offering a retry with the same key.
      try {
        const reconciled = await reconcileOperation({ data: { operationId: current.operationId } });
        if (reconciled.ok && reconciled.receipt.status === "succeeded") {
          setPending(null);
          await refresh(editionId);
          toast.success("Edition operation completed and was reconciled after the response was lost.");
          return;
        }
      } catch {
        // Preserve the original operation envelope in `pending`; a retry remains
        // idempotent and cannot duplicate the canonical mutation.
      }

      const message = caught instanceof Error ? caught.message : "Edition change could not be applied.";
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  const exactBindingAvailable = projection?.bindingState === "linked" || projection?.bindingState === "stale";

  return (
    <AdminPage>
      <div data-v3-confirmation-edition-binding="governed-versioned-operation">
        <AdminPageHeader
          eyebrow="Delegations"
          title="Edition link"
          description="Inspect and manage the Confirmation binding for the exact Organizer edition. Canonical identity, optimistic versioning, idempotency and receipts are enforced by the server."
          actions={
            <AdminMoreMenu label="Edition actions" title="Edition actions" description="Scoped controls for this exact Organizer edition.">
              <AdminActionItem
                icon={RefreshCw}
                title={busy ? "Checking binding…" : "Review binding reconciliation"}
                description="Create or refresh the canonical Confirmation binding without silently rebinding another edition."
                disabled={busy || loading || !editionId || projection?.bindingState === "conflict"}
                onClick={() => void prepareChange("bind")}
              />
            </AdminMoreMenu>
          }
        />

        {!editionId ? (
          <AdminCard>
            <AdminEmptyState
              title="Select an edition"
              description="Edition-link operations are explicitly scoped. Select the Organizer edition you intend to manage first."
            />
          </AdminCard>
        ) : loading ? (
          <AdminCard><p className="py-6 text-center text-sm text-muted-foreground">Loading canonical edition binding…</p></AdminCard>
        ) : error && !projection ? (
          <AdminCard><AdminEmptyState title="Edition binding unavailable" description={error} /></AdminCard>
        ) : projection ? (
          <div className="space-y-3">
            {error ? <AdminCard><p className="text-sm text-rose-200">{error}</p></AdminCard> : null}

            <AdminCard strong>
              <AdminCardHeader
                eyebrow={`SSC ${projection.editionNumber ?? "—"}`}
                title={projection.name}
                description={`${projection.roundCount} rounds · ${projection.responseCount} responses · state version ${projection.version}`}
                action={<AdminStatus tone={bindingTone(projection.bindingState)}>{projection.bindingState}</AdminStatus>}
              />

              {projection.blockers.length ? (
                <div className="mt-3 rounded-xl border border-rose-400/20 bg-rose-400/5 p-3 text-sm text-rose-100">
                  <p className="font-semibold">Binding conflict requires deliberate repair</p>
                  <p className="mt-1 text-xs text-rose-100/75">{projection.blockers.join(" · ")}. Solaris will not silently delete or rebind either identity.</p>
                </div>
              ) : null}

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-3">
                  <div className="flex items-center gap-2">
                    <Link2 className="size-4 text-muted-foreground" />
                    <p className="text-sm font-semibold text-foreground">Canonical binding</p>
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                    {projection.binding
                      ? `Confirmation identity ${projection.binding.remoteId} · ${projection.binding.syncStatus}`
                      : "No Confirmation edition binding exists for this edition."}
                  </p>
                  <button
                    type="button"
                    className="admin-action-secondary mt-3 w-full"
                    disabled={busy || projection.bindingState === "conflict"}
                    onClick={() => void prepareChange("bind")}
                  >
                    {projection.bindingState === "missing" ? "Review creating binding" : "Review binding reconciliation"}
                  </button>
                </div>

                <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <SlidersHorizontal className="size-4 text-muted-foreground" />
                      <p className="text-sm font-semibold text-foreground">Existing-response editing</p>
                    </div>
                    <AdminStatus tone={projection.editingEnabled ? "ready" : "neutral"}>{projection.editingEnabled ? "Open" : "Closed"}</AdminStatus>
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">Editing changes are bound to this exact edition and current state version. Stale reviewed operations are rejected.</p>
                  <button
                    type="button"
                    className="admin-action-secondary mt-3 w-full"
                    disabled={busy || !exactBindingAvailable}
                    onClick={() => void prepareChange("editing", !projection.editingEnabled)}
                  >
                    {projection.editingEnabled ? "Review closing response editing" : "Review opening response editing"}
                  </button>
                </div>
              </div>
            </AdminCard>

            {receipt ? (
              <AdminCard>
                <AdminCardHeader
                  eyebrow="Operation receipt"
                  title={receipt.status === "succeeded" ? "Authoritative change recorded" : `Operation ${receipt.status}`}
                  description={`Operation ${receipt.operationId}${receipt.result ? ` · state version ${receipt.result.version}` : ""}`}
                  action={<AdminStatus tone={receipt.status === "succeeded" ? "ready" : "attention"}>{receipt.status}</AdminStatus>}
                />
              </AdminCard>
            ) : null}
          </div>
        ) : null}

        <AdminConfirmSheet
          open={Boolean(pending)}
          onClose={busy ? () => undefined : () => setPending(null)}
          onConfirm={applyPendingChange}
          title={pending ? (
            pending.kind === "bind"
              ? `Reconcile SSC ${projection?.editionNumber ?? ""} Confirmation binding?`
              : `${pending.enabled ? "Open" : "Close"} existing-response editing for SSC ${projection?.editionNumber ?? ""}?`
          ) : "Review edition operation"}
          description={pending ? (
            <div className="space-y-2">
              <p><strong className="text-foreground">{projection?.name ?? "Selected edition"}</strong></p>
              <p>Expected state version: <strong className="text-foreground">{pending.preview.expectedVersion}</strong>. The server rechecks the edition, capability, binding identity and version after acquiring its lock.</p>
              {pending.kind === "bind" ? (
                <p>This creates or refreshes only the exact canonical binding. A conflicting Solaris or Confirmation identity fails closed instead of being deleted or silently rebound.</p>
              ) : (
                <p>Existing-response editing: <strong className="text-foreground">{pending.preview.editingEnabled ? "Open" : "Closed"}</strong> → <strong className="text-foreground">{pending.enabled ? "Open" : "Closed"}</strong>.</p>
              )}
              <p>Risk class: <strong className="text-foreground">{pending.preview.riskClass}</strong>. Retries reuse the same operation identity and idempotency key.</p>
            </div>
          ) : "Review the current authoritative state before applying."}
          confirmLabel={pending?.kind === "bind" ? "Apply binding reconciliation" : pending?.enabled ? "Open response editing" : "Close response editing"}
          confirmationText={pending?.kind === "editing" && pending.enabled ? `SSC ${projection?.editionNumber ?? ""}` : undefined}
          confirmationHint={pending?.kind === "editing" && pending.enabled ? `Type SSC ${projection?.editionNumber ?? ""} exactly to confirm wider editing access` : undefined}
          busy={busy}
          danger={Boolean(pending?.kind === "editing" && pending.enabled)}
        />
      </div>
    </AdminPage>
  );
}
