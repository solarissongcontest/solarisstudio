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
  implementationState: "declared" | "event-backed";
  evidence: readonly string[];
};

const NOTIFICATION_PROVIDER_BY_DOMAIN_EVENT: Readonly<Record<string, readonly string[]>> = {
  "confirmation.window_changed": ["confirmation-window-and-deadlines"],
  "jury.opened": ["jury-open"],
  "televote.opened": ["televote-open"],
  "notice.published": ["official-communications"],
};

const EVENT_BACKED_CONSEQUENCES: Readonly<Record<string, readonly string[]>> = {
  "confirmation.submitted": [
    "supabase/migrations/20261015183000_v3_s5_confirmation_consequences.sql",
    ".github/scripts/v3-s5-confirmation-consequences-rehearsal.sh",
  ],
  "confirmation.window_changed": [
    "supabase/migrations/20261015183000_v3_s5_confirmation_consequences.sql",
    ".github/scripts/v3-s5-confirmation-consequences-rehearsal.sh",
  ],
  "entry.submitted": [
    "supabase/migrations/20261015190000_v3_s5_entry_consequences.sql",
    ".github/scripts/v3-s5-entry-consequences-rehearsal.sh",
  ],
  "entry.reviewed": [
    "supabase/migrations/20261015190000_v3_s5_entry_consequences.sql",
    ".github/scripts/v3-s5-entry-consequences-rehearsal.sh",
  ],
  "entry.changes_requested": [
    "supabase/migrations/20261015190000_v3_s5_entry_consequences.sql",
    ".github/scripts/v3-s5-entry-consequences-rehearsal.sh",
  ],
};

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
 * may be marked `event-backed`.
 */
export const V3_DOMAIN_CONSEQUENCE_REGISTRY: readonly V3DomainConsequence[] =
  V3_SYSTEM_DOMAIN_REGISTRY.flatMap((domain) =>
    domain.eventTypes.map((eventType) => {
      const taskTypes = domain.backgroundConsumers
        .filter((consumer) => consumer.startsWith("task:"))
        .map((consumer) => consumer.slice("task:".length));
      const notificationProviders = NOTIFICATION_PROVIDER_BY_DOMAIN_EVENT[eventType] ?? [];
      const publicProjections = domain.publicConsumers.filter(Boolean);
      const consumers = unique([
        ...domain.publicConsumers,
        ...domain.organizerConsumers,
        ...domain.backgroundConsumers,
      ]);
      const eventBackedEvidence = EVENT_BACKED_CONSEQUENCES[eventType];

      return {
        eventType,
        ownerDomain: domain.domain,
        projections: domain.projections,
        taskEffects: taskTypes.map((taskType) => ({ effect: "re-evaluate", taskType } as const)),
        notificationEffects: notificationProviders.map((providerId) => ({
          effect: "evaluate-provider",
          providerId,
        } as const)),
        publicationEffects: publicProjections.map((projection) => ({
          effect: "re-evaluate-visibility",
          projection,
        } as const)),
        realtimeEffects: domain.projections.map((projection) => ({
          effect: "invalidate-projection",
          projection,
        } as const)),
        analyticsEffects: [`domain-event:${eventType}`],
        auditRequired:
          domain.sensitivityClass !== "public" ||
          domain.mutationCommands.length > 0,
        consumers,
        implementationState: eventBackedEvidence ? "event-backed" : "declared",
        evidence: eventBackedEvidence
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

  for (const consequence of V3_DOMAIN_CONSEQUENCE_REGISTRY) {
    if (seen.has(consequence.eventType)) errors.push(`duplicate event ${consequence.eventType}`);
    seen.add(consequence.eventType);
    if (!v3SystemDomain(consequence.ownerDomain)) {
      errors.push(`${consequence.eventType} has unknown owner domain ${consequence.ownerDomain}`);
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
