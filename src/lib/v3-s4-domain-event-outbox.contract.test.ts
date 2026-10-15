import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { V3_DOMAIN_EVENT_INFRASTRUCTURE } from "./v3-domain-event-contract";
import { V3_DOMAIN_CONSEQUENCE_REGISTRY } from "./v3-domain-consequence-registry";

const migration = readFileSync(
  "supabase/migrations/20261015180000_v3_s4_domain_event_outbox.sql",
  "utf8",
);
const rehearsal = readFileSync(
  ".github/scripts/v3-s4-domain-event-outbox-rehearsal.sh",
  "utf8",
);

describe("System V3 S4 DomainEvent/outbox foundation", () => {
  it("matches the canonical DomainEvent envelope and operation/correlation ownership", () => {
    expect(migration).toContain("create table private.v3_domain_events");
    expect(migration).toContain("event_type text not null");
    expect(migration).toContain("aggregate_type text not null");
    expect(migration).toContain("aggregate_id text not null");
    expect(migration).toContain("aggregate_version bigint not null");
    expect(migration).toContain("operation_id uuid not null references public.studio2_operation_receipts");
    expect(migration).toContain("correlation_id uuid not null");
    expect(migration).toContain("schema_version integer not null default 1");
    expect(V3_DOMAIN_EVENT_INFRASTRUCTURE.implementationState).toBe("foundation");
  });

  it("writes immutable facts and per-consumer transactional deliveries", () => {
    expect(migration).toContain("v3_domain_events_immutable");
    expect(migration).toContain("create table private.v3_domain_event_outbox");
    expect(migration).toContain("primary key (event_id, consumer_key)");
    expect(migration).toContain("on conflict (event_id, consumer_key) do nothing");
    expect(migration).toContain("create or replace function private.v3_emit_domain_event");
    expect(rehearsal).toContain("changed semantic replay");
    expect(rehearsal).toContain("semantic replay duplicated delivery state");
  });

  it("implements leases, retry, dead-letter and explicit recovery", () => {
    expect(migration).toContain("for update skip locked");
    expect(migration).toContain("lease_expires_at");
    expect(migration).toContain("attempt_count = delivery.attempt_count + 1");
    expect(migration).toContain("status = 'dead_letter'");
    expect(migration).toContain("studio2_requeue_dead_letter_domain_event");
    expect(rehearsal).toContain("active lease allowed a second worker claim");
    expect(rehearsal).toContain("attempt ceiling did not dead-letter delivery");
  });

  it("gives consumers immutable idempotency receipts", () => {
    expect(migration).toContain("create table private.v3_domain_event_consumer_receipts");
    expect(migration).toContain("v3_domain_event_consumer_receipts_immutable");
    expect(migration).toContain("studio2_complete_domain_event_delivery");
    expect(rehearsal).toContain("duplicate completion was not reported as replay");
  });

  it("keeps workers service-only and hostile verification local-only", () => {
    expect(migration).toContain("if not private.studio2_request_is_service_role()");
    expect(migration).toContain("to service_role");
    expect(rehearsal).toContain("Refusing hosted Supabase rehearsal");
    expect(rehearsal).toContain("Refusing non-local database rehearsal");
    expect(rehearsal).toContain("authenticated outbox claim");
    expect(rehearsal).toContain("authenticated private event emission");
  });

  it("does not use the shared S4 foundation as domain-migration evidence", () => {
    const eventBacked = V3_DOMAIN_CONSEQUENCE_REGISTRY.filter(
      (consequence) => consequence.implementationState === "event-backed",
    );

    expect(V3_DOMAIN_CONSEQUENCE_REGISTRY.length).toBeGreaterThan(0);
    for (const consequence of eventBacked) {
      expect(consequence.evidence).not.toContain(
        "supabase/migrations/20261015180000_v3_s4_domain_event_outbox.sql",
      );
      expect(consequence.evidence).not.toContain(
        ".github/scripts/v3-s4-domain-event-outbox-rehearsal.sh",
      );
    }
  });
});
