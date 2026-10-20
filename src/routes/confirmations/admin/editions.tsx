import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { RefreshCw, ShieldCheck, SlidersHorizontal, Unlink } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { useAdminContext } from "@/components/admin/AdminContext";
import { AdminPage } from "@/components/admin/AdminShell";
import {
  AdminActionItem,
  AdminCard,
  AdminCardHeader,
  AdminConfirmSheet,
  AdminMoreMenu,
  AdminPageHeader,
  AdminStatus,
} from "@/components/admin/AdminUI";
import { requireConfirmationsAdmin } from "@/integrations/confirmations/admin";
import {
  applyConfirmationEditionEditing,
  applyConfirmationEditionLinkRepair,
  loadConfirmationEditionAuthority,
  previewConfirmationEditionEditing,
  previewConfirmationEditionLinkRepair,
  type ConfirmationEditionAuthoritySnapshot,
  type ConfirmationEditionEditingPreview,
  type ConfirmationEditionLinkPreview,
} from "@/lib/v3-confirmation-edition-authority";

export const Route = createFileRoute("/confirmations/admin/editions")({
  head: () => ({
    meta: [
      { title: "Delegation Editions — Solaris Studio" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: EditionsPage,
});

function bindingTone(state: ConfirmationEditionAuthoritySnapshot["bindingState"]) {
  if (state === "linked") return "ready" as const;
  if (state === "missing" || state === "stale") return "attention" as const;
  return "blocked" as const;
}

function bindingLabel(state: ConfirmationEditionAuthoritySnapshot["bindingState"]) {
  if (state === "linked") return "Linked";
  if (state === "missing") return "Binding missing";
  if (state === "stale") return "Binding stale";
  return "Binding conflict";
}

function EditionsPage() {
  const navigate = useNavigate();
  const { editionId, editionLabel } = useAdminContext();
  const [snapshot, setSnapshot] = useState<ConfirmationEditionAuthoritySnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingLink, setPendingLink] = useState<ConfirmationEditionLinkPreview | null>(null);
  const [pendingEditing, setPendingEditing] = useState<ConfirmationEditionEditingPreview | null>(null);
  const [reviewBusy, setReviewBusy] = useState(false);
  const [applyBusy, setApplyBusy] = useState(false);

  const refresh = useCallback(async () => {
    setError(null);
    if (!editionId) {
      setSnapshot(null);
      setLoading(false);
      return null;
    }

    setLoading(true);
    try {
      const next = await loadConfirmationEditionAuthority(editionId);
      setSnapshot(next);
      return next;
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Could not load edition authority.";
      setSnapshot(null);
      setError(message);
      throw caught;
    } finally {
      setLoading(false);
    }
  }, [editionId]);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const admin = await requireConfirmationsAdmin();
        if (!admin) {
          await navigate({
            to: "/auth",
            search: { redirect: "/confirmations/admin/editions" },
          });
          return;
        }
        if (!alive) return;
        await refresh();
      } catch {
        // refresh() owns the visible error state.
      }
    })();

    return () => {
      alive = false;
    };
  }, [navigate, refresh]);

  useEffect(() => {
    setPendingLink(null);
    setPendingEditing(null);
  }, [editionId]);

  async function reviewLinkRepair() {
    if (!editionId || reviewBusy) return;
    setReviewBusy(true);
    try {
      const preview = await previewConfirmationEditionLinkRepair(editionId);
      if (preview.blockers.length) {
        toast.error(preview.blockers[0]);
        await refresh();
        return;
      }
      if (preview.alreadyApplied) {
        toast.success("Confirmation edition binding is already authoritative");
        await refresh();
        return;
      }
      setPendingLink(preview);
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Could not review edition binding.");
    } finally {
      setReviewBusy(false);
    }
  }

  async function applyLinkRepair() {
    if (!pendingLink || applyBusy) return;
    setApplyBusy(true);
    try {
      const result = await applyConfirmationEditionLinkRepair(pendingLink);
      toast.success(result.replayed ? "Edition binding reconciled from receipt" : "Edition binding reconciled");
      setPendingLink(null);
      await refresh();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Edition binding could not be reconciled.");
      await refresh().catch(() => null);
      setPendingLink(null);
    } finally {
      setApplyBusy(false);
    }
  }

  async function reviewEditing(targetEnabled: boolean) {
    if (!editionId || reviewBusy) return;
    setReviewBusy(true);
    try {
      const preview = await previewConfirmationEditionEditing(editionId, targetEnabled);
      if (preview.blockers.length) {
        toast.error(preview.blockers[0]);
        await refresh();
        return;
      }
      if (preview.alreadyApplied) {
        toast.success(targetEnabled ? "Response editing is already open" : "Response editing is already closed");
        await refresh();
        return;
      }
      setPendingEditing(preview);
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Could not review response editing.");
    } finally {
      setReviewBusy(false);
    }
  }

  async function applyEditingChange() {
    if (!pendingEditing || applyBusy) return;
    setApplyBusy(true);
    try {
      const result = await applyConfirmationEditionEditing(pendingEditing);
      toast.success(
        result.replayed
          ? "Response-editing result recovered from receipt"
          : pendingEditing.targetEditingEnabled
            ? "Response editing opened"
            : "Response editing closed",
      );
      setPendingEditing(null);
      await refresh();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Response editing could not be changed.");
      await refresh().catch(() => null);
      setPendingEditing(null);
    } finally {
      setApplyBusy(false);
    }
  }

  const editionNumber = snapshot?.edition.editionNumber;
  const editionName = snapshot?.edition.name ?? editionLabel ?? "Selected edition";
  const exactEditionLabel = editionNumber ? `SSC ${editionNumber}` : editionName;

  return (
    <AdminPage>
      <AdminPageHeader
        eyebrow="Delegations"
        title="Edition authority"
        description="Inspect and operate the exact Organizer edition context. Confirmation bindings and edition-wide response editing are server-authoritative, versioned, idempotent and receipted."
        actions={
          <AdminMoreMenu
            label="Edition actions"
            title="Edition actions"
            description="Exact-context Confirmation authority controls."
          >
            <AdminActionItem
              icon={RefreshCw}
              title={loading ? "Refreshing…" : "Refresh authority"}
              description="Re-read the selected edition, binding, counts and authoritative revision."
              disabled={loading || !editionId}
              onClick={() => void refresh().catch(() => null)}
            />
          </AdminMoreMenu>
        }
      />

      {!editionId ? (
        <AdminCard>
          <AdminCardHeader
            eyebrow="Context required"
            title="Select an Organizer edition"
            description="This surface deliberately has no active/newest-edition fallback. Choose the exact edition in the Organizer context selector first."
          />
        </AdminCard>
      ) : null}

      {error ? (
        <AdminCard>
          <p className="text-sm text-rose-200">{error}</p>
        </AdminCard>
      ) : null}

      {editionId && loading ? (
        <AdminCard>
          <p className="py-6 text-center text-sm text-muted-foreground">Loading exact edition authority…</p>
        </AdminCard>
      ) : null}

      {snapshot && !loading ? (
        <div className="space-y-3">
          <AdminCard className="!p-4">
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-bold text-foreground">{exactEditionLabel}</h2>
                  <AdminStatus tone="info">{snapshot.edition.status}</AdminStatus>
                  <AdminStatus tone={bindingTone(snapshot.bindingState)}>
                    {bindingLabel(snapshot.bindingState)}
                  </AdminStatus>
                </div>
                <p className="mt-1 truncate text-sm font-semibold text-foreground">{editionName}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {snapshot.roundCount} rounds · {snapshot.responseCount} responses · authority revision {snapshot.stateVersion}
                </p>
              </div>
              {snapshot.bindingValid ? (
                <ShieldCheck className="mt-1 size-5 shrink-0 text-emerald-300" aria-hidden="true" />
              ) : (
                <Unlink className="mt-1 size-5 shrink-0 text-amber-300" aria-hidden="true" />
              )}
            </div>

            <div className="mt-4 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
              <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-3">
                <span className="block text-[10px] font-semibold uppercase tracking-[0.12em]">Solaris edition</span>
                <strong className="mt-1 block break-all text-foreground">{snapshot.edition.id}</strong>
              </div>
              <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-3">
                <span className="block text-[10px] font-semibold uppercase tracking-[0.12em]">Confirmation identity</span>
                <strong className="mt-1 block break-all text-foreground">
                  {snapshot.binding?.remoteId ?? "No authoritative binding"}
                </strong>
              </div>
            </div>

            {snapshot.bindingState !== "linked" ? (
              <div className="mt-4 rounded-xl border border-amber-300/20 bg-amber-300/[0.05] p-3">
                <p className="text-sm font-semibold text-amber-100">Binding needs intervention</p>
                <p className="mt-1 text-xs leading-relaxed text-amber-100/75">
                  {snapshot.bindingState === "conflict"
                    ? "A reverse identity conflict exists. Solaris will fail closed rather than delete or silently rebind historical identity."
                    : "The governed repair preserves any existing legacy remote identity and changes only missing or stale binding authority."}
                </p>
                <button
                  type="button"
                  className="admin-action-secondary mt-3 w-full"
                  disabled={reviewBusy || applyBusy || snapshot.bindingState === "conflict"}
                  onClick={() => void reviewLinkRepair()}
                >
                  {reviewBusy ? "Reviewing…" : "Review binding repair"}
                </button>
              </div>
            ) : null}
          </AdminCard>

          <AdminCard className="!p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">Existing-response editing</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  This is edition-wide access for already submitted Confirmation responses. Apply rechecks the exact binding and authority revision on the server.
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <SlidersHorizontal className="size-4 text-muted-foreground" aria-hidden="true" />
                <AdminStatus tone={snapshot.edition.editingEnabled ? "ready" : "neutral"}>
                  {snapshot.edition.editingEnabled ? "Open" : "Closed"}
                </AdminStatus>
              </div>
            </div>

            <button
              type="button"
              className="admin-action-secondary mt-3 w-full"
              disabled={!snapshot.bindingValid || reviewBusy || applyBusy}
              onClick={() => void reviewEditing(!snapshot.edition.editingEnabled)}
            >
              {snapshot.edition.editingEnabled
                ? "Review closing response editing"
                : "Review opening response editing"}
            </button>
          </AdminCard>
        </div>
      ) : null}

      <AdminConfirmSheet
        open={Boolean(pendingLink)}
        onClose={applyBusy ? () => undefined : () => setPendingLink(null)}
        onConfirm={applyLinkRepair}
        title={`Repair Confirmation binding for ${exactEditionLabel}?`}
        description={pendingLink ? (
          <div className="space-y-2">
            <p><strong className="text-foreground">{exactEditionLabel} · {pendingLink.edition.name}</strong></p>
            <p>Binding: <strong className="text-foreground">{bindingLabel(pendingLink.bindingState)}</strong> → <strong className="text-foreground">Linked</strong>.</p>
            <p>Authority revision <strong className="text-foreground">{pendingLink.stateVersion}</strong> will be checked again at apply time.</p>
            <p>{pendingLink.willCreateBinding ? "No binding exists, so Solaris will create one for this exact edition." : "Solaris will repair stale binding fields while preserving the existing legacy Confirmation remote identity."}</p>
            <p>The server refuses reverse/cross-edition rebinding instead of deleting conflicting history.</p>
          </div>
        ) : "Review the exact edition binding before applying."}
        confirmLabel="Apply binding repair"
        busy={applyBusy}
      />

      <AdminConfirmSheet
        open={Boolean(pendingEditing)}
        onClose={applyBusy ? () => undefined : () => setPendingEditing(null)}
        onConfirm={applyEditingChange}
        title={pendingEditing
          ? `${pendingEditing.targetEditingEnabled ? "Open" : "Close"} existing-response editing for ${exactEditionLabel}?`
          : "Review response editing"}
        description={pendingEditing ? (
          <div className="space-y-2">
            <p><strong className="text-foreground">{exactEditionLabel} · {pendingEditing.edition.name}</strong></p>
            <p>
              Existing-response editing: <strong className="text-foreground">{pendingEditing.currentEditingEnabled ? "Open" : "Closed"}</strong> → <strong className="text-foreground">{pendingEditing.targetEditingEnabled ? "Open" : "Closed"}</strong>.
            </p>
            <p>Binding <strong className="text-foreground">{pendingEditing.expectedRemoteId}</strong> and authority revision <strong className="text-foreground">{pendingEditing.stateVersion}</strong> are both apply-time preconditions.</p>
            {pendingEditing.requiresFreshAuth ? (
              <p className="text-amber-100">No Confirmation round is currently open. Reopening edition-wide editing is therefore R3 and the server requires authentication from the last five minutes.</p>
            ) : null}
            <p>Successful changes produce a durable operation receipt, audit evidence and a canonical Confirmation window event for task/notification reconciliation.</p>
          </div>
        ) : "Review the current editing state before applying."}
        confirmLabel={pendingEditing?.targetEditingEnabled ? "Open response editing" : "Close response editing"}
        confirmationText={pendingEditing?.targetEditingEnabled ? exactEditionLabel : undefined}
        confirmationHint={pendingEditing?.targetEditingEnabled ? `Type ${exactEditionLabel} exactly to confirm wider editing access` : undefined}
        busy={applyBusy}
        danger={Boolean(pendingEditing?.targetEditingEnabled)}
      />
    </AdminPage>
  );
}
