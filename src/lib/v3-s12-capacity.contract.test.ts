import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  V3_CAPACITY_BUDGET_BANDS,
  V3_CAPACITY_DIMENSIONS,
  V3_CAPACITY_SCENARIOS,
  validateV3CapacityScenarioRegistry,
} from "./v3-capacity-scenarios";

const harness = readFileSync(
  resolve(process.cwd(), ".github/scripts/v3-s12-local-capacity-rehearsal.mjs"),
  "utf8",
);
const runbook = readFileSync(
  resolve(process.cwd(), "docs/runbooks/capacity-rehearsal.md"),
  "utf8",
);

describe("System V3 S12 local capacity foundation", () => {
  it("keeps every synthetic target on loopback/local infrastructure", () => {
    expect(harness).toContain("${label} must be loopback/local");
    expect(harness).toContain('assertLoopbackUrl(targetRaw, "V3_CAPACITY_URL")');
    expect(harness).toContain('assertLoopbackUrl(dbRaw, "DB_URL")');
    expect(harness).toContain('"127.0.0.1"');
    expect(harness).toContain('"localhost"');
    expect(harness).not.toContain("supabase.co");
    expect(runbook).toContain("Never point the capacity harness at production");
  });

  it("requires load shape and evidence identity instead of embedding magic capacity numbers", () => {
    expect(harness).toContain('positiveInteger("V3_CAPACITY_REQUESTS")');
    expect(harness).toContain('positiveInteger("V3_CAPACITY_CONCURRENCY")');
    expect(harness).toContain('requiredText("V3_CAPACITY_COMMIT_SHA")');
    expect(harness).toContain('allowedValue("V3_CAPACITY_LOAD_SOURCE"');
    expect(harness).toContain('requiredText("V3_CAPACITY_LOAD_RATIONALE")');
    expect(harness).toContain("no synthetic load is guessed");
    expect(harness).toContain("thresholds: null");
    expect(runbook).toContain("no default request count, concurrency, duration target or pass/fail latency threshold");
  });

  it("registers the canonical contest, deadline, operational and recovery bursts separately", () => {
    expect(validateV3CapacityScenarioRegistry()).toEqual([]);
    expect(V3_CAPACITY_SCENARIOS.map((scenario) => scenario.id)).toEqual([
      "show-start-live-refresh",
      "confirmation-deadline",
      "entry-media-deadline",
      "jury-deadline",
      "televote-open",
      "voting-close-consequence-burst",
      "results-publish",
      "notification-fanout",
      "organizer-control-room",
      "reconciliation-backlog-drain",
      "submission-burst",
      "synchronized-traffic-spike",
    ]);
    expect(V3_CAPACITY_SCENARIOS.every((scenario) => scenario.environment === "local-isolated")).toBe(true);
    expect(
      V3_CAPACITY_SCENARIOS.every(
        (scenario) => scenario.loadShapeSource === "explicit-rehearsal-input-or-measured-baseline",
      ),
    ).toBe(true);
  });

  it("measures request, database, lock, connection, queue, retry and local-memory pressure including mid-run peaks", () => {
    for (const token of [
      "requestThroughputPerSecond",
      "p95",
      "p99",
      "errorRate",
      "databaseActivity",
      "observedResponseBytes",
      "queueDepthBefore",
      "queueDepthAfter",
      "peakObservedQueueDepth",
      "connectionPressure",
      "peakObservedConnections",
      "peakObservedActiveConnections",
      "lockContention",
      "peakObservedWaitingConnections",
      "peakObservedUngrantedDatabaseLocks",
      "retryPressure",
      "peakObservedRetrying",
      "clientMemory",
      "peakObserved",
    ]) {
      expect(harness).toContain(token);
    }
    expect(harness).toContain('positiveInteger("V3_CAPACITY_DB_SAMPLE_MS")');
    expect(harness).toContain("pg_stat_database");
    expect(harness).toContain("pg_stat_activity");
    expect(harness).toContain("pg_locks");
    expect(harness).toContain("private.v3_domain_event_outbox");
    expect(harness).toContain("attempt_count > 1");
  });

  it("covers canonical capacity dimensions and requires every budget band without inventing values", () => {
    const coveredDimensions = new Set(
      V3_CAPACITY_SCENARIOS.flatMap((scenario) => scenario.capacityDimensions),
    );
    expect([...coveredDimensions].sort()).toEqual([...V3_CAPACITY_DIMENSIONS].sort());
    for (const scenario of V3_CAPACITY_SCENARIOS) {
      expect(scenario.requiredBudgetBands).toEqual(V3_CAPACITY_BUDGET_BANDS);
    }
    expect(runbook).toContain("normal, contest-day, peak and hard-safety-limit");
    expect(runbook).toContain("must come from evidence rather than guessed defaults");
  });

  it("does not mislabel local measurements as provider production capacity", () => {
    expect(harness).toContain("not provider-billed egress");
    expect(harness).toContain("not provider CPU, I/O, memory, connection-pool saturation or managed-service saturation telemetry");
    expect(harness).toContain("capacity-harness process memory only");
    expect(runbook).toContain("not provider-billed egress");
    expect(runbook).toContain("not provider CPU");
    expect(runbook).toContain("S12 foundation only");
    expect(runbook).toContain("S12 remains uncertified");
  });

  it("requires provider evidence before any scenario can support certification", () => {
    expect(V3_CAPACITY_SCENARIOS.every((scenario) => scenario.providerEvidenceRequiredForCertification)).toBe(true);
    for (const scenario of V3_CAPACITY_SCENARIOS) {
      expect(scenario.requiredMeasurements).toEqual([
        "throughput",
        "p95-latency",
        "p99-latency",
        "error-rate",
        "database-activity",
        "lock-contention",
        "connection-pressure",
        "observed-response-bytes",
        "client-memory",
        "queue-depth",
        "retry-pressure",
      ]);
    }
  });
});
