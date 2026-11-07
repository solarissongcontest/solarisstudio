import type { ReactNode } from "react";

import { AdminCard, AdminStatus } from "@/components/admin/AdminUI";
import {
  organizerOperationAllowedActions,
  organizerOperationContextLabel,
  organizerOperationDefaultCopy,
  type OrganizerOperationAction,
  type OrganizerOperationDiagnostics,
  type OrganizerOperationFeedback as OrganizerOperationFeedbackModel,
} from "@/lib/v3-organizer-operation-feedback";
import { cn } from "@/lib/utils";

export type OrganizerOperationFeedbackProps = {
  feedback: OrganizerOperationFeedbackModel;
  busy?: boolean;
  onRetry?: () => void | Promise<void>;
  onReconcile?: () => void | Promise<void>;
  onReload?: () => void | Promise<void>;
  onCompare?: () => void | Promise<void>;
  extraAction?: ReactNode;
  className?: string;
};

function phaseTone(phase: OrganizerOperationFeedbackModel["phase"]) {
  switch (phase) {
    case "success":
      return "ready" as const;
    case "partial":
      return "attention" as const;
    case "failed":
    case "conflict":
      return "blocked" as const;
    case "pending":
    case "reconciling":
      return "info" as const;
  }
}

function phaseLabel(phase: OrganizerOperationFeedbackModel["phase"]) {
  switch (phase) {
    case "pending":
      return "Working";
    case "reconciling":
      return "Checking status";
    case "success":
      return "Complete";
    case "partial":
      return "Partial";
    case "failed":
      return "Failed";
    case "conflict":
      return "State changed";
  }
}

function diagnosticsRows(diagnostics?: OrganizerOperationDiagnostics) {
  if (!diagnostics) return [];
  return [
    ["Error code", diagnostics.errorCode],
    ["Operation ID", diagnostics.operationId],
    ["Correlation ID", diagnostics.correlationId],
    ["Receipt ID", diagnostics.receiptId],
    ["State version", diagnostics.stateVersion],
    ["Server time", diagnostics.serverTime],
  ].filter((row): row is [string, string | number] => row[1] !== undefined && row[1] !== null && row[1] !== "");
}

function ActionButton({
  action,
  busy,
  onClick,
}: {
  action: OrganizerOperationAction;
  busy: boolean;
  onClick?: () => void | Promise<void>;
}) {
  if (!onClick) return null;

  const label =
    action === "reconcile"
      ? "Reconcile operation"
      : action === "reload"
        ? "Reload current state"
        : action === "compare"
          ? "Compare changes"
          : "Retry confirmed failure";

  return (
    <button
      type="button"
      disabled={busy}
      className={action === "retry" ? "admin-action-primary" : "admin-action-secondary"}
      onClick={() => void onClick()}
    >
      {busy && action === "reconcile" ? "Checking…" : label}
    </button>
  );
}

