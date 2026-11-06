import { LockKeyhole, ShieldAlert } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { confirmationsSupabase } from "@/integrations/confirmations/client";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { AdminConfirmSheet, AdminSheet, AdminStatus } from "./AdminUI";
import {
  assertOrganizerConfirmationAccessScope,
  type OrganizerConfirmationAccessScope,
} from "@/lib/v3-organizer-confirmation-access-scope";

type ConfirmationAccessSnapshot = {
  editingAllowed: boolean;
  locked: boolean;
  adminNotes: string;
};

type PendingAccessReview = {
  baseline: ConfirmationAccessSnapshot;
  next: ConfirmationAccessSnapshot;
  scope: OrganizerConfirmationAccessScope;
};

export function ConfirmationAccessSettingsSheet({
  open,
  onClose,
  onApplied,
  submissionId,
  editionId,
  roundId,
  responseUpdatedAt,
  isScopeCurrent,
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
  submissionId: string;
  editionId: string;
  roundId: string;
  responseUpdatedAt: string;
  isScopeCurrent: () => boolean;
  country: string;
  editionLabel: string;
  roundName: string;
  editingAllowed: boolean;
  locked: boolean;
  adminNotes: string | null;
}) {
  const [draftEditingAllowed, setDraftEditingAllowed] = useState(editingAllowed);
  const [draftLocked, setDraftLocked] = useState(locked);
  const [draftNotes, setDraftNotes] = useState(adminNotes ?? "");
  const [pendingReview, setPendingReview] = useState<PendingAccessReview | null>(null);
  const [saving, setSaving] = useState(false);
  const saveInFlightRef = useRef(false);

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
    if (saveInFlightRef.current || saving) return;
    if (!isScopeCurrent() || !editionId || !roundId || !responseUpdatedAt) {
      toast.error("Confirmation edition or response changed. Reload before reviewing access controls.");
      return;
    }
    if (!controlsChanged) {
      toast.message("No response-setting changes to review.");
      return;
    }
    setPendingReview({
      baseline: currentSnapshot,
      next: draftSnapshot,
      scope: { submissionId, editionId, roundId, updatedAt: responseUpdatedAt },
    });
  };

  const closeSettingsSafely = () => {
    if (saving || saveInFlightRef.current) return;
    onClose();
  };

  const closeReview = () => {
    if (saving || saveInFlightRef.current) return;
    setPendingReview(null);
  };

  const applyReviewedSettings = async () => {
    if (!pendingReview || saving || saveInFlightRef.current) return;

    // A synchronous lock is essential for this legacy non-receipted RPC:
    // rapid confirmations must not dispatch concurrent access mutations.
    saveInFlightRef.current = true;
    setSaving(true);
    try {
      if (!isScopeCurrent()) {
        throw new Error("Organizer response context changed. No Confirmation controls were applied.");
      }
      assertOrganizerConfirmationAccessScope(pendingReview.scope, {
        submissionId, editionId, roundId, updatedAt: responseUpdatedAt,
      });
      // The legacy id-only detail RPC may return private cross-edition data
      // before a client-side guard can run. Scope the read at the server.
      const { data: liveData, error: liveError } = await confirmationsSupabase.rpc(
        "admin_confirmation_response_for_edition",
        {
          _edition_id: pendingReview.scope.editionId,
          _submission_id: pendingReview.scope.submissionId,
        },
      );
      if (liveError) throw liveError;

      const live = liveData as unknown as {
        id?: string;
        edition?: { id?: string | null } | null;
        round?: { id?: string | null } | null;
        updated_at?: string | null;
        editing_allowed?: boolean;
        locked?: boolean;
        admin_notes?: string | null;
      } | null;
      if (!live) {
        throw new Error("The Confirmation response is no longer available. Nothing was changed.");
      }

      if (!isScopeCurrent()) {
        throw new Error("Organizer response context changed while checking Confirmation access. Nothing was changed.");
      }
      assertOrganizerConfirmationAccessScope(pendingReview.scope, {
        submissionId: live.id ?? "",
        editionId: live.edition?.id ?? "",
        roundId: live.round?.id ?? "",
        updatedAt: live.updated_at ?? "",
      });
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

      if (!isScopeCurrent()) {
        throw new Error("Organizer response context changed before Confirmation settings apply. Nothing was changed.");
      }
      const { error: updateError } = await confirmationsSupabase.rpc(
        "admin_update_confirmation_controls",
        {
          _submission_id: submissionId,
          _editing_allowed: pendingReview.next.editingAllowed,
          _locked: pendingReview.next.locked,
          _admin_notes: pendingReview.next.adminNotes,
        },
      );
      if (updateError) throw updateError;
      if (!isScopeCurrent()) {
        toast.warning("Response settings may have changed for a previously displayed edition. Verify its canonical state.");
        return;
      }

      setPendingReview(null);
      toast.success("Response settings saved");
      await onApplied();
      onClose();
    } catch (caught) {
      setPendingReview(null);
      toast.error(caught instanceof Error ? caught.message : "Could not save response settings.");
      if (isScopeCurrent()) await onApplied();
    } finally {
      saveInFlightRef.current = false;
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
        onClose={closeSettingsSafely}
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
              onClick={closeSettingsSafely}
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
              Organizer re-fetches the exact Confirmation submission, edition, round and updated timestamp immediately before apply, rejecting any changed review baseline. The underlying legacy control RPC still does not provide atomic expected-version/CAS, idempotency or operation-receipt parity; a concurrent write after preflight remains a System-owned risk.
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
