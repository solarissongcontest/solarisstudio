export const EDITION_PHASES = [
  "draft",
  "planning",
  "host_selection",
  "confirmations",
  "submissions",
  "pre_show",
  "rehearsals",
  "jury_voting",
  "live_show",
  "televoting",
  "vote_verification",
  "results",
  "post_edition",
  "archived",
] as const;

export type EditionPhase = (typeof EDITION_PHASES)[number];

export const EDITION_PHASE_LABELS: Record<EditionPhase, string> = {
  draft: "Draft",
  planning: "Planning",
  host_selection: "Host selection",
  confirmations: "Confirmations",
  submissions: "Submissions",
  pre_show: "Pre-show",
  rehearsals: "Rehearsals",
  jury_voting: "Jury voting",
  live_show: "Live show",
  televoting: "Televoting",
  vote_verification: "Vote verification",
  results: "Results",
  post_edition: "Post-edition",
  archived: "Archived",
};

export const EDITION_PHASE_TRANSITIONS: Readonly<Record<EditionPhase, readonly EditionPhase[]>> = {
  draft: ["planning"],
  planning: ["host_selection", "confirmations"],
  host_selection: ["confirmations"],
  confirmations: ["submissions"],
  submissions: ["pre_show"],
  pre_show: ["rehearsals", "jury_voting"],
  rehearsals: ["jury_voting"],
  jury_voting: ["live_show"],
  live_show: ["televoting", "vote_verification"],
  televoting: ["vote_verification"],
  vote_verification: ["televoting", "results"],
  results: ["vote_verification", "post_edition"],
  post_edition: ["archived"],
  archived: [],
};

export const SUBSYSTEM_STATES = {
  confirmations: ["not_started", "open", "closed", "locked"],
  submissions: ["not_started", "open", "closed", "locked"],
  juryVoting: ["not_started", "open", "closed", "locked"],
  televoting: ["not_started", "open", "closed", "locked"],
  results: ["hidden", "calculating", "verification", "verified", "published"],
} as const;

export type OperationalSubsystemState =
  (typeof SUBSYSTEM_STATES.confirmations)[number];
export type ResultsSubsystemState = (typeof SUBSYSTEM_STATES.results)[number];

export type EditionRuntimeState = {
  edition_id: string;
  phase: EditionPhase;
  confirmations_state: OperationalSubsystemState;
  submissions_state: OperationalSubsystemState;
  jury_voting_state: OperationalSubsystemState;
  televoting_state: OperationalSubsystemState;
  results_state: ResultsSubsystemState;
  version: number;
  last_transition_at: string | null;
  last_transition_by: string | null;
  last_transition_reason: string | null;
  created_at: string;
  updated_at: string;
};

export function isEditionPhase(value: unknown): value is EditionPhase {
  return typeof value === "string" && (EDITION_PHASES as readonly string[]).includes(value);
}

export function canTransitionEditionPhase(from: EditionPhase, to: EditionPhase): boolean {
  return from === to || EDITION_PHASE_TRANSITIONS[from].includes(to);
}

export function getAvailableEditionPhaseTransitions(from: EditionPhase): readonly EditionPhase[] {
  return EDITION_PHASE_TRANSITIONS[from];
}

export function editionPhaseProgress(phase: EditionPhase): number {
  const index = EDITION_PHASES.indexOf(phase);
  if (index < 0) return 0;
  return index / (EDITION_PHASES.length - 1);
}

export function describeEditionTransition(from: EditionPhase, to: EditionPhase): string {
  return `${EDITION_PHASE_LABELS[from]} → ${EDITION_PHASE_LABELS[to]}`;
}
