export type V3S14ImplementationState = "planned" | "implemented";

export type V3S14Stage = {
  id: string;
  label: string;
  requirements: readonly string[];
  implementationState: V3S14ImplementationState;
  driverMarker: string;
  implementationAsset: string;
};

export type V3S14Check = {
  id: string;
  label: string;
  implementationState: V3S14ImplementationState;
  driverMarker: string;
  implementationAsset: string;
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
    implementationAsset: ".github/scripts/v3-s14-stage-1-setup.sh",
  },
  {
    id: "stage-2-delegation-onboarding",
    label: "delegation onboarding",
    requirements: ["memberships", "HOD access", "confirmation requirements", "notifications"],
    implementationState: "implemented",
    driverMarker: "S14_STAGE_2_DELEGATION_ONBOARDING_COMPLETE",
    implementationAsset: ".github/scripts/v3-s14-stage-2-onboarding.sh",
  },
  {
    id: "stage-3-confirmations",
    label: "confirmations",
    requirements: ["submit", "decline where supported", "correction", "reopen", "late/closed path"],
    implementationState: "implemented",
    driverMarker: "S14_STAGE_3_CONFIRMATIONS_COMPLETE",
    implementationAsset: ".github/scripts/v3-s14-stage-3-confirmations.sh",
  },
  {
    id: "stage-4-entries",
    label: "entries",
    requirements: [
      "valid",
      "invalid duration",
      "media replacement",
      "concurrent edit",
      "resubmission",
      "withdrawal",
    ],
    implementationState: "implemented",
    driverMarker: "S14_STAGE_4_ENTRIES_COMPLETE",
    implementationAsset: ".github/scripts/v3-s14-stage-4-entries.sh",
  },
  {
    id: "stage-5-running-orders",
    label: "running orders",
    requirements: ["allocate", "publish", "verify public show"],
    implementationState: "implemented",
    driverMarker: "S14_STAGE_5_RUNNING_ORDERS_COMPLETE",
    implementationAsset: ".github/scripts/v3-s14-stage-5-running-orders.sh",
  },
  {
    id: "stage-6-jury",
    label: "jury",
    requirements: [
      "complete ballots",
      "missing ballots",
      "invalid attempt",
      "own-country violation",
      "multi-device conflict",
    ],
    implementationState: "implemented",
    driverMarker: "S14_STAGE_6_JURY_COMPLETE",
    implementationAsset: ".github/scripts/v3-s14-stage-6-jury.sh",
  },
  {
    id: "stage-7-public-voting",
    label: "public voting",
    requirements: [
      "valid voters",
      "duplicate attempt",
      "deadline extension",
      "network uncertainty",
      "integrity signal",
    ],
    implementationState: "implemented",
    driverMarker: "S14_STAGE_7_PUBLIC_VOTING_COMPLETE",
    implementationAsset: ".github/scripts/v3-s14-stage-7-public-voting.sh",
  },
  {
    id: "stage-8-results",
    label: "results",
    requirements: ["calculate", "validate", "resolve integrity", "finalize"],
    implementationState: "implemented",
    driverMarker: "S14_STAGE_8_RESULTS_COMPLETE",
    implementationAsset: ".github/scripts/v3-s14-stage-8-results.sh",
  },
  {
    id: "stage-9-publication",
    label: "publication",
    requirements: ["publish", "public surfaces reference exact finalized result version"],
    implementationState: "planned",
    driverMarker: "S14_STAGE_9_PUBLICATION_COMPLETE",
    implementationAsset: ".github/scripts/v3-s14-stage-9-publication.sh",
  },
  {
    id: "stage-10-archive",
    label: "archive",
    requirements: [
      "complete edition",
      "current CTAs disappear",
      "history remains",
      "results reproducible",
      "receipts retained",
    ],
    implementationState: "planned",
    driverMarker: "S14_STAGE_10_ARCHIVE_COMPLETE",
    implementationAsset: ".github/scripts/v3-s14-stage-10-archive.sh",
  },
] as const;

