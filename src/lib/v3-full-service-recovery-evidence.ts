export const V3_S11_RECOVERY_COMPONENTS = [
  "database",
  "storage",
  "deployment",
] as const;

export const V3_S11_FULL_SERVICE_CHECKS = [
  "databaseStorageIdentity",
  "schemaApplicationCompatibility",
  "canonicalIntegrity",
  "publicationIntegrity",
  "authAuthorization",
  "criticalParticipantFlows",
  "reconciliationHealthy",
  "storagePrivacy",
  "runtimeCandidateExact",
  "postCutoverVerification",
] as const;

export type V3S11RecoveryComponent =
  (typeof V3_S11_RECOVERY_COMPONENTS)[number];
export type V3S11FullServiceCheck =
  (typeof V3_S11_FULL_SERVICE_CHECKS)[number];

export type V3S11FullServiceRecoveryStatus =
  | "invalid"
  | "component_evidence_incomplete"
  | "rehearsal_incomplete"
  | "ready_for_qa_review";

export type V3S11ComponentEvidence = {
  component: V3S11RecoveryComponent;
  commitSha: string;
  status: "ready_for_qa_review";
  rehearsalId: string;
  observedAt: string;
  artifactPath: string;
  artifactSha256: string;
  certificationClaim: false;
  qaReviewRequired: true;
};

export type V3S11FullServiceRecoveryManifest = {
  schemaVersion: 1;
  candidateSha: string;
  components: readonly V3S11ComponentEvidence[];
  fullServiceRehearsal: {
    commitSha: string;
    rehearsalId: string;
    environment: "isolated";
    startedAt: string;
    completedAt: string;
    observedRpoSeconds: number;
    observedRtoSeconds: number;
    componentRehearsalIds: Record<V3S11RecoveryComponent, string>;
    checks: Record<V3S11FullServiceCheck, boolean>;
    unresolvedIssues: readonly string[];
    productionTouched: false;
    productionSupabaseTraffic: false;
    destructiveProductionRestore: false;
    providerRpoClaim: false;
    providerRtoClaim: false;
    certificationClaim: false;
    qaReviewRequired: true;
  };
};

export type V3S11FullServiceRecoveryAssessment = {
  schemaVersion: 1;
  status: V3S11FullServiceRecoveryStatus;
  expectedCommitSha: string | null;
  candidateSha: string | null;
  missingComponents: readonly V3S11RecoveryComponent[];
  incompleteChecks: readonly V3S11FullServiceCheck[];
  unresolvedIssues: readonly string[];
  errors: readonly string[];
  certificationClaim: false;
  qaReviewRequired: true;
};

type UnknownRecord = Record<string, unknown>;

const recoveryComponents = new Set<string>(V3_S11_RECOVERY_COMPONENTS);
const fullServiceChecks = new Set<string>(V3_S11_FULL_SERVICE_CHECKS);

function asRecord(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function nonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized ? normalized : null;
}

function exactSha(value: unknown): string | null {
  const normalized = nonEmptyString(value);
  return normalized && /^[0-9a-f]{40}$/i.test(normalized)
    ? normalized.toLowerCase()
    : null;
}

function sha256(value: unknown): string | null {
  const normalized = nonEmptyString(value);
  return normalized && /^[0-9a-f]{64}$/i.test(normalized)
    ? normalized.toLowerCase()
    : null;
}

function validIsoTimestamp(value: unknown): string | null {
  const normalized = nonEmptyString(value);
  return normalized && Number.isFinite(Date.parse(normalized))
    ? normalized
    : null;
}

function nonNegativeFinite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

function safeArtifactPath(value: unknown): string | null {
  const normalized = nonEmptyString(value);
  if (!normalized) return null;
  if (normalized.startsWith("/") || normalized.includes("..")) return null;
  return normalized;
}

function stringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const result: string[] = [];
  for (const item of value) {
    const normalized = nonEmptyString(item);
    if (!normalized) return null;
    result.push(normalized);
  }
  return result;
}

