import { V3_NOTIFICATION_PROVIDER_REGISTRY } from "./v3-notification-provider-registry";
import { V3_SYSTEM_DOMAIN_REGISTRY, v3SystemDomain } from "./v3-system-domain-registry";

export type V3TaskEffect = {
  effect: "re-evaluate";
  taskType: string;
};

export type V3NotificationEffect = {
  effect: "evaluate-provider";
  providerId: string;
};

export type V3PublicationEffect = {
  effect: "re-evaluate-visibility";
  projection: string;
};

export type V3RealtimeEffect = {
  effect: "invalidate-projection";
  projection: string;
};

type V3ConsequenceReplacementBase = {
  ownerDomain: string;
  operation: string;
  projection: string;
  boundedBy: string;
  rationale: string;
  evidence: readonly string[];
};

export type V3ReadOnlyConsequenceReplacement = V3ConsequenceReplacementBase & {
  kind: "canonical-read";
};

export type V3DerivedProjectionConsequenceReplacement = V3ConsequenceReplacementBase & {
  kind: "canonical-derived-projection";
};

export type V3CanonicalEventConsequenceReplacement = {
  kind: "canonical-event";
  declaredEvent: string;
  ownerDomain: string;
  canonicalEvents: readonly string[];
  aggregateType: string;
  producer: string;
  consumerParity: string;
  rationale: string;
  evidence: readonly string[];
};

export type V3ConsequenceReplacement =
  | V3ReadOnlyConsequenceReplacement
  | V3DerivedProjectionConsequenceReplacement
  | V3CanonicalEventConsequenceReplacement;

export type V3DomainConsequence = {
  eventType: string;
  ownerDomain: string;
  projections: readonly string[];
  taskEffects: readonly V3TaskEffect[];
  notificationEffects: readonly V3NotificationEffect[];
  publicationEffects: readonly V3PublicationEffect[];
  realtimeEffects: readonly V3RealtimeEffect[];
  analyticsEffects: readonly string[];
  auditRequired: boolean;
  consumers: readonly string[];
  /**
   * S1 records intended consequence ownership. S4/S5 upgrades consequences to
   * transactional event/outbox consumers; `declared` must not be mistaken for
   * proof that an event bus already executes these effects.
   */
  implementationState:
    | "declared"
    | "event-backed"
    | "replaced-by-canonical-event"
    | "replaced-by-read"
    | "replaced-by-derived-projection";
  replacement: V3ConsequenceReplacement | null;
  evidence: readonly string[];
};

const NOTIFICATION_PROVIDER_BY_DOMAIN_EVENT: Readonly<Record<string, readonly string[]>> = {
  "confirmation.window_changed": ["confirmation-window-and-deadlines"],
  "jury.opened": ["jury-open"],
  "televote.opened": ["televote-open"],
  "notice.published": ["official-communications"],
};

/**
 * Domain-level task declarations describe ownership, not causality for every
 * event. Notice publication/supersession cannot fabricate a delivery-failure
 * task, a queued/delivered notification is not itself a delivery failure, and
 * private/participant projections must not claim a canonical task worker until
 * that worker actually exists.
 */
const TASK_TYPES_BY_DOMAIN_EVENT: Readonly<Record<string, readonly string[]>> = {
  "acknowledgement.recorded": [],
  "notice.published": [],
  "notice.superseded": [],
  "notification.queued": [],
  "notification.delivered": [],
  "notification.failed": ["notification.delivery_failed"],
  "prediction.changed": [],
  "prediction.scored": [],
};

