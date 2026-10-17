import {
  V3_OPERATION_ERROR_CODES,
  classifyV3ReliabilityFailure,
  type V3OperationErrorCode,
  type V3ReliabilityFailureClass,
} from "./v3-reliability-slo";
import { V3_SYSTEM_DOMAIN_REGISTRY } from "./v3-system-domain-registry";

export const V3_OPERATIONAL_ERROR_SUBSYSTEMS = [
  "command",
  "database",
  "storage",
  "domain_event",
  "projection",
  "dependency",
  "reconciliation",
  "system_job",
] as const;

export type V3OperationalErrorSubsystem =
  (typeof V3_OPERATIONAL_ERROR_SUBSYSTEMS)[number];

export type V3OperationalErrorSeverity = "warning" | "error" | "critical";

export type V3OperationalErrorInput = {
  occurredAt: string;
  deployment: {
    commitSha: string;
    environment: string;
    release?: string | null;
  };
  subsystem: V3OperationalErrorSubsystem;
  domain: string;
  command?: string | null;
  operationId?: string | null;
  correlationId?: string | null;
  errorCode: V3OperationErrorCode;
  severity: V3OperationalErrorSeverity;
  reconciliationRequired?: boolean;
  operatorRecoveryRequired?: boolean;
  domainDisposition?: "transient" | "permanent";
};

export type V3OperationalErrorReport = {
  schemaVersion: 1;
  event: "solaris.v3.operational_failure";
  occurredAt: string;
  deployment: {
    commitSha: string;
    environment: string;
    release: string | null;
  };
  subsystem: V3OperationalErrorSubsystem;
  domain: string;
  command: string | null;
  trace: {
    operationId: string | null;
    correlationId: string | null;
  };
  failure: {
    errorCode: V3OperationErrorCode;
    failureClass: V3ReliabilityFailureClass;
    severity: V3OperationalErrorSeverity;
    reconciliationRequired: boolean;
    operatorRecoveryRequired: boolean;
  };
  privacy: {
    actorIdentifiers: false;
    rawPayloads: false;
    rawErrorMessage: false;
    stackTrace: false;
    authTokens: false;
  };
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA_RE = /^[0-9a-f]{40}$/i;
const LOW_CARDINALITY_RE = /^[a-z0-9][a-z0-9._:-]*$/i;
const COMMAND_RE = /^[a-z][a-z0-9._:-]{0,119}$/;
const domainSet = new Set(V3_SYSTEM_DOMAIN_REGISTRY.map((item) => item.domain));
const errorCodeSet = new Set<string>(V3_OPERATION_ERROR_CODES);
const subsystemSet = new Set<string>(V3_OPERATIONAL_ERROR_SUBSYSTEMS);
const severitySet = new Set<V3OperationalErrorSeverity>(["warning", "error", "critical"]);

function requiredBoundedToken(value: string, label: string, maxLength: number) {
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength || !LOW_CARDINALITY_RE.test(normalized)) {
    throw new Error(`${label} must be a bounded low-cardinality token`);
  }
  return normalized;
}

function optionalUuid(value: string | null | undefined, label: string) {
  if (value == null || value === "") return null;
  if (!UUID_RE.test(value)) throw new Error(`${label} must be a UUID`);
  return value.toLowerCase();
}

function optionalCommand(value: string | null | undefined) {
  if (value == null || value === "") return null;
  if (!COMMAND_RE.test(value)) {
    throw new Error("command must be a bounded canonical-style command token");
  }
  return value;
}

export function buildV3OperationalErrorReport(
  input: V3OperationalErrorInput,
): V3OperationalErrorReport {
  if (!Number.isFinite(Date.parse(input.occurredAt))) {
    throw new Error("occurredAt must be an ISO-compatible timestamp");
  }
  if (!SHA_RE.test(input.deployment.commitSha)) {
    throw new Error("deployment commitSha must be an exact 40-character SHA");
  }

  const environment = requiredBoundedToken(
    input.deployment.environment,
    "deployment environment",
    64,
  );
  const release = input.deployment.release == null || input.deployment.release === ""
    ? null
    : requiredBoundedToken(input.deployment.release, "deployment release", 80);

  if (!domainSet.has(input.domain)) {
    throw new Error("domain must be declared in the canonical V3 System domain registry");
  }
  if (!subsystemSet.has(input.subsystem)) {
    throw new Error("subsystem is not a canonical operational subsystem");
  }
  if (!errorCodeSet.has(input.errorCode)) {
    throw new Error("errorCode is not part of the canonical operation error taxonomy");
  }
  if (!severitySet.has(input.severity)) {
    throw new Error("severity must be warning, error or critical");
  }

  const reconciliationRequired = input.reconciliationRequired === true;
  const operatorRecoveryRequired = input.operatorRecoveryRequired === true;
  const failureClass = classifyV3ReliabilityFailure({
    errorCode: input.errorCode,
    reconciliationRequired,
    operatorRecoveryRequired,
    domainDisposition: input.domainDisposition,
  });

  const report: V3OperationalErrorReport = {
    schemaVersion: 1,
    event: "solaris.v3.operational_failure",
    occurredAt: new Date(input.occurredAt).toISOString(),
    deployment: {
      commitSha: input.deployment.commitSha.toLowerCase(),
      environment,
      release,
    },
    subsystem: input.subsystem,
    domain: input.domain,
    command: optionalCommand(input.command),
    trace: {
      operationId: optionalUuid(input.operationId, "operationId"),
      correlationId: optionalUuid(input.correlationId, "correlationId"),
    },
    failure: {
      errorCode: input.errorCode,
      failureClass,
      severity: input.severity,
      reconciliationRequired,
      operatorRecoveryRequired,
    },
    privacy: {
      actorIdentifiers: false,
      rawPayloads: false,
      rawErrorMessage: false,
      stackTrace: false,
      authTokens: false,
    },
  };

  if (serializeV3OperationalErrorReport(report).length > 2048) {
    throw new Error("operational error report exceeds the bounded 2048-character envelope");
  }
  return report;
}

export function serializeV3OperationalErrorReport(report: V3OperationalErrorReport) {
  return JSON.stringify(report);
}

export function emitV3OperationalErrorReport(
  report: V3OperationalErrorReport,
  writeLine: (line: string) => void,
) {
  writeLine(serializeV3OperationalErrorReport(report));
}
