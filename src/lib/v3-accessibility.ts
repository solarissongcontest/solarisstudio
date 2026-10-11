export type V3AnnouncementPriority = "silent" | "polite" | "assertive";

export type V3AccessibleEvent =
  | "draft_saved"
  | "sync_complete"
  | "validation_error"
  | "submission_confirmed"
  | "submission_uncertain"
  | "voting_opened"
  | "voting_closed"
  | "results_published"
  | "live_status_changed"
  | "background_refresh";

export type V3AccessibleAnnouncement = {
  event: V3AccessibleEvent;
  priority: V3AnnouncementPriority;
  message: string | null;
  atomic: boolean;
};

/**
 * Centralises live-region behaviour so dynamic V3 surfaces do not each invent
 * their own screen-reader announcement strategy and accidentally cause whole
 * pages to be re-read on every background update.
 */
export function v3AccessibleAnnouncement(
  event: V3AccessibleEvent,
  detail?: string | null,
): V3AccessibleAnnouncement {
  switch (event) {
    case "draft_saved":
      return { event, priority: "polite", message: detail || "Draft saved", atomic: true };
    case "sync_complete":
      return { event, priority: "polite", message: detail || "Changes synced", atomic: true };
    case "validation_error":
      return {
        event,
        priority: "assertive",
        message: detail || "One or more fields need attention",
        atomic: true,
      };
    case "submission_confirmed":
      return {
        event,
        priority: "polite",
        message: detail || "Submission confirmed",
        atomic: true,
      };
    case "submission_uncertain":
      return {
        event,
        priority: "assertive",
        message: detail || "Checking whether your submission was received",
        atomic: true,
      };
    case "voting_opened":
      return { event, priority: "polite", message: detail || "Voting is now open", atomic: true };
    case "voting_closed":
      return { event, priority: "polite", message: detail || "Voting has closed", atomic: true };
    case "results_published":
      return {
        event,
        priority: "polite",
        message: detail || "Results are now available",
        atomic: true,
      };
    case "live_status_changed":
      return {
        event,
        priority: "polite",
        message: detail || "Live show status changed",
        atomic: true,
      };
    case "background_refresh":
      return { event, priority: "silent", message: null, atomic: false };
  }
}

export function v3AccessibleTouchTarget(visibleSize: number, minimum = 44) {
  if (!Number.isFinite(visibleSize) || visibleSize <= 0) {
    throw new Error("V3 accessibility policy requires a positive visible control size.");
  }
  return Math.max(minimum, visibleSize);
}
