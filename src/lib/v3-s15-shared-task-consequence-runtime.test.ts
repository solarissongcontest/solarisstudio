import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { v3DomainConsequence } from "./v3-domain-consequence-registry";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const migration = source(
  "supabase/migrations/20261026190029_v3_s15_shared_task_consequence_runtime.sql",
);

describe("System V3 S15 shared task consequence runtime", () => {
  it("keeps the shared consumer deliberately allow-listed", () => {
    expect(migration).toContain("private.v3_event_requires_shared_task_reconciliation");
    expect(migration).toContain("'edition.transitioned'");
    expect(migration).not.toContain("'edition.changed'");
    expect(migration).not.toContain("results.calculated");
    expect(migration).not.toContain("voting-public-results");
  });

  it("persists the task consumer in the same transaction as the canonical event", () => {
    expect(migration).toContain("after insert on private.v3_domain_events");
    expect(migration).toContain("insert into private.v3_domain_event_outbox");
    expect(migration).toContain("values (new.id, 'system.tasks')");
    expect(migration).toContain("on conflict (event_id, consumer_key) do nothing");
  });

  it("requires the S4 lease and consumer receipt before completing delivery", () => {
    expect(migration).toContain("private.studio2_request_is_service_role()");
    expect(migration).toContain("private.v3_domain_event_consumer_receipts");
    expect(migration).toContain("v_delivery.status <> 'processing'");
    expect(migration).toContain("v_delivery.lease_owner is distinct from p_worker_id");
    expect(migration).toContain("v_delivery.lease_expires_at <= now()");
    expect(migration).toContain("public.studio2_complete_domain_event_delivery");
  });

  it("rebuilds rather than independently mutating task truth", () => {
    expect(migration).toContain(
      "private.studio2_reconcile_all_organizer_tasks(v_event.edition_id)",
    );
    expect(migration).not.toContain("insert into public.studio2_organizer_tasks");
    expect(migration).not.toContain("update public.studio2_organizer_tasks");
  });

  it("records operation and correlation linkage for observability", () => {
    expect(migration).toContain("'operationId', v_event.operation_id");
    expect(migration).toContain("'correlationId', v_event.correlation_id");
    expect(migration).toContain("'aggregateVersion', v_event.aggregate_version");
  });

  it("only claims edition.transitioned as event-backed after runtime evidence is registered", () => {
    expect(v3DomainConsequence("edition.transitioned")?.ownerDomain).toBe("edition");
    expect(v3DomainConsequence("edition.transitioned")?.implementationState).toBe("event-backed");
    expect(v3DomainConsequence("edition.changed")?.implementationState).toBe("declared");
  });
});
