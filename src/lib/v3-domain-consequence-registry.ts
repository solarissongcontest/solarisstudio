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

export type V3ReadOnlyConsequenceReplacement = {
  kind: "canonical-read";
  ownerDomain: string;
  operation: string;
  projection: string;
  boundedBy: string;
  rationale: string;
  evidence: readonly string[];
};

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
   * `declared` records ownership only.
   * `event-backed` means required async consequences have executable consumers.
   * `persisted-observational` means the event is atomically persisted with the
   * canonical command but has no correctness-critical async consequence; readers
   * recover by re-reading canonical state.
   * `replaced-by-read` is a bounded canonical read rather than a mutation event.
   */
  implementationState: "declared" | "event-backed" | "persisted-observational" | "replaced-by-read";
  replacement: V3ReadOnlyConsequenceReplacement | null;
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
 *
 * Show state/cue events are also deliberately empty here. The old live-show
 * domain registry named `show.blocker`, but there is no executable show-blocker
 * worker. The governed show/cue commands now commit canonical state first and
 * persist the event as an observational invalidation/audit fact. Inventing a
 * task consumer would make the release dashboard greener and the architecture
 * less true, which is an impressively bad trade.
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
  "show.changed": [],
  "show.cue_changed": [],
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
 * Persisted observational events are still real DomainEvents. Their canonical
 * mutation is already committed transactionally and no correctness-critical
 * task, notification, publication or projection worker depends on async
 * delivery. Realtime may observe/invalidate opportunistically, but missed
 * delivery recovers by re-reading the canonical show/cue revision.
 */
const PERSISTED_OBSERVATIONAL_CONSEQUENCES: Readonly<Record<string, readonly string[]>> = {
  "show.changed": [
    "supabase/migrations/20261027211500_v3_show_runtime_authority.sql",
    "supabase/migrations/20261027213000_v3_show_definition_authority.sql",
    "src/lib/v3-show-authority.contract.test.ts",
    "src/lib/v3-organizer-show-mode-review-boundary.contract.test.ts",
  ],
  "show.cue_changed": [
    "supabase/migrations/20261027204500_v3_show_cue_authority.sql",
    "src/lib/studio2-broadcast-rundown-integration.test.ts",
  ],
};

/**
 * A reconciliation read is not a mutating domain event. Keep the old logical
 * catalog identity traceable, but replace its invented side-effect contract with
 * the existing bounded, actor-scoped canonical read. This must never turn an
 * unimplemented mutation into an implemented consequence.
 */
