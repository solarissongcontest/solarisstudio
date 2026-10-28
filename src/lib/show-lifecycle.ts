import type { ShowModeManualPhase } from "@/lib/broadcast";

export type ShowLifecycleState =
  | "scheduled"
  | "preparing"
  | "delayed"
  | "live"
  | "paused"
  | "ended"
  | "cancelled";

export type ShowRuntimeTarget = ShowLifecycleState | "results_in_progress";

const LIFECYCLE_ALIASES: Readonly<Record<string, ShowLifecycleState>> = {
  draft: "scheduled",
  scheduled: "scheduled",
  upcoming: "scheduled",
  planned: "scheduled",
  planning: "scheduled",
  announced: "scheduled",
  ready: "preparing",
  preparing: "preparing",
  rehearsal: "preparing",
  rehearsals: "preparing",
  delayed: "delayed",
  live: "live",
  on_air: "live",
  "on-air": "live",
  active: "live",
  open: "live",
  in_progress: "live",
  "in-progress": "live",
  paused: "paused",
  hold: "paused",
  held: "paused",
  ended: "ended",
  complete: "ended",
  completed: "ended",
  closed: "ended",
  cancelled: "cancelled",
  canceled: "cancelled",
};

export function canonicalShowLifecycle(status: string): ShowLifecycleState {
  const normalized = LIFECYCLE_ALIASES[status.trim().toLowerCase()];
  if (!normalized) throw new Error(`Unknown show lifecycle state: ${status}`);
  return normalized;
}

export function showRuntimeTargetFromStored(
  status: string,
  phase: ShowModeManualPhase,
): ShowRuntimeTarget {
  const lifecycle = canonicalShowLifecycle(status);
  return lifecycle === "live" && phase === "results_in_progress"
    ? "results_in_progress"
    : lifecycle;
}

export function companionPhaseForTarget(target: ShowRuntimeTarget): ShowModeManualPhase {
  if (target === "results_in_progress") return "results_in_progress";
  if (target === "live" || target === "paused") return "live";
  if (target === "ended" || target === "cancelled") return "ended";
  return "scheduled";
}
