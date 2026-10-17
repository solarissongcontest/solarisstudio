import { describe, expect, it, vi } from "vitest";
import {
  buildV3OperationalErrorReport,
  emitV3OperationalErrorReport,
  serializeV3OperationalErrorReport,
} from "./v3-operational-error-report";
import { V3_SYSTEM_DOMAIN_REGISTRY } from "./v3-system-domain-registry";

const SHA = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const OPERATION_ID = "11111111-1111-4111-8111-111111111111";
const CORRELATION_ID = "22222222-2222-4222-8222-222222222222";
const DOMAIN = V3_SYSTEM_DOMAIN_REGISTRY[0]?.domain;
if (!DOMAIN) throw new Error("System domain registry fixture is empty");

function input() {
  return {
    occurredAt: "2026-10-17T14:30:00.000Z",
    deployment: {
      commitSha: SHA,
      environment: "production",
      release: "cloudflare-2026.10.17.1",
    },
    subsystem: "command" as const,
    domain: DOMAIN,
    command: "entry.submit",
    operationId: OPERATION_ID,
    correlationId: CORRELATION_ID,
    errorCode: "DATABASE" as const,
    severity: "error" as const,
    reconciliationRequired: true,
    operatorRecoveryRequired: false,
  };
}

describe("System V3 privacy-safe operational error reporting", () => {
  it("builds one deployment-tagged, correlation-safe structured failure envelope", () => {
    const report = buildV3OperationalErrorReport(input());
    expect(report).toMatchObject({
      schemaVersion: 1,
      event: "solaris.v3.operational_failure",
      occurredAt: "2026-10-17T14:30:00.000Z",
      deployment: {
        commitSha: SHA,
        environment: "production",
        release: "cloudflare-2026.10.17.1",
      },
      subsystem: "command",
      domain: DOMAIN,
      command: "entry.submit",
      trace: {
        operationId: OPERATION_ID,
        correlationId: CORRELATION_ID,
      },
      failure: {
        errorCode: "DATABASE",
        failureClass: "reconciliation_pending",
        severity: "error",
        reconciliationRequired: true,
        operatorRecoveryRequired: false,
      },
    });
    expect(report.privacy).toEqual({
      actorIdentifiers: false,
      rawPayloads: false,
      rawErrorMessage: false,
      stackTrace: false,
      authTokens: false,
    });
  });

  it("structurally excludes arbitrary Error objects, messages, stacks, actors and payloads", () => {
    const unsafe = {
      ...input(),
      actorId: "private-user-id",
      payload: { ballot: [1, 2, 3] },
      token: "secret-token",
      error: new Error("private provider response"),
      message: "private provider response",
      stack: "sensitive stack",
    };
    const report = buildV3OperationalErrorReport(unsafe);
    const serialized = serializeV3OperationalErrorReport(report);
    for (const forbidden of [
      "private-user-id",
      "ballot",
      "secret-token",
      "private provider response",
      "sensitive stack",
      "actorId",
      "payload",
      "message",
      "stack",
      "token",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
    expect(serialized.length).toBeLessThanOrEqual(2048);
  });

  it("emits exactly one bounded JSON line through an explicit sink", () => {
    const report = buildV3OperationalErrorReport(input());
    const sink = vi.fn();
    emitV3OperationalErrorReport(report, sink);
    expect(sink).toHaveBeenCalledTimes(1);
    expect(sink).toHaveBeenCalledWith(serializeV3OperationalErrorReport(report));
  });

  it("rejects missing deployment identity and high-cardinality/free-form tokens", () => {
    expect(() => buildV3OperationalErrorReport({
      ...input(),
      deployment: { ...input().deployment, commitSha: "not-a-sha" },
    })).toThrow("deployment commitSha must be an exact 40-character SHA");

    expect(() => buildV3OperationalErrorReport({
      ...input(),
      deployment: { ...input().deployment, environment: "prod with spaces" },
    })).toThrow("deployment environment must be a bounded low-cardinality token");

    expect(() => buildV3OperationalErrorReport({
      ...input(),
      command: "This is arbitrary human text",
    })).toThrow("command must be a bounded canonical-style command token");
  });

  it("rejects unknown domains, malformed trace ids and unsupported runtime taxonomy values", () => {
    expect(() => buildV3OperationalErrorReport({ ...input(), domain: "not-a-domain" })).toThrow(
      "domain must be declared in the canonical V3 System domain registry",
    );
    expect(() => buildV3OperationalErrorReport({ ...input(), operationId: "not-a-uuid" })).toThrow(
      "operationId must be a UUID",
    );
    expect(() => buildV3OperationalErrorReport({
      ...input(),
      errorCode: "SOMETHING_RANDOM" as never,
    })).toThrow("errorCode is not part of the canonical operation error taxonomy");
  });
});
