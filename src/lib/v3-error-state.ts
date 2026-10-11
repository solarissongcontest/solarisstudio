export type V3ErrorKind =
  | "connection"
  | "validation"
  | "permission"
  | "state_changed"
  | "submission_uncertain"
  | "server"
  | "offline"
  | "conflict";

export type V3ErrorState = {
  kind: V3ErrorKind;
  title: string;
  detail: string;
  retryable: boolean;
  preserveDraft: boolean;
  primaryAction: "retry" | "review" | "refresh" | "wait" | "go_back" | "resolve_conflict" | null;
};

export function v3ErrorState(kind: V3ErrorKind, detail?: string | null): V3ErrorState {
  switch (kind) {
    case "connection":
      return {
        kind,
        title: "Couldn't reach Solaris",
        detail: detail || "Check your connection and try again. Your current draft stays on this device.",
        retryable: true,
        preserveDraft: true,
        primaryAction: "retry",
      };
    case "validation":
      return {
        kind,
        title: "One item needs your attention",
        detail: detail || "Review the highlighted field before continuing.",
        retryable: false,
        preserveDraft: true,
        primaryAction: "review",
      };
    case "permission":
      return {
        kind,
        title: "You don't have access to this action",
        detail: detail || "Your current Solaris permissions do not allow this operation.",
        retryable: false,
        preserveDraft: true,
        primaryAction: "go_back",
      };
    case "state_changed":
      return {
        kind,
        title: "This workflow changed",
        detail: detail || "Solaris has newer canonical state. Refresh before continuing.",
        retryable: true,
        preserveDraft: true,
        primaryAction: "refresh",
      };
    case "submission_uncertain":
      return {
        kind,
        title: "Checking your submission",
        detail: detail || "Solaris is checking whether the server received it. Don't submit again yet.",
        retryable: false,
        preserveDraft: true,
        primaryAction: "wait",
      };
    case "server":
      return {
        kind,
        title: "Solaris couldn't complete this action",
        detail: detail || "The server rejected or failed the operation. Try again when it is safe to do so.",
        retryable: true,
        preserveDraft: true,
        primaryAction: "retry",
      };
    case "offline":
      return {
        kind,
        title: "You're offline",
        detail: detail || "Your draft can stay saved locally, but this final action needs a connection.",
        retryable: false,
        preserveDraft: true,
        primaryAction: "wait",
      };
    case "conflict":
      return {
        kind,
        title: "This changed on another device",
        detail: detail || "A newer version exists. Review it before deciding what to keep.",
        retryable: false,
        preserveDraft: true,
        primaryAction: "resolve_conflict",
      };
  }
}

export type V3BlockedAction = {
  label: string;
  reason: string;
  actionable: false;
};

export function v3BlockedAction(label: string, reason: string): V3BlockedAction {
  if (!label.trim() || !reason.trim()) {
    throw new Error("V3 blocked actions require both a label and an explanation.");
  }
  return { label, reason, actionable: false };
}