const EVENT_BACKED_CONSEQUENCES: Readonly<Record<string, readonly string[]>> = {
  "acknowledgement.recorded": [
    "supabase/migrations/20261017123000_v3_s5_acknowledgement_consequences.sql",
    "src/lib/v3-s5-acknowledgement-consequences.test.ts",
    ".github/scripts/v3-s5-acknowledgement-consequences-rehearsal.sh",
  ],
  "edition.archived": [
    "supabase/migrations/20261019112100_v3_s14_archive_consequence_reconciliation.sql",
    "src/lib/v3-s14-archive-consequences.contract.test.ts",
    ".github/scripts/v3-s14-archive-system-rehearsal.sh",
  ],
  "confirmation.submitted": [
    "supabase/migrations/20261015183000_v3_s5_confirmation_consequences.sql",
    ".github/scripts/v3-s5-confirmation-consequences-rehearsal.sh",
  ],
  "confirmation.window_changed": [
    "supabase/migrations/20261015183000_v3_s5_confirmation_consequences.sql",
    ".github/scripts/v3-s5-confirmation-consequences-rehearsal.sh",
  ],
  "entry.submitted": [
    "supabase/migrations/20261018081500_v3_s5_entry_lifecycle_consequences.sql",
    "src/lib/v3-s5-entry-lifecycle-consequences.test.ts",
    ".github/scripts/v3-s5-entry-lifecycle-consequences-rehearsal.sh",
  ],
  "entry.version_changed": [
    "supabase/migrations/20261018081500_v3_s5_entry_lifecycle_consequences.sql",
    "src/lib/v3-s5-entry-lifecycle-consequences.test.ts",
    ".github/scripts/v3-s5-entry-lifecycle-consequences-rehearsal.sh",
  ],
  "entry.reviewed": [
    "supabase/migrations/20261015201221_v3_s5_entry_consequences.sql",
    ".github/scripts/v3-s5-entry-consequences-rehearsal.sh",
  ],
  "entry.changes_requested": [
    "supabase/migrations/20261015201221_v3_s5_entry_consequences.sql",
    ".github/scripts/v3-s5-entry-consequences-rehearsal.sh",
  ],
  "media.reviewed": [
    "supabase/migrations/20261016050000_v3_s5_media_review_consequences.sql",
    "src/lib/v3-s5-media-consequences.test.ts",
  ],
  "jury.opened": [
    "supabase/migrations/20261016040000_v3_s5_jury_consequences.sql",
    "src/lib/v3-s5-jury-consequences.test.ts",
  ],
  "jury.closed": [
    "supabase/migrations/20261016040000_v3_s5_jury_consequences.sql",
    "src/lib/v3-s5-jury-consequences.test.ts",
  ],
  "jury.ballot_changed": [
    "supabase/migrations/20261016040000_v3_s5_jury_consequences.sql",
    "src/lib/v3-s5-jury-consequences.test.ts",
  ],
  "membership.changed": [
    "supabase/migrations/20261017100000_v3_s5_access_consequences.sql",
    "src/lib/v3-s5-access-consequences.test.ts",
    ".github/scripts/v3-s5-access-consequences-rehearsal.sh",
  ],
  "permissions.changed": [
    "supabase/migrations/20261017100000_v3_s5_access_consequences.sql",
    "src/lib/v3-s5-access-consequences.test.ts",
    ".github/scripts/v3-s5-access-consequences-rehearsal.sh",
  ],
  "preference.changed": [
    "supabase/migrations/20261017103000_v3_s5_preference_consequences.sql",
    "src/lib/v3-s5-preference-consequences.test.ts",
    ".github/scripts/v3-s5-preference-consequences-rehearsal.sh",
  ],
  "prediction.changed": [
    "supabase/migrations/20261017113000_v3_s5_prediction_round_consequences.sql",
    "src/lib/v3-s5-prediction-round-consequences.test.ts",
    ".github/scripts/v3-s5-prediction-round-consequences-rehearsal.sh",
  ],
  "prediction.scored": [
    "supabase/migrations/20261017110000_v3_s5_prediction_score_consequences.sql",
    "src/lib/v3-s5-prediction-score-consequences.test.ts",
    ".github/scripts/v3-s5-prediction-score-consequences-rehearsal.sh",
  ],
  "results.calculated": [
    "supabase/migrations/20261016053000_v3_s5_results_consequences.sql",
    "src/lib/v3-s5-results-consequences.test.ts",
    ".github/scripts/v3-s5-results-consequences-rehearsal.sh",
  ],
  "results.verified": [
    "supabase/migrations/20261016053000_v3_s5_results_consequences.sql",
    "src/lib/v3-s5-results-consequences.test.ts",
    ".github/scripts/v3-s5-results-consequences-rehearsal.sh",
  ],
  "results.locked": [
    "supabase/migrations/20261016053000_v3_s5_results_consequences.sql",
    "src/lib/v3-s5-results-consequences.test.ts",
    ".github/scripts/v3-s5-results-consequences-rehearsal.sh",
  ],
  "publication.changed": [
    "supabase/migrations/20261016060000_v3_s5_publication_consequences.sql",
    "src/lib/v3-s5-publication-consequences.test.ts",
    ".github/scripts/v3-s5-publication-consequences-rehearsal.sh",
  ],
  "publication.failed": [
    "supabase/migrations/20261016060000_v3_s5_publication_consequences.sql",
    "src/lib/v3-s5-publication-consequences.test.ts",
    ".github/scripts/v3-s5-publication-consequences-rehearsal.sh",
  ],
  "notice.published": [
    "supabase/migrations/20261016062000_v3_s5_notice_consequences.sql",
    "src/lib/v3-s5-notice-consequences.test.ts",
    ".github/scripts/v3-s5-notice-consequences-rehearsal.sh",
  ],
  "notice.superseded": [
    "supabase/migrations/20261016062000_v3_s5_notice_consequences.sql",
    "src/lib/v3-s5-notice-consequences.test.ts",
    ".github/scripts/v3-s5-notice-consequences-rehearsal.sh",
  ],
  "notification.queued": [
    "supabase/migrations/20261016064100_v3_s5_notification_consequences.sql",
    "src/lib/v3-s5-notification-consequences.test.ts",
    ".github/scripts/v3-s5-notification-consequences-rehearsal.sh",
  ],
  "notification.delivered": [
    "supabase/migrations/20261016064100_v3_s5_notification_consequences.sql",
    "src/lib/v3-s5-notification-consequences.test.ts",
    ".github/scripts/v3-s5-notification-consequences-rehearsal.sh",
  ],
  "notification.failed": [
    "supabase/migrations/20261016064100_v3_s5_notification_consequences.sql",
    "src/lib/v3-s5-notification-consequences.test.ts",
    ".github/scripts/v3-s5-notification-consequences-rehearsal.sh",
  ],
  "televote.opened": [
    "supabase/migrations/20261016043000_v3_s5_televote_consequences.sql",
    "src/lib/v3-s5-televote-consequences.test.ts",
  ],
  "televote.closed": [
    "supabase/migrations/20261016043000_v3_s5_televote_consequences.sql",
    "src/lib/v3-s5-televote-consequences.test.ts",
  ],
  "televote.ballot_submitted": [
    "supabase/migrations/20261016043000_v3_s5_televote_consequences.sql",
    "src/lib/v3-s5-televote-consequences.test.ts",
  ],
};

