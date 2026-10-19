import { LockKeyhole, ShieldAlert } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { loadConfirmationResponseForEdition } from "@/integrations/confirmations/scoped-admin-reads";
import {
  applyConfirmationResponseAccess,
  previewConfirmationResponseAction,
} from "@/integrations/confirmations/response-commands";
import { createOrganisationCommand } from "@/lib/organisation-operation-contract";
import { reconcileSystemOperation } from "@/lib/system-operation.functions";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { AdminConfirmSheet, AdminSheet, AdminStatus } from "./AdminUI";

type ConfirmationAccessSnapshot = {
  editingAllowed: boolean;
  locked: boolean;
  adminNotes: string;
};

type PendingAccessReview = {
  baseline: ConfirmationAccessSnapshot;
  next: ConfirmationAccessSnapshot;
};

type LiveResponseAccess = {
  editing_allowed?: boolean;
  locked?: boolean;
  admin_notes?: string | null;
};

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

  useEffect(() => {
    if (!open || pendingReview || saving) return;
    setDraftEditingAllowed(editingAllowed);
    setDraftLocked(locked);
    setDraftNotes(adminNotes ?? "");
  }, [adminNotes, editingAllowed, locked, open, pendingReview, saving]);

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
    draftEditingAllowed !== editingAllowed ||
    draftLocked !== locked ||
    notesChanged;

  const openReview = () => {
    if (!controlsChanged) {
      toast.message("No response-setting changes to review.");
      return;
    }
    setPendingReview({
      baseline: currentSnapshot,
      next: draftSnapshot,
    });
  };

  const closeReview = () => {
    if (saving) return;
    setPendingReview(null);
  };

  const applyReviewedSettings = async () => {
    if (!pendingReview || saving) return;

    setSaving(true);
    let operationId: string | null = null;
    try {
      // Preview owns the canonical response version. Reading the exact-edition
      // response after preview lets us compare the reviewed private-note state;
      // any change after preview still invalidates the expected version at apply.
      const preview = await previewConfirmationResponseAction({
        editionId,
        submissionId,
        action: "access_update",
      });
      const live = await loadConfirmationResponseForEdition<LiveResponseAccess>(
        editionId,
        submissionId,
      );

      const liveNotes = live.admin_notes ?? "";
      if (
        live.editing_allowed !== pendingReview.baseline.editingAllowed ||
        live.locked !== pendingReview.baseline.locked ||
        liveNotes !== pendingReview.baseline.adminNotes
      ) {
        throw new Error(
          "Response settings changed while this review was open. Nothing was changed. Reload the response and review the latest access state before applying anything.",
        );
      }
      if (preview.blockers.length > 0) {
        throw new Error(preview.blockers.join(" "));
      }

      const command = createOrganisationCommand({
        command: "confirmation.response.access.update",
        riskClass: "R2",
        scope: { editionId, entityId: submissionId },
        payload: {
          editingAllowed: pendingReview.next.editingAllowed,
          locked: pendingReview.next.locked,
          adminNotes: pendingReview.next.adminNotes,
        },
        expectedVersion: preview.expectedVersion,
      });
      operationId = command.operationId;

      try {
        await applyConfirmationResponseAccess({
          editionId,
          submissionId,
          editingAllowed: pendingReview.next.editingAllowed,
          locked: pendingReview.next.locked,
          adminNotes: pendingReview.next.adminNotes,
          operationId: command.operationId,
          idempotencyKey: command.idempotencyKey,
          expectedVersion: preview.expectedVersion,
        });
      } catch (caught) {
        const reconciliation = await reconcileOperation({
          data: { operationId: command.operationId },
        });
        if (!reconciliation.ok || reconciliation.receipt.status !== "succeeded") {
          throw caught;
        }
      }

      setPendingReview(null);
      toast.success("Response settings saved", {
        description: operationId ? `Operation ${operationId.slice(0, 8)} confirmed` : undefined,
      });
      await onApplied();
      onClose();
    } catch (caught) {
      setPendingReview(null);
      toast.error(caught instanceof Error ? caught.message : "Could not save response settings.");
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
        onClose={saving ? () => undefined : onClose}
        title="Response settings"
        description="These controls affect delegation access. Review consequential access changes before applying them."
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
              disabled={saving}
              onClick={onClose}
              className="admin-action-secondary"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={saving || !controlsChanged}
              onClick={openReview}
              className="admin-action-primary"
            >
              <LockKeyhole className="size-4" /> Review settings change
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
              Solaris binds this apply to the exact Organizer edition and canonical response version. A concurrent response, access or token change rejects the command instead of overwriting newer state; uncertain outcomes reconcile from the operation receipt.
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
