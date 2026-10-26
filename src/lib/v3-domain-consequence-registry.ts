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

export type V3ConsequenceReplacement =
  | V3ReadOnlyConsequenceReplacement
  | V3DerivedProjectionConsequenceReplacement;

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
 * A reconciliation read is not a mutating domain event. Keep the old logical
 * catalog identity traceable, but replace its invented side-effect contract with
 * the existing bounded, actor-scoped canonical read. This must never turn an
 * unimplemented mutation into an implemented consequence.
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
};

/**
 * Task open/resolved are projection state, not a second canonical workflow.
 * Participant tasks are derived from the bounded HOD workspace snapshot and
 * Organizer tasks are deterministically reconciled from domain truth. Keep the
 * old catalog names traceable while explicitly proving that no DomainEvent is
 * required merely to describe a derived task appearing or disappearing.
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

  const actual = consequence.replacement;
  const expected =
    consequence.implementationState === "replaced-by-read"
      ? READ_ONLY_REPLACEMENTS[consequence.eventType]
      : consequence.implementationState === "replaced-by-derived-projection"
        ? DERIVED_PROJECTION_REPLACEMENTS[consequence.eventType]
        : null;
  if (!expected || !actual || consequence.ownerDomain !== expected.ownerDomain) {
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
 * may be marked `event-backed`. A non-event replacement is allowed only through
 * the strict allowlists above with bounded, inspectable runtime evidence.
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
      const readReplacement = READ_ONLY_REPLACEMENTS[eventType] ?? null;
      const derivedReplacement = DERIVED_PROJECTION_REPLACEMENTS[eventType] ?? null;
      const replacement = readReplacement ?? derivedReplacement ?? null;

      return {
        eventType,
        ownerDomain: domain.domain,
        projections: domain.projections,
        taskEffects: replacement ? [] : taskTypes.map((taskType) => ({ effect: "re-evaluate", taskType } as const)),
        notificationEffects: replacement ? [] : notificationProviders.map((providerId) => ({
          effect: "evaluate-provider",
          providerId,
        } as const)),
        publicationEffects: replacement ? [] : publicProjections.map((projection) => ({
          effect: "re-evaluate-visibility",
          projection,
        } as const)),
        realtimeEffects: replacement ? [] : domain.projections.map((projection) => ({
          effect: "invalidate-projection",
          projection,
        } as const)),
        analyticsEffects: replacement ? [] : [`domain-event:${eventType}`],
        auditRequired:
          !replacement && (domain.sensitivityClass !== "public" ||
          domain.mutationCommands.length > 0),
        consumers,
        implementationState: readReplacement
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
        errors.push(`${consequence.eventType} references unknown notification provider ${notification.providerId}`);
      }
    }
    if (consequence.implementationState === "event-backed") {
      const evidence = EVENT_BACKED_CONSEQUENCES[consequence.eventType];
      if (!evidence?.length) {
        errors.push(`${consequence.eventType} claims event-backed consequences without implementation evidence`);
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