/**
 * Some legacy registry labels predate the canonical event vocabulary that the
 * authoritative producer already persists. These mappings are deliberately
 * exact and allowlisted: they may reconcile vocabulary, never invent a second
 * event or hide a missing producer/consumer effect.
 */
const CANONICAL_EVENT_REPLACEMENTS: Readonly<
  Record<string, V3CanonicalEventConsequenceReplacement>
> = {
  "story.changed": {
    kind: "canonical-event",
    declaredEvent: "story.changed",
    ownerDomain: "story",
    canonicalEvents: ["storyline.updated", "storyline.unpublished"],
    aggregateType: "storyline",
    producer:
      "public.studio2_execute_story_operation(uuid,text,text,uuid,bigint,uuid,jsonb)",
    consumerParity:
      "Storyline edits and unpublication synchronously update canonical storyline state before appending the precise contest event; Organizer snapshots and Public/Archive/Anniversary reads derive from that state, so no independent story.changed delivery effect remains.",
    rationale:
      "story.changed is an obsolete umbrella label. Canonical Storytelling distinguishes ordinary edits as storyline.updated and visibility removal as storyline.unpublished; emitting story.changed as well would duplicate the same mutation under a broader vocabulary.",
    evidence: [
      "supabase/migrations/20260912194100_studio2_storytelling_anniversary.sql",
      "supabase/migrations/20260912194200_studio2_storytelling_hardening.sql",
      "src/lib/contest-events.ts",
      "src/lib/studio2-storytelling-integration.test.ts",
      "src/lib/v3-r2-story-consequence-vocabulary.test.ts",
    ],
  },
  "story.published": {
    kind: "canonical-event",
    declaredEvent: "story.published",
    ownerDomain: "story",
    canonicalEvents: ["storyline.published"],
    aggregateType: "storyline",
    producer:
      "public.studio2_execute_story_operation(uuid,text,text,uuid,bigint,uuid,jsonb)",
    consumerParity:
      "Publishing synchronously marks the canonical storyline published and appends storyline.published in the same operation; public Story/Archive/Anniversary readers expose only that published canonical state, leaving no separate story.published delivery effect.",
    rationale:
      "The authoritative Storytelling vocabulary is storyline.published. A second story.published event would describe the same aggregate transition twice and create competing event truth.",
    evidence: [
      "supabase/migrations/20260912194100_studio2_storytelling_anniversary.sql",
      "supabase/migrations/20260912194200_studio2_storytelling_hardening.sql",
      "src/lib/contest-events.ts",
      "src/lib/studio2-storytelling-integration.test.ts",
      "src/lib/v3-r2-story-consequence-vocabulary.test.ts",
    ],
  },
};

/**
 * A canonical read/record can own an observational consequence without adding
 * a second DomainEvent solely to narrate the same durable fact. Replacements
 * remain strict, bounded, authorization-safe and evidence-backed.
 */
