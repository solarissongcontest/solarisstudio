import { Copy, ExternalLink, Link2, RefreshCw, ShieldAlert, Trash2 } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { reconcileSystemOperation } from "@/lib/system-operation.functions";
import { toSystemError } from "@/lib/system-error";
import {
  applyConfirmationResponseAccessChange,
  assertConfirmationResponseAccessScope,
  confirmationResponseAccessErrorMessage,
  createConfirmationResponseAccessCommand,
  previewConfirmationResponseAccess,
  reauthenticateConfirmationResponseR3,
  type ConfirmationResponseAccessPreview,
} from "@/lib/v3-organizer-confirmation-response-access";
import { AdminCard, AdminCardHeader, AdminConfirmSheet, AdminStatus } from "./AdminUI";

type PendingDelete = {
  preview: ConfirmationResponseAccessPreview;
  command: ReturnType<typeof createConfirmationResponseAccessCommand> | null;
  commandReason: string | null;
};

function activeDependencyEntries(preview: ConfirmationResponseAccessPreview | null) {
  if (!preview) return [];
  return Object.entries(preview.delete.dependencies).filter(([, count]) => count > 0);
}

export function ConfirmationResponseRecoveryControls({
  editionId,
  submissionId,
  country,
  editionLabel,
  roundName,
  submittedAt,
  onChanged,
  onDeleted,
}: {
  editionId: string;
  submissionId: string;
  country: string;
  editionLabel: string;
  roundName: string;
  submittedAt: string;
  onChanged: () => Promise<void> | void;
  onDeleted: () => Promise<void> | void;
}) {
  const reconcileOperation = useServerFn(reconcileSystemOperation);
  const [preview, setPreview] = useState<ConfirmationResponseAccessPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(true);
  const [linkType, setLinkType] = useState<"reusable" | "one_time">("reusable");
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);
  const [linkBusy, setLinkBusy] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [deleteReason, setDeleteReason] = useState("");
  const [deletePassword, setDeletePassword] = useState("");
  const [deleting, setDeleting] = useState(false);

  const refreshPreview = useCallback(async () => {
    setPreviewError(null);
    try {
      const next = await previewConfirmationResponseAccess(editionId, submissionId);
      assertConfirmationResponseAccessScope(next, editionId, submissionId);
      setPreview(next);
      return next;
    } catch (caught) {
      const message = confirmationResponseAccessErrorMessage(caught);
      setPreviewError(message);
      throw caught;
    } finally {
      setLoadingPreview(false);
    }
  }, [editionId, submissionId]);

  useEffect(() => {
    setLoadingPreview(true);
    setPreview(null);
    setGeneratedLink(null);
    setPendingDelete(null);
    setDeleteReason("");
    setDeletePassword("");
    void refreshPreview().catch(() => undefined);
  }, [refreshPreview]);

  async function reconcile(operationId: string, successMessage: string) {
    const result = await reconcileOperation({ data: { operationId } });
    if (!result.ok) return false;
    if (result.receipt.status === "succeeded") {
      toast.success(successMessage);
      return true;
    }
    if (result.receipt.status === "failed") {
      throw new Error(result.receipt.error?.message ?? "The Organizer operation failed.");
    }
    throw new Error(
      "The operation is still processing. Keep this review open and reconcile the same operation before trying another write.",
    );
  }

  async function copyValue(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copied`);
    } catch {
      toast.error("Could not copy to the clipboard. The generated link is still shown above.");
    }
  }

  async function createEditLink() {
    if (linkBusy) return;
    setLinkBusy(true);
    try {
      const reviewed = await refreshPreview();
      if (
        !reviewed.state.editingAllowed ||
        reviewed.state.locked ||
        !reviewed.state.roundEditingEnabled ||
        !reviewed.state.editionEditingEnabled
      ) {
        throw new Error(
          "Editing is not currently open for this response. Open response editing before issuing a private edit link.",
        );
      }

      const payload = { tokenType: linkType, expiresInHours: null };
      const command = createConfirmationResponseAccessCommand({
        preview: reviewed,
        changeKind: "issue_recovery",
        payload,
      });

      try {
        const result = await applyConfirmationResponseAccessChange({
          preview: reviewed,
          changeKind: "issue_recovery",
          payload,
          operationId: command.operationId,
          idempotencyKey: command.idempotencyKey,
        });
        if (!result.secretAvailable || !result.token) {
          throw new Error(
            "Solaris confirmed the edit-link operation but the one-time secret is unavailable. Issue a replacement link explicitly.",
          );
        }

        const url = `${window.location.origin}/confirmations/edit/${result.token}`;
        setGeneratedLink(url);
        try {
          await navigator.clipboard.writeText(url);
          toast.success("Edit link generated and copied");
        } catch {
          toast.success("Edit link generated");
          toast.message("Clipboard access failed. Copy the visible link manually; the successful issuance was not rolled back.");
        }
      } catch (caught) {
        const systemError = toSystemError(caught);
        if (
          systemError.retryable &&
          (await reconcile(command.operationId, "Edit link issuance confirmed after reconnecting"))
        ) {
          setGeneratedLink(null);
          throw new Error(
            "The edit link was issued, but its plaintext secret cannot be replayed after a lost response. Generate a replacement link if the delegation still needs one.",
          );
        }
        throw caught;
      }

      await refreshPreview();
      await onChanged();
    } catch (caught) {
      toast.error(confirmationResponseAccessErrorMessage(caught));
      await refreshPreview().catch(() => undefined);
    } finally {
      setLinkBusy(false);
    }
  }

  async function revokeToken(tokenId: string) {
    if (linkBusy) return;
    setLinkBusy(true);
    try {
      const reviewed = await refreshPreview();
      const token = reviewed.recoveryTokens.find((candidate) => candidate.id === tokenId);
      if (!token?.active) {
        throw new Error("That edit link is no longer active. The response has been refreshed.");
      }
      const payload = { tokenId };
      const command = createConfirmationResponseAccessCommand({
        preview: reviewed,
        changeKind: "invalidate_recovery",
        payload,
      });

      try {
        await applyConfirmationResponseAccessChange({
          preview: reviewed,
          changeKind: "invalidate_recovery",
          payload,
          operationId: command.operationId,
          idempotencyKey: command.idempotencyKey,
        });
      } catch (caught) {
        const systemError = toSystemError(caught);
        if (
          !systemError.retryable ||
          !(await reconcile(command.operationId, "Edit link revocation confirmed after reconnecting"))
        ) {
          throw caught;
        }
      }

      setGeneratedLink(null);
      toast.success("Edit link revoked");
      await refreshPreview();
      await onChanged();
    } catch (caught) {
      toast.error(confirmationResponseAccessErrorMessage(caught));
      await refreshPreview().catch(() => undefined);
    } finally {
      setLinkBusy(false);
    }
  }

  async function openDeleteReview() {
    if (deleting) return;
    try {
      const reviewed = await refreshPreview();
      if (!reviewed.delete.allowed) {
        const dependencyCount = Object.values(reviewed.delete.dependencies).reduce(
          (sum, count) => sum + count,
          0,
        );
        throw new Error(
          dependencyCount > 0
            ? `Permanent deletion is blocked by ${dependencyCount} canonical dependent record${dependencyCount === 1 ? "" : "s"}. Preserve this Confirmation response instead.`
            : "Permanent deletion is blocked by the canonical Confirmation history policy.",
        );
      }
      setDeleteReason("");
      setDeletePassword("");
      setPendingDelete({ preview: reviewed, command: null, commandReason: null });
    } catch (caught) {
      toast.error(confirmationResponseAccessErrorMessage(caught));
    }
  }

  async function deleteResponse() {
    if (!pendingDelete || deleting) return;
    const reason = deleteReason.trim();
    if (!reason) {
      toast.error("Add an organiser reason for this permanent deletion.");
      return;
    }
    if (!deletePassword) {
      toast.error("Fresh Solaris authentication is required for this R3 deletion.");
      return;
    }

    setDeleting(true);
    try {
      const live = await refreshPreview();
      if (
        !live.delete.allowed ||
        live.expectedVersion !== pendingDelete.preview.expectedVersion ||
        live.editionId !== pendingDelete.preview.editionId ||
        live.submissionId !== pendingDelete.preview.submissionId
      ) {
        throw new Error(
          "The Confirmation response changed while deletion was under review. Nothing was deleted. Review the latest canonical state again.",
        );
      }

      let command = pendingDelete.command;
      if (!command || pendingDelete.commandReason !== reason) {
        command = createConfirmationResponseAccessCommand({
          preview: pendingDelete.preview,
          changeKind: "delete_response",
          payload: {},
          reason,
        });
        setPendingDelete((current) =>
          current ? { ...current, command, commandReason: reason } : current,
        );
      }

      await reauthenticateConfirmationResponseR3(deletePassword);
      setDeletePassword("");

      try {
        await applyConfirmationResponseAccessChange({
          preview: pendingDelete.preview,
          changeKind: "delete_response",
          payload: {},
          reason,
          operationId: command.operationId,
          idempotencyKey: command.idempotencyKey,
        });
      } catch (caught) {
        const systemError = toSystemError(caught);
        if (
          !systemError.retryable ||
          !(await reconcile(command.operationId, "Permanent deletion confirmed after reconnecting"))
        ) {
          throw caught;
        }
      }

      setPendingDelete(null);
      toast.success("Confirmation deleted with an operation receipt");
      await onDeleted();
    } catch (caught) {
      toast.error(confirmationResponseAccessErrorMessage(caught));
      await refreshPreview().catch(() => undefined);
    } finally {
      setDeleting(false);
    }
  }

  const activeTokens = useMemo(
    () => preview?.recoveryTokens.filter((token) => token.active) ?? [],
    [preview],
  );
  const dependencies = activeDependencyEntries(preview);

  return (
    <>
      <AdminCard>
        <AdminCardHeader
          eyebrow="Edit access"
          title="Private participant edit link"
          description="Issue or revoke access through the canonical versioned Confirmation response command. A newly issued link invalidates the previous active link."
          action={
            <button
              type="button"
              disabled={loadingPreview || linkBusy}
              onClick={() =>
                void refreshPreview().catch((caught) =>
                  toast.error(confirmationResponseAccessErrorMessage(caught)),
                )
              }
              className="admin-action-secondary !min-h-9 !px-3 text-xs"
            >
              <RefreshCw className={`size-3.5 ${loadingPreview ? "animate-spin" : ""}`} /> Refresh
            </button>
          }
        />

        {previewError ? (
          <div className="mb-3 rounded-xl border border-amber-200/15 bg-amber-200/[0.04] p-3 text-xs text-amber-50/90">
            {previewError}
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setLinkType("reusable")}
            disabled={linkBusy}
            className={
              linkType === "reusable" ? "admin-action-primary" : "admin-action-secondary"
            }
          >
            Reusable
          </button>
          <button
            type="button"
            onClick={() => setLinkType("one_time")}
            disabled={linkBusy}
            className={
              linkType === "one_time" ? "admin-action-primary" : "admin-action-secondary"
            }
          >
            One-time
          </button>
        </div>

        <button
          type="button"
          disabled={linkBusy || loadingPreview || !preview}
          onClick={() => void createEditLink()}
          className="admin-action-primary mt-3 w-full"
        >
          <Link2 className="size-4" /> {linkBusy ? "Working…" : "Generate edit link"}
        </button>

        {generatedLink ? (
          <div className="mt-3 rounded-xl border border-sky-200/15 bg-sky-200/[0.035] p-3">
            <p className="break-all text-xs text-muted-foreground">{generatedLink}</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => void copyValue(generatedLink, "Edit link")}
                className="admin-action-secondary"
              >
                <Copy className="size-4" /> Copy
              </button>
              <button
                type="button"
                onClick={() => window.open(generatedLink, "_blank", "noopener,noreferrer")}
                className="admin-action-secondary"
              >
                <ExternalLink className="size-4" /> Open
              </button>
            </div>
            <p className="mt-3 text-[11px] text-muted-foreground">
              This plaintext link exists only in this successful response. Solaris stores only the token hash and cannot replay the secret after an uncertain network outcome.
            </p>
          </div>
        ) : null}

        {activeTokens.length ? (
          <div className="mt-4 space-y-2 border-t border-white/[0.07] pt-4">
            <p className="admin-section-label">Active link</p>
            {activeTokens.map((token) => (
              <div
                key={token.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3"
              >
                <div className="min-w-0 text-xs">
                  <p className="font-semibold capitalize">
                    {token.tokenType.replaceAll("_", " ")}
                  </p>
                  <p className="mt-1 text-muted-foreground">
                    Used {token.useCount} {token.useCount === 1 ? "time" : "times"}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={linkBusy}
                  onClick={() => void revokeToken(token.id)}
                  className="admin-action-secondary !min-h-9 !px-3 text-xs"
                >
                  Revoke
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-4 border-t border-white/[0.07] pt-4 text-xs text-muted-foreground">
            No active private edit link.
          </p>
        )}
      </AdminCard>

      <AdminCard className="border-rose-300/15 bg-rose-300/[0.025]">
        <AdminCardHeader
          eyebrow="Danger zone"
          title="Delete response"
          description="R3 permanent deletion is available only for an unreviewed, unedited response with no canonical dependent history."
          action={
            preview ? (
              <AdminStatus tone={preview.delete.allowed ? "attention" : "neutral"}>
                {preview.delete.allowed ? "R3 eligible" : "Preserve"}
              </AdminStatus>
            ) : undefined
          }
        />
        {dependencies.length ? (
          <div className="mb-3 rounded-xl border border-white/[0.08] bg-white/[0.025] p-3 text-xs">
            <p className="font-semibold">Deletion blocked by canonical dependencies</p>
            <ul className="mt-2 space-y-1 text-muted-foreground">
              {dependencies.map(([name, count]) => (
                <li key={name}>
                  {name}: {count}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <button
          type="button"
          disabled={deleting || loadingPreview || !preview}
          onClick={() => void openDeleteReview()}
          className="admin-action-danger w-full"
        >
          <Trash2 className="size-4" /> {deleting ? "Deleting…" : "Review permanent deletion"}
        </button>
      </AdminCard>

      <AdminConfirmSheet
        open={Boolean(pendingDelete)}
        onClose={() => {
          if (deleting) return;
          setPendingDelete(null);
          setDeletePassword("");
          setDeleteReason("");
        }}
        onConfirm={deleteResponse}
        title={`Delete ${country}'s confirmation?`}
        description={
          <div className="space-y-3">
            <div className="flex items-start gap-2 rounded-xl border border-rose-200/15 bg-rose-200/[0.045] p-3 text-xs text-rose-50/90">
              <ShieldAlert className="mt-0.5 size-4 shrink-0" />
              <p>
                This is an R3 irreversible operation. The server will repeat capability, exact-edition, dependency, version and fresh-auth checks at commit time.
              </p>
            </div>
            <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-3 text-xs">
              <p>
                <span className="font-semibold text-foreground">Context:</span> {editionLabel} · {roundName}
              </p>
              <p className="mt-1">
                <span className="font-semibold text-foreground">Submitted:</span> {new Date(submittedAt).toLocaleString()}
              </p>
              <p className="mt-1 break-all">
                <span className="font-semibold text-foreground">Submission:</span> {submissionId}
              </p>
              <p className="mt-1">
                <span className="font-semibold text-foreground">Reviewed version:</span> {pendingDelete?.preview.expectedVersion ?? "—"}
              </p>
              <p className="mt-1">
                <span className="font-semibold text-foreground">Dependency check:</span> clear
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmation-delete-reason">Organiser reason</Label>
              <Textarea
                id="confirmation-delete-reason"
                rows={3}
                value={deleteReason}
                onChange={(event) => {
                  setDeleteReason(event.target.value);
                  setPendingDelete((current) =>
                    current ? { ...current, command: null, commandReason: null } : current,
                  );
                }}
                placeholder="Why is permanent deletion necessary?"
              />
            </div>
            <label className="block space-y-2">
              <span className="text-xs font-semibold text-foreground">
                Fresh authentication required
              </span>
              <input
                type="password"
                autoComplete="current-password"
                value={deletePassword}
                onChange={(event) => setDeletePassword(event.target.value)}
                className="h-11 w-full rounded-xl border border-white/[0.1] bg-white/[0.035] px-3 text-sm outline-none focus:border-white/25"
                placeholder="Current Solaris password"
              />
            </label>
            <p className="text-xs text-muted-foreground">
              Successful deletion writes the canonical operation/audit receipt. An uncertain network result is reconciled by operation ID rather than retried with a second destructive write.
            </p>
          </div>
        }
        confirmLabel="Delete response permanently"
        confirmationText={country}
        confirmationHint={`Type ${country} exactly to confirm permanent deletion`}
        busy={deleting}
        danger
      />
    </>
  );
}