export function assessV3FullServiceRecoveryEvidence(
  manifestValue: unknown,
  expectedCommitShaValue: unknown,
): V3S11FullServiceRecoveryAssessment {
  const errors: string[] = [];
  const missingComponents: V3S11RecoveryComponent[] = [];
  const incompleteChecks: V3S11FullServiceCheck[] = [];
  const manifest = asRecord(manifestValue);

  if (!manifest) errors.push("full-service recovery manifest must be an object");
  if (manifest && manifest.schemaVersion !== 1) {
    errors.push("full-service recovery manifest schemaVersion must be 1");
  }

  const expectedCommitSha = exactSha(expectedCommitShaValue);
  const candidateSha = exactSha(manifest?.candidateSha);
  if (!expectedCommitSha) {
    errors.push("expected commit SHA must be an exact 40-character SHA");
  }
  if (!candidateSha) {
    errors.push("candidateSha must be an exact 40-character SHA");
  }
  if (expectedCommitSha && candidateSha && expectedCommitSha !== candidateSha) {
    errors.push("candidateSha does not match expected commit SHA");
  }

  const componentsById = new Map<V3S11RecoveryComponent, UnknownRecord>();
  const components = manifest?.components;
  if (!Array.isArray(components)) {
    errors.push("components must be an array");
  } else {
    for (const [index, rawComponent] of components.entries()) {
      const component = asRecord(rawComponent);
      if (!component) {
        errors.push(`components[${index}] must be an object`);
        continue;
      }
      const componentId = nonEmptyString(component.component);
      if (!componentId || !recoveryComponents.has(componentId)) {
        errors.push(`components[${index}] has an unknown recovery component`);
        continue;
      }
      const typedComponent = componentId as V3S11RecoveryComponent;
      if (componentsById.has(typedComponent)) {
        errors.push(`duplicate recovery component ${typedComponent}`);
        continue;
      }
      componentsById.set(typedComponent, component);

      const commitSha = exactSha(component.commitSha);
      if (!commitSha) {
        errors.push(`${typedComponent} component commitSha must be an exact SHA`);
      } else if (candidateSha && commitSha !== candidateSha) {
        errors.push(`${typedComponent} component commitSha does not match candidateSha`);
      }
      if (component.status !== "ready_for_qa_review") {
        errors.push(`${typedComponent} component is not ready_for_qa_review`);
      }
      if (!nonEmptyString(component.rehearsalId)) {
        errors.push(`${typedComponent} component rehearsalId is required`);
      }
      if (!validIsoTimestamp(component.observedAt)) {
        errors.push(`${typedComponent} component observedAt must be an ISO timestamp`);
      }
      if (!safeArtifactPath(component.artifactPath)) {
        errors.push(`${typedComponent} component artifactPath must be a safe relative path`);
      }
      if (!sha256(component.artifactSha256)) {
        errors.push(`${typedComponent} component artifactSha256 must be a SHA-256 digest`);
      }
      if (component.certificationClaim !== false) {
        errors.push(`${typedComponent} component must not claim release certification`);
      }
      if (component.qaReviewRequired !== true) {
        errors.push(`${typedComponent} component must require QA review`);
      }
    }
  }

  for (const component of V3_S11_RECOVERY_COMPONENTS) {
    if (!componentsById.has(component)) missingComponents.push(component);
  }

  const rehearsal = asRecord(manifest?.fullServiceRehearsal);
  const unresolvedIssues: string[] = [];
  let rehearsalStructurallyValid = true;

  if (!rehearsal) {
    rehearsalStructurallyValid = false;
  } else {
    const rehearsalSha = exactSha(rehearsal.commitSha);
    if (!rehearsalSha) {
      errors.push("full-service rehearsal commitSha must be an exact SHA");
      rehearsalStructurallyValid = false;
    } else if (candidateSha && rehearsalSha !== candidateSha) {
      errors.push("full-service rehearsal commitSha does not match candidateSha");
      rehearsalStructurallyValid = false;
    }

    if (!nonEmptyString(rehearsal.rehearsalId)) {
      errors.push("full-service rehearsal rehearsalId is required");
      rehearsalStructurallyValid = false;
    }
    if (rehearsal.environment !== "isolated") {
      errors.push("full-service rehearsal environment must be isolated");
      rehearsalStructurallyValid = false;
    }

    const startedAt = validIsoTimestamp(rehearsal.startedAt);
    const completedAt = validIsoTimestamp(rehearsal.completedAt);
    if (!startedAt || !completedAt || Date.parse(completedAt) < Date.parse(startedAt)) {
      errors.push("full-service rehearsal timestamps must form a valid forward interval");
      rehearsalStructurallyValid = false;
    }
    if (nonNegativeFinite(rehearsal.observedRpoSeconds) === null) {
      errors.push("full-service rehearsal observedRpoSeconds must be non-negative");
      rehearsalStructurallyValid = false;
    }
    if (nonNegativeFinite(rehearsal.observedRtoSeconds) === null) {
      errors.push("full-service rehearsal observedRtoSeconds must be non-negative");
      rehearsalStructurallyValid = false;
    }

    const componentRehearsalIds = asRecord(rehearsal.componentRehearsalIds);
    for (const componentId of V3_S11_RECOVERY_COMPONENTS) {
      const expectedRehearsalId = nonEmptyString(
        componentsById.get(componentId)?.rehearsalId,
      );
      const composedRehearsalId = nonEmptyString(componentRehearsalIds?.[componentId]);
      if (!composedRehearsalId) {
        errors.push(`full-service rehearsal is missing ${componentId} component rehearsal identity`);
        rehearsalStructurallyValid = false;
      } else if (expectedRehearsalId && composedRehearsalId !== expectedRehearsalId) {
        errors.push(`full-service rehearsal ${componentId} identity does not match component evidence`);
        rehearsalStructurallyValid = false;
      }
    }

    const checks = asRecord(rehearsal.checks);
    if (!checks) {
      rehearsalStructurallyValid = false;
      incompleteChecks.push(...V3_S11_FULL_SERVICE_CHECKS);
    } else {
      for (const key of Object.keys(checks)) {
        if (!fullServiceChecks.has(key)) {
          errors.push(`full-service rehearsal contains unknown check ${key}`);
        }
      }
      for (const check of V3_S11_FULL_SERVICE_CHECKS) {
        if (checks[check] !== true) incompleteChecks.push(check);
      }
    }

    const issues = stringArray(rehearsal.unresolvedIssues);
    if (!issues) {
      errors.push("full-service rehearsal unresolvedIssues must be a string array");
      rehearsalStructurallyValid = false;
    } else {
      unresolvedIssues.push(...issues);
    }

    for (const [field, expected] of [
      ["productionTouched", false],
      ["productionSupabaseTraffic", false],
      ["destructiveProductionRestore", false],
      ["providerRpoClaim", false],
      ["providerRtoClaim", false],
      ["certificationClaim", false],
      ["qaReviewRequired", true],
    ] as const) {
      if (rehearsal[field] !== expected) {
        errors.push(`full-service rehearsal ${field} must be ${String(expected)}`);
        rehearsalStructurallyValid = false;
      }
    }
  }

  let status: V3S11FullServiceRecoveryStatus = "ready_for_qa_review";
  if (errors.length > 0) {
    status = "invalid";
  } else if (missingComponents.length > 0) {
    status = "component_evidence_incomplete";
  } else if (
    !rehearsal ||
    !rehearsalStructurallyValid ||
    incompleteChecks.length > 0 ||
    unresolvedIssues.length > 0
  ) {
    status = "rehearsal_incomplete";
  }

  return {
    schemaVersion: 1,
    status,
    expectedCommitSha,
    candidateSha,
    missingComponents,
    incompleteChecks,
    unresolvedIssues,
    errors,
    certificationClaim: false,
    qaReviewRequired: true,
  };
}