const READ_ONLY_REPLACEMENTS: Readonly<Record<string, V3ReadOnlyConsequenceReplacement>> = {
  "receipt.recorded": {
    kind: "canonical-read",
    ownerDomain: "receipt",
    operation: "public.studio2_reconcile_operation(uuid)",
    projection: "actor-scoped canonical operation receipt",
    boundedBy: "one operation id per invocation",
    rationale:
      "The receipt write is already the durable canonical fact. Receipt surfaces and lost-response recovery reread that exact actor-owned record; emitting a second receipt.recorded event would add no required write-side effect and would only duplicate the ledger.",
    evidence: [
      "supabase/migrations/20261014194651_v3_s2_operation_receipt_idempotency.sql",
      "src/lib/system-operation-reconciliation.server.ts",
      "src/lib/system-operation-reconciliation.server.test.ts",
      ".github/scripts/v3-operation-receipt-rehearsal.sh",
      "src/lib/v3-non-event-consequence-replacements.test.ts",
    ],
  },
  "receipt.reconciled": {
    kind: "canonical-read",
    ownerDomain: "receipt",
    operation: "public.studio2_reconcile_operation(uuid)",
    projection: "actor-scoped canonical operation receipt",
    boundedBy: "one operation id per invocation",
    rationale:
      "The STABLE RPC reads the actor's durable receipt without mutation. Recovery rereads and normalizes existing authority; it does not publish another receipt or invalidate the receipt it just read.",
    evidence: [
      "supabase/migrations/20261014194651_v3_s2_operation_receipt_idempotency.sql",
      "src/lib/system-operation-reconciliation.server.ts",
      "src/lib/system-operation-reconciliation.server.test.ts",
      ".github/scripts/v3-operation-receipt-rehearsal.sh",
      "src/lib/v3-receipt-reconciliation-consequence.test.ts",
    ],
  },
  "audit.recorded": {
    kind: "canonical-read",
    ownerDomain: "audit",
    operation: "authorized bounded admin_audit_log reads",
    projection: "Organizer recent changes and specialist audit history",
    boundedBy: "8 edition-scoped rows for V3 recent changes; 1-100 rows for the specialist audit view",
    rationale:
      "The append-only audit row is already the durable evidence. Organizer and specialist audit surfaces read that canonical table through RLS-protected bounded queries; emitting audit.recorded would make the audit log depend on a second event about the audit itself and risks recursive audit semantics.",
    evidence: [
      "supabase/migrations/20260914173633_canonical_admin_audit_log.sql",
      "supabase/migrations/20260914174742_permission_engine_v2_core_rls_cutover.sql",
      "src/integrations/supabase/admin-audit.server.ts",
      "src/lib/organizer-v3-projection.server.ts",
      "src/lib/admin-ops.ts",
      "src/lib/v3-non-event-consequence-replacements.test.ts",
    ],
  },
  "public_ux.observed": {
    kind: "canonical-read",
    ownerDomain: "public-ux",
    operation: "privacy-bounded public_ux_events + public.admin_public_ux_metrics(timestamptz)",
    projection: "aggregate public UX diagnostics",
    boundedBy:
      "maximum 180-day server-side aggregate horizon; constrained event payloads; top-destination/group result caps; no raw event rows returned to ordinary Public clients",
    rationale:
      "public_ux.observed is the privacy-minimized telemetry record itself, not a contest mutation requiring a second outbox fact. The canonical table constrains event vocabulary and metadata, browser collection is best-effort and disabled for automated browsers, and authorized diagnostics consume server-side aggregates without making telemetry contest-state authority.",
    evidence: [
      "supabase/migrations/20260919112555_public_ux_telemetry.sql",
      "src/lib/public-ux-events.ts",
      "src/lib/public-ux-metrics.ts",
      "src/lib/v3-public-ux-diagnostics.contract.test.ts",
      "src/lib/v3-beta-feedback-privacy.contract.test.ts",
      "src/lib/v3-derived-observation-consequence-replacements.test.ts",
    ],
  },
};

/**
 * Projection-state labels are not a second canonical workflow. These cases are
 * reconstructed from their authoritative source and reconciled automatically;
 * emitting synthetic DomainEvents would create competing truth rather than
 * preserving it.
 */
const DERIVED_PROJECTION_REPLACEMENTS: Readonly<
  Record<string, V3DerivedProjectionConsequenceReplacement>
