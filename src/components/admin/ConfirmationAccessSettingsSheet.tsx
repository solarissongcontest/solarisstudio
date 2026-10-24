import { LockKeyhole, ShieldAlert } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { reconcileSystemOperation } from "@/lib/system-operation.functions";
import { toSystemError } from "@/lib/system-error";
import {
  applyConfirmationResponseAccessChange,
  assertConfirmationResponseAccessScope,
  confirmationResponseAccessErrorMessage,
  createConfirmationResponseAccessCommand,
  previewConfirmationResponseAccess,
  type ConfirmationResponseAccessPreview,
} from "@/lib/v3-organizer-confirmation-response-access";
import { AdminConfirmSheet, AdminSheet, AdminStatus } from "./AdminUI";

type ConfirmationAccessSnapshot = {
  editingAllowed: boolean;
  locked: boolean;
  adminNotes: string;
};

type PendingAccessReview = {
  baseline: ConfirmationAccessSnapshot;
  next: ConfirmationAccessSnapshot;
  preview: ConfirmationResponseAccessPreview;
  command: ReturnType<typeof createConfirmationResponseAccessCommand>;
};

function previewSnapshot(preview: ConfirmationResponseAccessPreview): ConfirmationAccessSnapshot {
  return {
    editingAllowed: preview.state.editingAllowed,
    locked: preview.state.locked,
    adminNotes: preview.state.adminNotes ?? "",
  };
}

function sameSnapshot(left: ConfirmationAccessSnapshot, right: ConfirmationAccessSnapshot) {
  return (
    left.editingAllowed === right.editingAllowed &&
    left.locked === right.locked &&
    left.adminNotes === right.adminNotes
  );
}