export function OrganizerOperationFeedback({
  feedback,
  busy = false,
  onRetry,
  onReconcile,
  onReload,
  onCompare,
  extraAction,
  className,
}: OrganizerOperationFeedbackProps) {
  const fallback = feedback.errorClass ? organizerOperationDefaultCopy(feedback.errorClass) : null;
  const title = feedback.title ?? fallback?.title ?? (feedback.phase === "pending" ? "Operation in progress" : "Organizer operation");
  const message = feedback.message ?? fallback?.message;
  const contextLabel = organizerOperationContextLabel(feedback.context);
  const actions = organizerOperationAllowedActions(feedback);
  const diagnostics = diagnosticsRows(feedback.diagnostics);
  const isAlert = feedback.phase === "failed" || feedback.phase === "conflict";

  const handlers: Record<OrganizerOperationAction, (() => void | Promise<void>) | undefined> = {
    retry: onRetry,
    reconcile: onReconcile,
    reload: onReload,
    compare: onCompare,
  };

  return (
    <AdminCard
      className={cn(
        "border-white/[0.08]",
        feedback.phase === "success" && "border-emerald-200/10 bg-emerald-200/[0.025]",
        feedback.phase === "partial" && "border-amber-200/12 bg-amber-200/[0.025]",
        feedback.phase === "failed" && "border-rose-200/12 bg-rose-200/[0.025]",
        feedback.phase === "conflict" && "border-amber-200/12 bg-amber-200/[0.03]",
        className,
      )}
    >
      <div
        role={isAlert ? "alert" : "status"}
        aria-live={feedback.phase === "reconciling" || feedback.phase === "pending" ? "polite" : undefined}
        aria-atomic="true"
      >
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0">
            {contextLabel ? (
              <p className="admin-section-label break-words">{contextLabel}</p>
            ) : null}
            <h2 className="mt-1 text-base font-bold tracking-[-.02em] text-foreground">{title}</h2>
            {message ? (
              <p className="mt-1 max-w-3xl text-xs leading-relaxed text-muted-foreground">{message}</p>
            ) : null}
          </div>
          <AdminStatus tone={phaseTone(feedback.phase)}>{phaseLabel(feedback.phase)}</AdminStatus>
        </div>

        {feedback.phase === "reconciling" ? (
          <div className="mt-4 rounded-xl border border-sky-200/10 bg-sky-200/[0.03] p-3 text-xs leading-relaxed text-muted-foreground">
            Do not start a second mutation. Solaris may already have committed the reviewed operation; reconcile this exact operation identity first.
          </div>
        ) : null}

        {feedback.phase === "conflict" ? (
          <div className="mt-4 grid gap-2 text-xs sm:grid-cols-2">
            <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-3">
              <p className="text-muted-foreground">Your reviewed version</p>
              <p className="mt-1 font-semibold text-foreground">{String(feedback.reviewedVersion ?? "Unknown")}</p>
            </div>
            <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-3">
              <p className="text-muted-foreground">Current authoritative version</p>
              <p className="mt-1 font-semibold text-foreground">{String(feedback.currentVersion ?? "Unknown")}</p>
            </div>
          </div>
        ) : null}

        {feedback.receipt ? (
          <div className="mt-4 rounded-xl border border-white/[0.08] bg-white/[0.025] p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold text-foreground">Operation receipt</p>
              <span className="font-mono text-[11px] text-muted-foreground">{feedback.receipt.receiptId}</span>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{feedback.receipt.summary}</p>
            <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
              {feedback.receipt.affectedCount !== undefined ? (
                <div>
                  <dt className="text-muted-foreground">Affected</dt>
                  <dd className="mt-0.5 font-semibold text-foreground">{feedback.receipt.affectedCount}</dd>
                </div>
              ) : null}
              {feedback.receipt.completedAt ? (
                <div>
                  <dt className="text-muted-foreground">Completed</dt>
                  <dd className="mt-0.5 font-semibold text-foreground">{feedback.receipt.completedAt}</dd>
                </div>
              ) : null}
              {feedback.receipt.beforeVersion !== undefined ? (
                <div>
                  <dt className="text-muted-foreground">Before</dt>
                  <dd className="mt-0.5 font-semibold text-foreground">{String(feedback.receipt.beforeVersion)}</dd>
                </div>
              ) : null}
              {feedback.receipt.afterVersion !== undefined ? (
                <div>
                  <dt className="text-muted-foreground">After</dt>
                  <dd className="mt-0.5 font-semibold text-foreground">{String(feedback.receipt.afterVersion)}</dd>
                </div>
              ) : null}
            </dl>
          </div>
        ) : null}

        {feedback.partialFailures && feedback.partialFailures.length > 0 ? (
          <div className="mt-4 rounded-xl border border-amber-200/12 bg-amber-200/[0.025] p-3">
            <p className="text-xs font-semibold text-foreground">Exceptions</p>
            <ul className="mt-2 space-y-2">
              {feedback.partialFailures.map((failure, index) => (
                <li key={failure.id ?? `${failure.label}:${index}`} className="text-xs leading-relaxed text-muted-foreground">
                  <span className="font-semibold text-foreground">{failure.label}:</span> {failure.reason}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {diagnostics.length > 0 ? (
          <details className="mt-4 rounded-xl border border-white/[0.07] bg-white/[0.018] p-3">
            <summary className="cursor-pointer text-xs font-semibold text-muted-foreground">Technical details</summary>
            <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
              {diagnostics.map(([label, value]) => (
                <div key={label} className="min-w-0">
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="mt-0.5 break-all font-mono text-[11px] text-foreground">{String(value)}</dd>
                </div>
              ))}
            </dl>
          </details>
        ) : null}

        {actions.length > 0 || extraAction ? (
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            {actions.map((action) => (
              <ActionButton key={action} action={action} busy={busy} onClick={handlers[action]} />
            ))}
            {extraAction}
          </div>
        ) : null}
      </div>
    </AdminCard>
  );
}