> = {
  "task.opened": {
    kind: "canonical-derived-projection",
    ownerDomain: "task",
    operation:
      "tasksFromHodWorkspace(snapshot) + private.studio2_reconcile_all_organizer_tasks(uuid)",
    projection: "participant and Organizer task projections derived from canonical domain state",
    boundedBy:
      "one participant edition+country workspace snapshot and one Organizer edition per reconciliation invocation",
    rationale:
      "Task visibility is derived from canonical workflow conditions. Participant tasks are computed from the HOD workspace snapshot, while Organizer tasks use unique source keys and reconciliation to upsert active conditions and resolve stale ones. A task.opened event would duplicate projection state rather than own it.",
    evidence: [
      "src/lib/solaris-v6-runtime-authority.ts",
      "src/lib/participation-os.ts",
      "src/lib/participation-os-hod.test.ts",
      "src/components/mysolaris/modules/MySolarisTasksModule.tsx",
      "supabase/migrations/20261002211500_organisation_os_v5_task_engine.sql",
      "supabase/migrations/20261003154000_organisation_os_v5_r3_permission_tasks.sql",
      "supabase/migrations/20261004230000_organizer_task_runtime_reconciliation.sql",
      "supabase/migrations/20261021161000_v3_s14_task_reconciliation_service_boundary.sql",
      "src/lib/admin-tasks-v5.ts",
      "src/lib/organisation-task-runtime-reconciliation.contract.test.ts",
      "src/lib/v3-non-event-consequence-replacements.test.ts",
    ],
  },
  "task.resolved": {
    kind: "canonical-derived-projection",
    ownerDomain: "task",
    operation:
      "tasksFromHodWorkspace(snapshot) + private.studio2_reconcile_all_organizer_tasks(uuid)",
    projection: "participant and Organizer task projections derived from canonical domain state",
    boundedBy:
      "one participant edition+country workspace snapshot and one Organizer edition per reconciliation invocation",
    rationale:
      "Task resolution follows canonical domain truth. Participant actions disappear when the HOD snapshot no longer requires them, and Organizer reconciliation marks derived task rows resolved when their source condition is gone. A task.resolved event would create competing task truth instead of preserving automatic resolution.",
    evidence: [
      "src/lib/solaris-v6-runtime-authority.ts",
      "src/lib/participation-os.ts",
      "src/lib/participation-os-hod.test.ts",
      "src/components/mysolaris/modules/MySolarisTasksModule.tsx",
      "supabase/migrations/20261002211500_organisation_os_v5_task_engine.sql",
      "supabase/migrations/20261003154000_organisation_os_v5_r3_permission_tasks.sql",
      "supabase/migrations/20261004230000_organizer_task_runtime_reconciliation.sql",
      "supabase/migrations/20261021161000_v3_s14_task_reconciliation_service_boundary.sql",
      "src/lib/admin-tasks-v5.ts",
      "src/lib/organisation-task-runtime-reconciliation.contract.test.ts",
      "src/lib/v3-non-event-consequence-replacements.test.ts",
    ],
  },
  "job.started": {
    kind: "canonical-derived-projection",
    ownerDomain: "system-job",
    operation:
      "pg_cron job/run state + private.studio2_reconcile_system_job_tasks() + public.admin_system_runtime_health(integer)",
    projection: "Organizer job health, retry diagnostics and failure tasks",
    boundedBy:
      "Solaris-owned pg_cron jobs only; latest completed run plus at most three recent runs per job for recovery classification; recent delivery diagnostics capped at 1-100",
    rationale:
      "Scheduler lifecycle is already authoritative in pg_cron. Solaris derives health and retry state from that source instead of creating a second job ledger; start is observational scheduler state and has no independent downstream write-side consequence to emit.",
    evidence: [
      "supabase/migrations/20261003161000_organisation_os_v5_system_job_recovery.sql",
      "src/lib/organisation-v5-system-job-recovery.test.ts",
      "docs/organisation-os-v5/state-transition-inventory.yml",
      "src/routes/_authenticated/admin/system-operations.tsx",
      "src/lib/v3-derived-observation-consequence-replacements.test.ts",
    ],
  },
  "job.completed": {
    kind: "canonical-derived-projection",
    ownerDomain: "system-job",
    operation:
      "pg_cron job/run state + private.studio2_reconcile_system_job_tasks() + public.admin_system_runtime_health(integer)",
    projection: "Organizer job health, retry diagnostics and failure-task reconciliation",
    boundedBy:
      "Solaris-owned pg_cron jobs only; latest completed run plus at most three recent runs per job for recovery classification; recent delivery diagnostics capped at 1-100",
    rationale:
      "A successful scheduler run is already durable scheduler history. Reconciliation resolves any stale system-job failure task only after authoritative scheduler recovery, so a synthetic job.completed DomainEvent would duplicate the state that owns recovery.",
    evidence: [
      "supabase/migrations/20261003161000_organisation_os_v5_system_job_recovery.sql",
      "src/lib/organisation-v5-system-job-recovery.test.ts",
      "docs/organisation-os-v5/state-transition-inventory.yml",
      "src/routes/_authenticated/admin/system-operations.tsx",
      "src/lib/v3-derived-observation-consequence-replacements.test.ts",
    ],
  },
  "job.failed": {
    kind: "canonical-derived-projection",
    ownerDomain: "system-job",
    operation:
      "pg_cron job/run state + private.studio2_reconcile_system_job_tasks() + public.admin_system_runtime_health(integer)",
    projection: "Organizer job health, bounded retry/dead-letter diagnostics and canonical failure tasks",
    boundedBy:
      "Solaris-owned pg_cron jobs only; latest completed run plus at most three recent runs per job for recovery classification; recent delivery diagnostics capped at 1-100",
    rationale:
      "Failed/inactive Solaris jobs already project deterministically from pg_cron into one unique source-key Organizer task, with repeated failures classified as dead-letter attention and success resolving the task. That is the required consequence; a parallel job.failed event ledger would create duplicate retry truth.",
    evidence: [
      "supabase/migrations/20261003161000_organisation_os_v5_system_job_recovery.sql",
      "src/lib/organisation-v5-system-job-recovery.test.ts",
      "docs/organisation-os-v5/state-transition-inventory.yml",
      "src/routes/_authenticated/admin/system-operations.tsx",
      "src/lib/v3-derived-observation-consequence-replacements.test.ts",
    ],
  },
  "activity.projected": {
    kind: "canonical-derived-projection",
    ownerDomain: "activity",
    operation: "public.v3_my_participant_activity(timestamptz,integer,uuid)",
    projection:
      "recipient-scoped participant activity reconstructed from canonical completed operations",
    boundedBy:
      "authenticated actor only; allowlisted operation families; 1-50 rows per page with a stable timestamp+operation cursor",
    rationale:
      "Activity has no independent mutable authority. The STABLE recipient-scoped RPC reconstructs it from succeeded operation receipts and the canonical jury operation ledger, then derives current/superseded/unavailable state from canonical domain rows. Emitting activity.projected would only narrate a deterministic read projection.",
    evidence: [
      "supabase/migrations/20261019213500_v3_participant_activity_projection.sql",
      "src/integrations/v3/participant-activity.server.ts",
      "src/lib/v3-participant-activity-system.contract.test.ts",
      "src/lib/v3-r2-activity-consequence-replacement.test.ts",
    ],
  },
};

