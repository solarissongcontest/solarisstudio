import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  V3_OBSERVABILITY_GAPS,
  V3_OBSERVABILITY_REGISTRY,
  v3ObservabilitySignal,
  validateV3ObservabilityRegistry,
} from "./v3-observability-registry";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const operationLedger = source(
  "supabase/migrations/20261014194651_v3_s2_operation_receipt_idempotency.sql",
);
const outbox = source("supabase/migrations/20261015180000_v3_s4_domain_event_outbox.sql");
const diagnostics = source(
  "supabase/migrations/20261002193000_organisation_os_v5_system_diagnostics.sql",
);

describe("System V3 S9 observability registry", () => {
  it("requires trace identity, status and privacy boundaries for every signal", () => {
    expect(validateV3ObservabilityRegistry()).toEqual([]);
    expect(V3_OBSERVABILITY_REGISTRY.length).toBeGreaterThan(0);
  });

  it("tracks canonical operation/correlation identity without logging semantic request payloads", () => {
    const signal = v3ObservabilitySignal("system-operation-trace");
    expect(signal?.identifiers).toEqual(
      expect.arrayContaining(["operation_id", "correlation_id", "command", "actor_id"]),
    );
    expect(signal?.statusFields).toEqual(
      expect.arrayContaining(["status", "error_code", "completed_at"]),
    );
    expect(operationLedger).toContain("correlation_id uuid");
    expect(operationLedger).toContain("request_fingerprint text");
    expect(operationLedger).toContain("pg_column_size(error_metadata) <= 8192");
  });

  it("preserves operation correlation through immutable DomainEvents", () => {
    const signal = v3ObservabilitySignal("domain-event-trace");
    expect(signal?.identifiers).toEqual(
      expect.arrayContaining(["operation_id", "correlation_id", "event_type", "aggregate_id"]),
    );
    expect(outbox).toContain("operation_id uuid not null");
    expect(outbox).toContain("correlation_id uuid not null");
    expect(outbox).toContain("v_event.correlation_id is distinct from v_receipt.correlation_id");
  });

  it("keeps consumer attempts, failures and dead-letter state observable in durable private state", () => {
    const signal = v3ObservabilitySignal("domain-event-consumer-delivery-trace");
    expect(signal?.statusFields).toEqual(
      expect.arrayContaining([
        "status",
        "attempt_count",
        "last_error_code",
        "dead_lettered_at",
        "completed_at",
      ]),
    );
    expect(outbox).toContain("attempt_count = delivery.attempt_count + 1");
    expect(outbox).toContain("last_error_code");
    expect(outbox).toContain("dead_lettered_at");
  });

  it("exposes bounded notification and job health without raw subscription secrets", () => {
    expect(v3ObservabilitySignal("notification-runtime-health")).toMatchObject({
      state: "verified",
      organizerVisible: true,
      source: "public.admin_system_runtime_health(integer)",
    });
    expect(v3ObservabilitySignal("system-job-runtime-health")).toMatchObject({
      state: "verified",
      organizerVisible: true,
    });
    expect(diagnostics).toContain("'failed24h'");
    expect(diagnostics).toContain("where job.jobname like 'solaris-%'");
    expect(diagnostics).toContain("left(coalesce(last_run.return_message, ''), 500)");
    expect(diagnostics).not.toContain("endpoint as endpoint");
    expect(diagnostics).not.toContain("p256dh");
    expect(diagnostics).not.toContain("auth as auth");
  });

  it("does not call fragmented durable data a complete S9 operational view", () => {
    expect(v3ObservabilitySignal("system-operation-trace")?.state).toBe("foundation");
    expect(v3ObservabilitySignal("domain-event-trace")?.state).toBe("foundation");
    expect(v3ObservabilitySignal("domain-event-consumer-delivery-trace")?.organizerVisible).toBe(false);
    expect(V3_OBSERVABILITY_GAPS.map((gap) => gap.id)).toEqual(
      expect.arrayContaining([
        "operation-event-consumer-organizer-projection",
        "deployment-version-binding",
        "projection-reconciliation-health",
        "measured-operational-counters",
      ]),
    );
  });
});
