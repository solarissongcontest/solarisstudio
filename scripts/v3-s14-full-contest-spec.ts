export type V3S14ImplementationState = "planned" | "implemented";

export type V3S14Stage = {
  id: string;
  label: string;
  requirements: readonly string[];
  implementationState: V3S14ImplementationState;
  driverMarker: string;
};

export type V3S14Check = {
  id: string;
  label: string;
  implementationState: V3S14ImplementationState;
  driverMarker: string;
};

export const V3_S14_SEED_CONTRACT = {
  editionCount: 1,
  delegationCount: 66,
  minimumShowCount: 3,
  deterministic: true,
  bounded: true,
  requiredDomains: [
    "entries/media",
    "confirmation rounds",
    "jury",
    "televote",
    "results",
    "stories",
    "rules",
    "fan users",
    "organizers",
  ] as const,
} as const;

export const V3_S14_STAGES: readonly V3S14Stage[] = [
  {
    id: "stage-1-setup",
    label: "setup",
    requirements: [
      "create edition",
      "configure show structure",
      "configure rules",
      "configure voting",
      "configure publication",
    ],
    implementationState: "implemented",
    driverMarker: "S14_STAGE_1_SETUP_COMPLETE",
  },
  {
    id: "stage-2-delegation-onboarding",
    label: "delegation onboarding",
    requirements: ["memberships", "HOD access", "confirmation requirements", "notifications"],
    implementationState: "implemented",
    driverMarker: "S14_STAGE_2_DELEGATION_ONBOARDING_COMPLETE",
  },
  {
    id: "stage-3-confirmations",
    label: "confirmations",
    requirements: ["submit", "decline where supported", "correction", "reopen", "late/closed path"],
    implementationState: "planned",
    driverMarker: "S14_STAGE_3_CONFIRMATIONS_COMPLETE",
  },
  {
    id: "stage-4-entries",
    label: "entries",
    requirements: ["valid", "invalid duration", "media replacement", "concurrent edit", "resubmission", "withdrawal"],
    implementationState: "planned",
    driverMarker: "S14_STAGE_4_ENTRIES_COMPLETE",
  },
  {
    id: "stage-5-running-orders",
    label: "running orders",
    requirements: ["allocate", "publish", "verify public show"],
    implementationState: "planned",
    driverMarker: "S14_STAGE_5_RUNNING_ORDERS_COMPLETE",
  },
  {
    id: "stage-6-jury",
    label: "jury",
    requirements: ["complete ballots", "missing ballots", "invalid attempt", "own-country violation", "multi-device conflict"],
    implementationState: "planned",
    driverMarker: "S14_STAGE_6_JURY_COMPLETE",
  },
  {
    id: "stage-7-public-voting",
    label: "public voting",
    requirements: ["valid voters", "duplicate attempt", "deadline extension", "network uncertainty", "integrity signal"],
    implementationState: "planned",
    driverMarker: "S14_STAGE_7_PUBLIC_VOTING_COMPLETE",
  },
  {
    id: "stage-8-results",
    label: "results",
    requirements: ["calculate", "validate", "resolve integrity", "finalize"],
    implementationState: "planned",
    driverMarker: "S14_STAGE_8_RESULTS_COMPLETE",
  },
  {
    id: "stage-9-publication",
    label: "publication",
    requirements: ["publish", "public surfaces reference exact finalized result version"],
    implementationState: "planned",
    driverMarker: "S14_STAGE_9_PUBLICATION_COMPLETE",
  },
  {
    id: "stage-10-archive",
    label: "archive",
    requirements: ["complete edition", "current CTAs disappear", "history remains", "results reproducible", "receipts retained"],
    implementationState: "planned",
    driverMarker: "S14_STAGE_10_ARCHIVE_COMPLETE",
  },
] as const;

export const V3_S14_INVARIANTS: readonly V3S14Check[] = [
  { id: "confirmation-no-effective-duplicates", label: "no effective duplicate confirmation requirements", implementationState: "planned", driverMarker: "S14_INVARIANT_CONFIRMATION_COMPLETE" },
  { id: "entry-valid-revision", label: "every verified entry references a valid revision", implementationState: "planned", driverMarker: "S14_INVARIANT_ENTRY_COMPLETE" },
  { id: "media-accepted-revision", label: "every published required media reference points to an accepted asset revision", implementationState: "planned", driverMarker: "S14_INVARIANT_MEDIA_COMPLETE" },
  { id: "jury-single-final-ballot", label: "no duplicate final jury ballot per delegation/round", implementationState: "planned", driverMarker: "S14_INVARIANT_JURY_COMPLETE" },
  { id: "televote-canonical-ballot", label: "no duplicate canonical televote ballot beyond configured rules", implementationState: "planned", driverMarker: "S14_INVARIANT_TELEVOTE_COMPLETE" },
  { id: "result-reproducible", label: "recalculation from referenced inputs equals finalized output", implementationState: "planned", driverMarker: "S14_INVARIANT_RESULT_COMPLETE" },
  { id: "publication-final-version", label: "public result pointer equals finalized version", implementationState: "planned", driverMarker: "S14_INVARIANT_PUBLICATION_COMPLETE" },
  { id: "tasks-canonical", label: "no actionable task contradicts canonical state", implementationState: "planned", driverMarker: "S14_INVARIANT_TASKS_COMPLETE" },
  { id: "notifications-reconcilable", label: "no impossible actionable notification without reconciliation path", implementationState: "planned", driverMarker: "S14_INVARIANT_NOTIFICATIONS_COMPLETE" },
] as const;

export const V3_S14_FAILURE_INJECTIONS: readonly V3S14Check[] = [
  { id: "network-after-commit", label: "kill network after commit", implementationState: "planned", driverMarker: "S14_FAILURE_NETWORK_AFTER_COMMIT_COMPLETE" },
  { id: "db-timeout-before-commit", label: "database timeout before commit", implementationState: "planned", driverMarker: "S14_FAILURE_DB_TIMEOUT_COMPLETE" },
  { id: "duplicate-request", label: "duplicate request produces one canonical result", implementationState: "planned", driverMarker: "S14_FAILURE_DUPLICATE_REQUEST_COMPLETE" },
  { id: "worker-crash", label: "worker crash leaves outbox recoverable", implementationState: "planned", driverMarker: "S14_FAILURE_WORKER_CRASH_COMPLETE" },
  { id: "realtime-disconnect", label: "realtime disconnect recovers through authoritative refresh", implementationState: "planned", driverMarker: "S14_FAILURE_REALTIME_DISCONNECT_COMPLETE" },
  { id: "stale-client", label: "stale client action is rejected", implementationState: "planned", driverMarker: "S14_FAILURE_STALE_CLIENT_COMPLETE" },
  { id: "two-organizers", label: "two-organizer concurrency conflict is controlled", implementationState: "planned", driverMarker: "S14_FAILURE_TWO_ORGANIZERS_COMPLETE" },
  { id: "supabase-outage", label: "Supabase outage surfaces degraded state without fake success", implementationState: "planned", driverMarker: "S14_FAILURE_SUPABASE_OUTAGE_COMPLETE" },
] as const;