export function v3DomainConsequenceImplementationErrors(consequence: V3DomainConsequence) {
  if (consequence.implementationState === "declared") {
    return consequence.replacement ? ["declared consequence has a replacement claim"] : [];
  }
  if (consequence.implementationState === "event-backed") {
    const evidence = EVENT_BACKED_CONSEQUENCES[consequence.eventType];
    return evidence?.length &&
      evidence.every((path) => consequence.evidence.includes(path)) &&
      !consequence.replacement
      ? []
      : ["event-backed consequence lacks its canonical implementation evidence"];
  }

  if (consequence.implementationState === "replaced-by-canonical-event") {
    const actual = consequence.replacement;
    const expected = CANONICAL_EVENT_REPLACEMENTS[consequence.eventType];
    if (
      !expected ||
      !actual ||
      actual.kind !== "canonical-event" ||
      consequence.ownerDomain !== expected.ownerDomain
    ) {
      return ["unknown canonical-event replacement or mismatched owner"];
    }
    for (const key of [
      "kind",
      "declaredEvent",
      "ownerDomain",
      "aggregateType",
      "producer",
      "consumerParity",
      "rationale",
    ] as const) {
      if (actual[key] !== expected[key]) {
        return ["canonical-event replacement differs from its allowlisted contract"];
      }
    }
    if (actual.declaredEvent !== consequence.eventType) {
      return ["canonical-event replacement must name the exact declared consequence"];
    }
    if (
      !actual.canonicalEvents.length ||
      actual.canonicalEvents.includes(consequence.eventType) ||
      new Set(actual.canonicalEvents).size !== actual.canonicalEvents.length ||
      actual.canonicalEvents.length !== expected.canonicalEvents.length ||
      !expected.canonicalEvents.every(
        (eventType, index) => actual.canonicalEvents[index] === eventType,
      )
    ) {
      return ["canonical-event replacement has invalid or unrelated canonical vocabulary"];
    }
    if (
      actual.evidence.length !== expected.evidence.length ||
      !expected.evidence.every(
        (path) => actual.evidence.includes(path) && consequence.evidence.includes(path),
      )
    ) {
      return ["canonical-event replacement lacks producer/consumer behavioral evidence"];
    }
    if (
      consequence.taskEffects.length ||
      consequence.notificationEffects.length ||
      consequence.publicationEffects.length ||
      consequence.realtimeEffects.length ||
      consequence.analyticsEffects.length ||
      consequence.auditRequired
    ) {
      return ["canonical-event replacement must not retain obsolete alias delivery effects"];
    }
    return [];
  }

  const actual = consequence.replacement;
  const expected =
    consequence.implementationState === "replaced-by-read"
      ? READ_ONLY_REPLACEMENTS[consequence.eventType]
      : consequence.implementationState === "replaced-by-derived-projection"
        ? DERIVED_PROJECTION_REPLACEMENTS[consequence.eventType]
        : null;
  if (
    !expected ||
    !actual ||
    actual.kind === "canonical-event" ||
    consequence.ownerDomain !== expected.ownerDomain
  ) {
    return ["unknown consequence replacement or mismatched owner"];
  }
  for (const key of [
    "kind",
    "ownerDomain",
    "operation",
    "projection",
    "boundedBy",
    "rationale",
  ] as const) {
    if (actual[key] !== expected[key]) {
      return ["consequence replacement differs from its canonical contract"];
    }
  }
  if (
    !Array.isArray(actual.evidence) ||
    !Array.isArray(consequence.evidence) ||
    actual.evidence.length !== expected.evidence.length ||
    !expected.evidence.every(
      (path) => actual.evidence.includes(path) && consequence.evidence.includes(path),
    )
  ) {
    return ["consequence replacement lacks its implementation and behavioral evidence"];
  }
  if (
    consequence.taskEffects.length ||
    consequence.notificationEffects.length ||
    consequence.publicationEffects.length ||
    consequence.realtimeEffects.length ||
    consequence.analyticsEffects.length ||
    consequence.auditRequired
  ) {
    return ["a canonical consequence replacement must not retain invented event delivery effects"];
  }
  return [];
}

