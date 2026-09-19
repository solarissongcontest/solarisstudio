export type PublicStatusKey =
  | "current"
  | "upcoming"
  | "open"
  | "full"
  | "live"
  | "under_review"
  | "needs_attention"
  | "changes_required"
  | "pending"
  | "closed"
  | "published"
  | "final"
  | "completed"
  | "delayed"
  | "unavailable"
  | "not_published";

export type PublicStatusTone =
  | "neutral"
  | "info"
  | "success"
  | "warning"
  | "danger"
  | "live";

export type PublicStatusDefinition = {
  label: string;
  tone: PublicStatusTone;
};

export const PUBLIC_STATUS: Record<PublicStatusKey, PublicStatusDefinition> = {
  current: { label: "Current", tone: "neutral" },
  upcoming: { label: "Upcoming", tone: "info" },
  open: { label: "Open", tone: "success" },
  full: { label: "Full", tone: "warning" },
  live: { label: "Live", tone: "live" },
  under_review: { label: "Under review", tone: "info" },
  needs_attention: { label: "Needs attention", tone: "warning" },
  changes_required: { label: "Changes required", tone: "danger" },
  pending: { label: "Pending", tone: "neutral" },
  closed: { label: "Closed", tone: "neutral" },
  published: { label: "Published", tone: "success" },
  final: { label: "Final", tone: "success" },
  completed: { label: "Completed", tone: "success" },
  delayed: { label: "Delayed", tone: "warning" },
  unavailable: { label: "Unavailable", tone: "danger" },
  not_published: { label: "Not yet published", tone: "neutral" },
};

export function publicStatusDefinition(status: PublicStatusKey) {
  return PUBLIC_STATUS[status];
}