export const V3_S14_INVARIANTS: readonly V3S14Check[] = [
  {
    id: "confirmation-no-effective-duplicates",
    label: "no effective duplicate confirmation requirements",
    implementationState: "implemented",
    driverMarker: "S14_INVARIANT_CONFIRMATION_COMPLETE",
    implementationAsset: ".github/scripts/v3-s14-stage-3-confirmations.sh",
  },
  {
    id: "entry-valid-revision",
    label: "every verified entry references a valid revision",
    implementationState: "implemented",
    driverMarker: "S14_INVARIANT_ENTRY_COMPLETE",
    implementationAsset: ".github/scripts/v3-s14-stage-4-entries.sh",
  },
  {
    id: "media-accepted-revision",
    label: "every published required media reference points to an accepted asset revision",
    implementationState: "implemented",
    driverMarker: "S14_INVARIANT_MEDIA_COMPLETE",
    implementationAsset: ".github/scripts/v3-s14-stage-4-entries.sh",
  },
  {
    id: "jury-single-final-ballot",
    label: "no duplicate final jury ballot per delegation/round",
    implementationState: "implemented",
    driverMarker: "S14_INVARIANT_JURY_COMPLETE",
    implementationAsset: ".github/scripts/v3-s14-stage-6-jury.sh",
  },
  {
    id: "televote-canonical-ballot",
    label: "no duplicate canonical televote ballot beyond configured rules",
    implementationState: "implemented",
    driverMarker: "S14_INVARIANT_TELEVOTE_COMPLETE",
    implementationAsset: ".github/scripts/v3-s14-stage-7-public-voting.sh",
  },
  {
    id: "result-reproducible",
    label: "recalculation from referenced inputs equals finalized output",
    implementationState: "implemented",
    driverMarker: "S14_INVARIANT_RESULT_COMPLETE",
    implementationAsset: ".github/scripts/v3-s14-stage-8-results.sh",
  },
  {
    id: "publication-final-version",
    label: "public result pointer equals finalized version",
    implementationState: "planned",
    driverMarker: "S14_INVARIANT_PUBLICATION_COMPLETE",
    implementationAsset: ".github/scripts/v3-s14-stage-9-publication.sh",
  },
  {
    id: "tasks-canonical",
    label: "no actionable task contradicts canonical state",
    implementationState: "planned",
    driverMarker: "S14_INVARIANT_TASKS_COMPLETE",
    implementationAsset: ".github/scripts/v3-s14-stage-10-archive.sh",
  },
  {
    id: "notifications-reconcilable",
    label: "no impossible actionable notification without reconciliation path",
    implementationState: "planned",
    driverMarker: "S14_INVARIANT_NOTIFICATIONS_COMPLETE",
    implementationAsset: ".github/scripts/v3-s14-stage-10-archive.sh",
  },
] as const;

export const V3_S14_FAILURE_INJECTIONS: readonly V3S14Check[] = [
  {
    id: "network-after-commit",
    label: "kill network after commit",
    implementationState: "implemented",
    driverMarker: "S14_FAILURE_NETWORK_AFTER_COMMIT_COMPLETE",
    implementationAsset: ".github/scripts/v3-s14-stage-3-confirmations.sh",
  },
  {
    id: "db-timeout-before-commit",
    label: "database timeout before commit",
    implementationState: "implemented",
    driverMarker: "S14_FAILURE_DB_TIMEOUT_COMPLETE",
    implementationAsset: ".github/scripts/v3-s14-stage-8-results.sh",
  },
  {
    id: "duplicate-request",
    label: "duplicate request produces one canonical result",
    implementationState: "implemented",
    driverMarker: "S14_FAILURE_DUPLICATE_REQUEST_COMPLETE",
    implementationAsset: ".github/scripts/v3-s14-stage-3-confirmations.sh",
  },
  {
    id: "worker-crash",
    label: "worker crash leaves outbox recoverable",
    implementationState: "implemented",
    driverMarker: "S14_FAILURE_WORKER_CRASH_COMPLETE",
    implementationAsset: ".github/scripts/v3-s14-stage-8-results.sh",
  },
  {
    id: "realtime-disconnect",
    label: "realtime disconnect recovers through authoritative refresh",
    implementationState: "planned",
    driverMarker: "S14_FAILURE_REALTIME_DISCONNECT_COMPLETE",
    implementationAsset: ".github/scripts/v3-s14-stage-9-publication.sh",
  },
  {
    id: "stale-client",
    label: "stale client action is rejected",
    implementationState: "implemented",
    driverMarker: "S14_FAILURE_STALE_CLIENT_COMPLETE",
    implementationAsset: ".github/scripts/v3-s14-stage-3-confirmations.sh",
  },
  {
    id: "two-organizers",
    label: "two-organizer concurrency conflict is controlled",
    implementationState: "implemented",
    driverMarker: "S14_FAILURE_TWO_ORGANIZERS_COMPLETE",
    implementationAsset: ".github/scripts/v3-s14-stage-4-entries.sh",
  },
  {
    id: "supabase-outage",
    label: "Supabase outage surfaces degraded state without fake success",
    implementationState: "planned",
    driverMarker: "S14_FAILURE_SUPABASE_OUTAGE_COMPLETE",
    implementationAsset: ".github/scripts/v3-s14-stage-10-archive.sh",
  },
] as const;