/** Resolved replacements preserve the catalog identity without fabricating an event bus. */
export function isResolvedV3DomainConsequence(consequence: V3DomainConsequence) {
  return (
    consequence.implementationState !== "declared" &&
    v3DomainConsequenceImplementationErrors(consequence).length === 0
  );
}

export function isV3ReadOnlyConsequenceReplacement(consequence: V3DomainConsequence) {
  return (
    consequence.implementationState === "replaced-by-read" &&
    isResolvedV3DomainConsequence(consequence)
  );
}

export function isV3DerivedConsequenceReplacement(consequence: V3DomainConsequence) {
  return (
    consequence.implementationState === "replaced-by-derived-projection" &&
    isResolvedV3DomainConsequence(consequence)
  );
}

export function isV3CanonicalEventConsequenceReplacement(consequence: V3DomainConsequence) {
  return (
    consequence.implementationState === "replaced-by-canonical-event" &&
    isResolvedV3DomainConsequence(consequence)
  );
}

export function isV3NonEventConsequenceReplacement(consequence: V3DomainConsequence) {
  return (
    isV3ReadOnlyConsequenceReplacement(consequence) ||
    isV3DerivedConsequenceReplacement(consequence)
  );
}

const providerIds: ReadonlySet<string> = new Set(
  V3_NOTIFICATION_PROVIDER_REGISTRY.map((provider) => provider.id),
);

function unique(values: readonly string[]) {
  return [...new Set(values)];
}

/**
 * Machine-readable S1 consequence inventory.
 *
 * The registry is intentionally derived from the canonical domain registry so
 * a new declared domain event cannot exist without at least owning its affected
 * projections, task re-evaluation and consumers. Explicit notification
 * producers are mapped only where the current code has evidence for that event;
 * we do not pretend every domain mutation sends a notification.
 *
 * `implementationState: declared` means ownership is documented but the
 * owning command has not yet proven transactional S4 emission plus executable
 * consequence consumers. Only events with concrete migration/rehearsal evidence
 * may be marked `event-backed`. Canonical-event vocabulary replacements and
 * non-event replacements are allowed only through the strict allowlists above
 * with inspectable producer/consumer or bounded projection evidence.
 */