const READ_ONLY_REPLACEMENTS: Readonly<Record<string, V3ReadOnlyConsequenceReplacement>> = {
  "activity.projected": {
    kind: "canonical-read",
    ownerDomain: "activity",
    operation: "public.v3_my_participant_activity(timestamptz,integer,uuid)",
    projection: "recipient-scoped participant activity from canonical completed operations",
    boundedBy: "authenticated recipient; at most 50 rows per keyset page",
    rationale:
      "The Activity domain has no mutation commands: its specification requires reconstruction from canonical source events. The STABLE recipient RPC derives safe history from completed operation ledgers without a separate writable feed or a new activity event on every read.",
    evidence: [
      "src/lib/solaris-v6-domain-registry.ts",
      "supabase/migrations/20261019213500_v3_participant_activity_projection.sql",
      "src/integrations/v3/participant-activity.server.ts",
      "src/lib/v3-participant-activity-adapter.test.ts",
      ".github/scripts/v3-participant-activity-regression.sh",
      ".github/tests/v3-participant-activity.sql",
      "src/lib/v3-activity-projection-consequence.test.ts",
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
};

export function v3DomainConsequenceImplementationErrors(consequence: V3DomainConsequence) {
  if (consequence.implementationState === "declared") {
    return consequence.replacement ? ["declared consequence has a replacement claim"] : [];
  }
  if (consequence.implementationState === "event-backed") {
    const evidence = EVENT_BACKED_CONSEQUENCES[consequence.eventType];
    return evidence?.length && evidence.every((path) => consequence.evidence.includes(path)) && !consequence.replacement
      ? []
      : ["event-backed consequence lacks its canonical implementation evidence"];
  }
  if (consequence.implementationState === "persisted-observational") {
    const evidence = PERSISTED_OBSERVATIONAL_CONSEQUENCES[consequence.eventType];
    if (!evidence?.length || !evidence.every((path) => consequence.evidence.includes(path)) || consequence.replacement) {
      return ["persisted observational consequence lacks its canonical operation/event evidence"];
    }
    if (consequence.taskEffects.length || consequence.notificationEffects.length ||
        consequence.publicationEffects.length || consequence.realtimeEffects.length ||
        consequence.analyticsEffects.length || consequence.consumers.length) {
      return ["persisted observational event must not claim required asynchronous consumers"];
    }
    return consequence.auditRequired ? [] : ["persisted observational event must retain audit evidence"];
  }
  if (consequence.implementationState !== "replaced-by-read") return ["unknown consequence implementation state"];

  const expected = READ_ONLY_REPLACEMENTS[consequence.eventType];
  const actual = consequence.replacement;
  if (!expected || !actual || consequence.ownerDomain !== expected.ownerDomain) {
    return ["unknown read-only replacement or mismatched owner"];
  }
  for (const key of ["kind", "ownerDomain", "operation", "projection", "boundedBy", "rationale"] as const) {
    if (actual[key] !== expected[key]) return ["read-only replacement differs from its canonical contract"];
  }
  if (!Array.isArray(actual.evidence) || !Array.isArray(consequence.evidence) ||
      actual.evidence.length !== expected.evidence.length ||
      !expected.evidence.every((path) => actual.evidence.includes(path) && consequence.evidence.includes(path))) {
    return ["read-only replacement lacks its implementation and behavioral evidence"];
  }
  if (consequence.taskEffects.length || consequence.notificationEffects.length ||
      consequence.publicationEffects.length || consequence.realtimeEffects.length ||
      consequence.analyticsEffects.length || consequence.auditRequired) {
    return ["a canonical read replacement must not invent mutating or delivery effects"];
  }
  return [];
}

/** Resolved includes explicit read replacement and persisted observational facts. */
export function isResolvedV3DomainConsequence(consequence: V3DomainConsequence) {
  return consequence.implementationState !== "declared" &&
    v3DomainConsequenceImplementationErrors(consequence).length === 0;
}

export function isV3ReadOnlyConsequenceReplacement(consequence: V3DomainConsequence) {
  return consequence.implementationState === "replaced-by-read" && isResolvedV3DomainConsequence(consequence);
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
 * may be marked event-backed, and only events with no required async consequence
 * may be marked persisted-observational.
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
      const observationalEvidence = PERSISTED_OBSERVATIONAL_CONSEQUENCES[eventType];
      const replacement = READ_ONLY_REPLACEMENTS[eventType] ?? null;
      // Media verification commits its canonical row, receipt and event before
      // any optional consumer; no async writer owns verification truth.
      const noRequiredMediaEffects = eventType === "media.verified";
      const noAsyncEffects = Boolean(replacement || observationalEvidence || noRequiredMediaEffects);

      return {
        eventType,
        ownerDomain: domain.domain,
        projections: domain.projections,
        taskEffects: noAsyncEffects ? [] : taskTypes.map((taskType) => ({ effect: "re-evaluate", taskType } as const)),
        notificationEffects: noAsyncEffects ? [] : notificationProviders.map((providerId) => ({
          effect: "evaluate-provider",
          providerId,
        } as const)),
        publicationEffects: noAsyncEffects ? [] : publicProjections.map((projection) => ({
          effect: "re-evaluate-visibility",
          projection,
        } as const)),
        realtimeEffects: noAsyncEffects ? [] : domain.projections.map((projection) => ({
          effect: "invalidate-projection",
          projection,
        } as const)),
        analyticsEffects: noAsyncEffects ? [] : [`domain-event:${eventType}`],
        auditRequired: observationalEvidence
          ? true
          : !replacement && (domain.sensitivityClass !== "public" || domain.mutationCommands.length > 0),
        consumers: observationalEvidence || noRequiredMediaEffects ? [] : consumers,
        implementationState: replacement
          ? "replaced-by-read"
          : eventBackedEvidence
            ? "event-backed"
            : observationalEvidence
              ? "persisted-observational"
              : "declared",
        replacement,
        evidence: replacement
          ? unique([...domain.ownershipEvidence, ...replacement.evidence])
          : eventBackedEvidence
            ? unique([...domain.ownershipEvidence, ...eventBackedEvidence])
            : observationalEvidence
              ? unique([...domain.ownershipEvidence, ...observationalEvidence])
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
    if (consequence.implementationState === "persisted-observational") {
      const evidence = PERSISTED_OBSERVATIONAL_CONSEQUENCES[consequence.eventType];
      if (!evidence?.length) {
        errors.push(`${consequence.eventType} claims persisted observational semantics without implementation evidence`);
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