export function ConfirmationAccessSettingsSheet({
  open,
  onClose,
  onApplied,
  editionId,
  submissionId,
  country,
  editionLabel,
  roundName,
  editingAllowed,
  locked,
  adminNotes,
}: {
  open: boolean;
  onClose: () => void;
  onApplied: () => Promise<void> | void;
  editionId: string;
  submissionId: string;
  country: string;
  editionLabel: string;
  roundName: string;
  editingAllowed: boolean;
  locked: boolean;
  adminNotes: string | null;
}) {
  const reconcileOperation = useServerFn(reconcileSystemOperation);
  const [draftEditingAllowed, setDraftEditingAllowed] = useState(editingAllowed);
  const [draftLocked, setDraftLocked] = useState(locked);
  const [draftNotes, setDraftNotes] = useState(adminNotes ?? "");
  const [pendingReview, setPendingReview] = useState<PendingAccessReview | null>(null);
  const [saving, setSaving] = useState(false);
  const [preparing, setPreparing] = useState(false);

  useEffect(() => {
    if (!open || pendingReview || saving || preparing) return;
    setDraftEditingAllowed(editingAllowed);
    setDraftLocked(locked);
    setDraftNotes(adminNotes ?? "");
  }, [adminNotes, editingAllowed, locked, open, pendingReview, preparing, saving]);

  const currentSnapshot = useMemo<ConfirmationAccessSnapshot>(
    () => ({
      editingAllowed,
      locked,
      adminNotes: adminNotes ?? "",
    }),
    [adminNotes, editingAllowed, locked],
  );

  const draftSnapshot = useMemo<ConfirmationAccessSnapshot>(
    () => ({
      editingAllowed: draftEditingAllowed,
      locked: draftLocked,
      adminNotes: draftNotes,
    }),
    [draftEditingAllowed, draftLocked, draftNotes],
  );

  const accessBefore = editingAllowed && !locked;
  const accessAfter = draftEditingAllowed && !draftLocked;
  const notesChanged = draftNotes !== (adminNotes ?? "");
  const controlsChanged =
    draftEditingAllowed !== editingAllowed || draftLocked !== locked || notesChanged;

  const openReview = async () => {
    if (!controlsChanged || preparing) {
      if (!controlsChanged) toast.message("No response-setting changes to review.");
      return;
    }

    setPreparing(true);
    try {
      const preview = await previewConfirmationResponseAccess(editionId, submissionId);
      assertConfirmationResponseAccessScope(preview, editionId, submissionId);
      const canonicalBaseline = previewSnapshot(preview);
      if (!sameSnapshot(canonicalBaseline, currentSnapshot)) {
        throw new Error(
          "Response settings changed before review. Nothing was changed. Reload the latest access state before applying anything.",
        );
      }
      if (draftSnapshot.editingAllowed && draftSnapshot.locked) {
        throw new Error("A response cannot be both editable and locked.");
      }
      if (
        draftSnapshot.editingAllowed &&
        (!preview.state.roundEditingEnabled || !preview.state.editionEditingEnabled)
      ) {
        throw new Error(
          "Delegation editing cannot be opened because the current Confirmation round or edition is not open for editing.",
        );
      }

      const command = createConfirmationResponseAccessCommand({
        preview,
        changeKind: "update_access",
        payload: {
          editingAllowed: draftSnapshot.editingAllowed,
          locked: draftSnapshot.locked,
          adminNotes: draftSnapshot.adminNotes,
        },
      });
      setPendingReview({
        baseline: canonicalBaseline,
        next: draftSnapshot,
        preview,
        command,
      });
    } catch (caught) {
      toast.error(confirmationResponseAccessErrorMessage(caught));
      await onApplied();
    } finally {
      setPreparing(false);
    }
  };

  const closeReview = () => {
    if (saving) return;
    setPendingReview(null);
  };

  async function recoverReviewedOperation(operationId: string) {
    const reconciliation = await reconcileOperation({ data: { operationId } });
    if (!reconciliation.ok) return false;
    if (reconciliation.receipt.status === "succeeded") {
      toast.success("Response settings confirmed after reconnecting");
      return true;
    }
    if (reconciliation.receipt.status === "failed") {
      throw new Error(
        reconciliation.receipt.error?.message ?? "The reviewed response-settings operation failed.",
      );
    }
    throw new Error(
      "The response-settings operation is still processing. Reconcile the same operation before making another change.",
    );
  }

  const applyReviewedSettings = async () => {
    if (!pendingReview || saving) return;

    setSaving(true);
    try {
      const livePreview = await previewConfirmationResponseAccess(editionId, submissionId);
      assertConfirmationResponseAccessScope(livePreview, editionId, submissionId);
      if (
        livePreview.expectedVersion !== pendingReview.preview.expectedVersion ||
        !sameSnapshot(previewSnapshot(livePreview), pendingReview.baseline)
      ) {
        throw new Error(
          "Response settings changed while this review was open. Nothing was changed. Reload and review the latest canonical response state.",
        );
      }

      try {
        await applyConfirmationResponseAccessChange({
          preview: pendingReview.preview,
          changeKind: "update_access",
          payload: {
            editingAllowed: pendingReview.next.editingAllowed,
            locked: pendingReview.next.locked,
            adminNotes: pendingReview.next.adminNotes,
          },
          operationId: pendingReview.command.operationId,
          idempotencyKey: pendingReview.command.idempotencyKey,
        });
      } catch (caught) {
        const systemError = toSystemError(caught);
        if (
          !systemError.retryable ||
          !(await recoverReviewedOperation(pendingReview.command.operationId))
        ) {
          throw caught;
        }
      }

      setPendingReview(null);
      toast.success("Response settings saved");
      await onApplied();
      onClose();
    } catch (caught) {
      setPendingReview(null);
      toast.error(confirmationResponseAccessErrorMessage(caught));
      await onApplied();
    } finally {
      setSaving(false);
    }
  };

  const reviewedAccessBefore = pendingReview
    ? pendingReview.baseline.editingAllowed && !pendingReview.baseline.locked
    : accessBefore;
  const reviewedAccessAfter = pendingReview
    ? pendingReview.next.editingAllowed && !pendingReview.next.locked
    : accessAfter;
  const accessChanges = reviewedAccessBefore !== reviewedAccessAfter;
  const reviewedNotesChanged = pendingReview
    ? pendingReview.next.adminNotes !== pendingReview.baseline.adminNotes
    : notesChanged;

  return (
    <>
      <AdminSheet
        open={open}
        onClose={saving || preparing ? () => undefined : onClose}
        title="Response settings"
        description="These controls affect delegation access. Review consequential access changes against canonical Confirmation state before applying them."
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-3 text-xs text-muted-foreground">
            <p className="font-semibold text-foreground">{country}</p>
            <p className="mt-1">{editionLabel} · {roundName}</p>
            <p className="mt-1 break-all">Submission ID: {submissionId}</p>
          </div>

          <label className="flex min-h-14 items-center justify-between gap-3 rounded-xl border border-white/[0.08] bg-white/[0.025] p-3">
            <span>
              <span className="block text-sm font-semibold">Allow editing</span>
              <span className="mt-1 block text-xs text-muted-foreground">
                The delegation can update this response only when editing is allowed and the response is not locked.
              </span>
            </span>
            <Switch checked={draftEditingAllowed} onCheckedChange={setDraftEditingAllowed} />
          </label>

          <label className="flex min-h-14 items-center justify-between gap-3 rounded-xl border border-white/[0.08] bg-white/[0.025] p-3">
            <span>
              <span className="block text-sm font-semibold">Lock response</span>
              <span className="mt-1 block text-xs text-muted-foreground">
                Blocks delegation changes until unlocked, even if editing is otherwise allowed.
              </span>
            </span>
            <Switch checked={draftLocked} onCheckedChange={setDraftLocked} />
          </label>

          <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold">Effective delegation editing</p>
                <p className="mt-1 text-xs text-muted-foreground">Derived from both access controls above.</p>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <AdminStatus tone={accessBefore ? "ready" : "neutral"}>{accessBefore ? "Open now" : "Closed now"}</AdminStatus>
                <span className="text-muted-foreground">→</span>
                <AdminStatus tone={accessAfter ? "attention" : "neutral"}>{accessAfter ? "Will be open" : "Will be closed"}</AdminStatus>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="admin-notes">Private organiser notes</Label>
            <Textarea
              id="admin-notes"
              rows={6}
              value={draftNotes}
              onChange={(event) => setDraftNotes(event.target.value)}
              placeholder="Notes visible only to organisers…"
            />
            <p className="text-[11px] text-muted-foreground">
              The review only states whether private notes changed; it does not repeat their contents.
            </p>
          </div>

          <div className="admin-sticky-actions grid grid-cols-[auto_1fr] gap-2">
            <button
              type="button"
              disabled={saving || preparing}
              onClick={onClose}
              className="admin-action-secondary"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={saving || preparing || !controlsChanged}
              onClick={() => void openReview()}
              className="admin-action-primary"
            >
              <LockKeyhole className="size-4" /> {preparing ? "Preparing…" : "Review settings change"}
            </button>
          </div>
        </div>
      </AdminSheet>

      <AdminConfirmSheet
        open={Boolean(pendingReview)}
        onClose={closeReview}
        onConfirm={applyReviewedSettings}
        title={`Apply ${country}'s response settings?`}
        description={
          <div className="space-y-3">
            <p>
              Review the exact access transition for <strong className="text-foreground">{country}</strong> before applying it.
            </p>
            <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-3 text-xs">
              <p><span className="font-semibold text-foreground">Context:</span> {editionLabel} · {roundName}</p>
              <p className="mt-1 break-all"><span className="font-semibold text-foreground">Submission ID:</span> {submissionId}</p>
              <p className="mt-1"><span className="font-semibold text-foreground">Risk:</span> R2 · response version {pendingReview?.preview.expectedVersion ?? "—"}</p>
              <p className="mt-1 break-all"><span className="font-semibold text-foreground">Operation:</span> {pendingReview?.command.operationId ?? "—"}</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="rounded-lg border border-white/[0.07] p-2">
                  <p className="font-semibold text-foreground">Before</p>
                  <p className="mt-1">Allow editing: {pendingReview?.baseline.editingAllowed ? "Yes" : "No"}</p>
                  <p>Locked: {pendingReview?.baseline.locked ? "Yes" : "No"}</p>
                  <p>Effective editing: {reviewedAccessBefore ? "Open" : "Closed"}</p>
                </div>
                <div className="rounded-lg border border-white/[0.07] p-2">
                  <p className="font-semibold text-foreground">After</p>
                  <p className="mt-1">Allow editing: {pendingReview?.next.editingAllowed ? "Yes" : "No"}</p>
                  <p>Locked: {pendingReview?.next.locked ? "Yes" : "No"}</p>
                  <p>Effective editing: {reviewedAccessAfter ? "Open" : "Closed"}</p>
                </div>
              </div>
            </div>
            {accessChanges ? (
              <div className="flex items-start gap-2 rounded-xl border border-amber-200/15 bg-amber-200/[0.045] p-3 text-xs text-amber-50/90">
                <ShieldAlert className="mt-0.5 size-4 shrink-0" />
                <p>
                  This changes whether the delegation can edit the response. Type the country name exactly before applying it.
                </p>
              </div>
            ) : null}
            <p className="text-xs text-muted-foreground">
              Private organiser notes: {reviewedNotesChanged ? "changed" : "unchanged"}. Their contents are intentionally not repeated here.
            </p>
            <p className="text-xs text-muted-foreground">
              Apply is bound to the exact canonical response version shown above. Solaris rechecks that version immediately before commit and reconciles the same operation receipt after an uncertain network outcome instead of issuing a second write.
            </p>
          </div>
        }
        confirmLabel="Apply reviewed settings"
        confirmationText={accessChanges ? country : undefined}
        confirmationHint={accessChanges ? `Type ${country} exactly to confirm the delegation access change` : undefined}
        busy={saving}
      />
    </>
  );
}