export const V3_DOMAIN_CONSEQUENCE_REGISTRY: readonly V3DomainConsequence[] =
  V3_SYSTEM_DOMAIN_REGISTRY.flatMap((domain) =>
    domain.eventTypes.map((eventType) => {
      const domainTaskTypes = domain.backgroundConsumers
        .filter((consumer) => consumer.startsWith("task:"))
        .map((consumer) => consumer.slice("task:".length));
      const taskTypes = TASK_TYPES_BY_DOMAIN_EVENT[eventType] ?? domainTaskTypes;
      const nonTaskBackgroundConsumers = domain.backgroundConsumers.filter(
        (consumer) => !consumer.startsWith("task:"),
      );
      const notificationProviders = NOTIFICATION_PROVIDER_BY_DOMAIN_EVENT[eventType] ?? [];
      const publicProjections = domain.publicConsumers.filter(Boolean);
      const consumers = unique([
        ...domain.publicConsumers,
        ...domain.organizerConsumers,
        ...nonTaskBackgroundConsumers,
        ...taskTypes.map((taskType) => `task:${taskType}`),
      ]);
      const eventBackedEvidence = EVENT_BACKED_CONSEQUENCES[eventType];
      const canonicalEventReplacement = CANONICAL_EVENT_REPLACEMENTS[eventType] ?? null;
      const readReplacement = READ_ONLY_REPLACEMENTS[eventType] ?? null;
      const derivedReplacement = DERIVED_PROJECTION_REPLACEMENTS[eventType] ?? null;
      const replacement = canonicalEventReplacement ?? readReplacement ?? derivedReplacement ?? null;

      return {
        eventType,
        ownerDomain: domain.domain,
        projections: domain.projections,
        taskEffects: replacement
          ? []
          : taskTypes.map((taskType) => ({ effect: "re-evaluate", taskType } as const)),
        notificationEffects: replacement
          ? []
          : notificationProviders.map((providerId) => ({
              effect: "evaluate-provider",
              providerId,
            } as const)),
        publicationEffects: replacement
          ? []
          : publicProjections.map((projection) => ({
              effect: "re-evaluate-visibility",
              projection,
            } as const)),
        realtimeEffects: replacement
          ? []
          : domain.projections.map((projection) => ({
              effect: "invalidate-projection",
              projection,
            } as const)),
        analyticsEffects: replacement ? [] : [`domain-event:${eventType}`],
        auditRequired:
          !replacement &&
          (domain.sensitivityClass !== "public" || domain.mutationCommands.length > 0),
        consumers,
        implementationState: canonicalEventReplacement
          ? "replaced-by-canonical-event"
          : readReplacement
            ? "replaced-by-read"
            : derivedReplacement
              ? "replaced-by-derived-projection"
              : eventBackedEvidence
                ? "event-backed"
                : "declared",
        replacement,
        evidence: replacement
          ? unique([...domain.ownershipEvidence, ...replacement.evidence])
          : eventBackedEvidence
            ? unique([...domain.ownershipEvidence, ...eventBackedEvidence])
            : domain.ownershipEvidence,
      } satisfies V3DomainConsequence;
    }),
  );

export function v3DomainConsequence(eventType: string) {
  return V3_DOMAIN_CONSEQUENCE_REGISTRY.find((item) => item.eventType === eventType) ?? null;
}

export function validateV3DomainConsequenceRegistry() {
  const errors: string[] = [];
  const seen = new Set<string>();
  const expected = new Set(V3_SYSTEM_DOMAIN_REGISTRY.flatMap((domain) => domain.eventTypes));
  const declaredTasksByDomain = new Map(
    V3_SYSTEM_DOMAIN_REGISTRY.map((domain) => [
      domain.domain,
      new Set(
        domain.backgroundConsumers
          .filter((consumer) => consumer.startsWith("task:"))
          .map((consumer) => consumer.slice("task:".length)),
      ),
    ]),
  );

  for (const consequence of V3_DOMAIN_CONSEQUENCE_REGISTRY) {
    for (const issue of v3DomainConsequenceImplementationErrors(consequence)) {
      errors.push(`${consequence.eventType}: ${issue}`);
    }
    if (seen.has(consequence.eventType)) errors.push(`duplicate event ${consequence.eventType}`);
    seen.add(consequence.eventType);
    if (!v3SystemDomain(consequence.ownerDomain)) {
      errors.push(`${consequence.eventType} has unknown owner domain ${consequence.ownerDomain}`);
    }
    for (const task of consequence.taskEffects) {
      if (!declaredTasksByDomain.get(consequence.ownerDomain)?.has(task.taskType)) {
        errors.push(`${consequence.eventType} references unknown task ${task.taskType}`);
      }
    }
    for (const notification of consequence.notificationEffects) {
      if (!providerIds.has(notification.providerId)) {
        errors.push(
          `${consequence.eventType} references unknown notification provider ${notification.providerId}`,
        );
      }
    }
    if (consequence.implementationState === "event-backed") {
      const evidence = EVENT_BACKED_CONSEQUENCES[consequence.eventType];
      if (!evidence?.length) {
        errors.push(
          `${consequence.eventType} claims event-backed consequences without implementation evidence`,
        );
      }
    }
  }

  for (const eventType of expected) {
    if (!seen.has(eventType)) errors.push(`unmapped consequential event ${eventType}`);
  }
  for (const eventType of seen) {
    if (!expected.has(eventType)) errors.push(`consequence registry has orphan event ${eventType}`);
  }
  return errors;
}
