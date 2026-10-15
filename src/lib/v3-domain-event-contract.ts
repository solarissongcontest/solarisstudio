export type V3DomainEvent = {
  id: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  aggregateVersion: number;
  operationId: string;
  correlationId: string;
  editionId?: string | null;
  showId?: string | null;
  actorId?: string | null;
  occurredAt: string;
  payload: Record<string, unknown>;
  schemaVersion: number;
};

export type V3DomainEventDeliveryState =
  | "pending"
  | "processing"
  | "completed"
  | "dead_letter";

export type V3DomainEventDelivery = {
  eventId: string;
  consumerKey: string;
  status: V3DomainEventDeliveryState;
  attemptCount: number;
  availableAt: string;
  leaseOwner?: string | null;
  leaseExpiresAt?: string | null;
  lastErrorCode?: string | null;
  lastErrorMetadata?: Record<string, unknown> | null;
  completedAt?: string | null;
  deadLetteredAt?: string | null;
};

/**
 * Machine-readable S4 infrastructure evidence.
 *
 * This proves the shared event/outbox substrate exists. It intentionally does
 * not claim any consequence-registry event is event-backed yet; S5 flips those
 * event types only after their owning command emits the event transactionally
 * and the declared consumers are implemented.
 */
export const V3_DOMAIN_EVENT_INFRASTRUCTURE = {
  implementationState: "foundation" as const,
  migration: "20261015180000_v3_s4_domain_event_outbox.sql",
  eventTable: "private.v3_domain_events",
  outboxTable: "private.v3_domain_event_outbox",
  consumerReceiptTable: "private.v3_domain_event_consumer_receipts",
  emitter: "private.v3_emit_domain_event",
  workerRpcs: {
    claim: "public.studio2_claim_domain_event_deliveries",
    complete: "public.studio2_complete_domain_event_delivery",
    fail: "public.studio2_fail_domain_event_delivery",
    requeueDeadLetter: "public.studio2_requeue_dead_letter_domain_event",
  },
  properties: [
    "immutable-events",
    "operation-bound",
    "correlation-bound",
    "transactional-outbox",
    "per-consumer-delivery",
    "processing-leases",
    "idempotent-consumer-receipts",
    "retry",
    "dead-letter",
    "dead-letter-requeue",
    "service-role-workers",
  ] as const,
} as const;
