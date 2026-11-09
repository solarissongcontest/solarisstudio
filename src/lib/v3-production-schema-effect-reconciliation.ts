import type {
  HostedMigration,
  ProductionMigrationFrontier,
  RepoMigration,
} from "./v3-production-migration-frontier";

export const V3_SCHEMA_EFFECT_RECONCILIATION_SCHEMA_VERSION = 1 as const;

export type V3SchemaEffectClassification =
  | "effect-present"
  | "effect-partial"
  | "effect-missing"
  | "effect-superseded"
  | "effect-uncertain";

export type V3SchemaEffectEntry = {
  version: string;
  filename: string;
  classification: V3SchemaEffectClassification;
  evidenceRefs: readonly string[];
  dependencies: readonly string[];
  forwardPlan: string | null;
  historyAction: "preserve";
};

export type V3SchemaEffectManifest = {
  schemaVersion: 1;
  candidateSha: string;
  hostedHead: string;
  bootstrapCutover: string;
  repositoryCount: number;
  hostedCount: number;
  entries: readonly V3SchemaEffectEntry[];
  pendingVersions: readonly string[];
};

export type V3SchemaEffectReconciliationReport = {
  candidateSha: string;
  manifestValid: boolean;
  productionDeploymentAuthorized: false;
  errors: readonly string[];
  reconciledVersions: readonly string[];
  pendingVersions: readonly string[];
};

const SHA = /^[0-9a-f]{40}$/;
const VERSION = /^\d{14}$/;

function isNonemptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function hasUniqueStrings(value: unknown): value is readonly string[] {
  return Array.isArray(value) &&
    value.every(isNonemptyString) &&
    new Set(value).size === value.length;
}

function expectedEntryKey(migration: RepoMigration) {
  return `${migration.version}:${migration.filename}`;
}

export function reconcileV3ProductionSchemaEffects(input: {
  candidateSha: string;
  frontier: ProductionMigrationFrontier;
  manifest: unknown;
}): V3SchemaEffectReconciliationReport {
  const errors: string[] = [];
  const manifest = input.manifest as Partial<V3SchemaEffectManifest> | null;

  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    errors.push("effect manifest must be an object");
  }
  if (manifest?.schemaVersion !== V3_SCHEMA_EFFECT_RECONCILIATION_SCHEMA_VERSION) {
    errors.push("effect manifest schemaVersion must be 1");
  }
  if (manifest?.candidateSha !== input.candidateSha) {
    errors.push("effect manifest candidateSha does not match the checked-out candidate");
  }
  if (!SHA.test(input.candidateSha)) errors.push("checked-out candidate SHA is invalid");
  if (!isNonemptyString(manifest?.hostedHead) || !VERSION.test(manifest.hostedHead)) {
    errors.push("effect manifest hostedHead must be a 14-digit migration version");
  } else if (manifest.hostedHead !== input.frontier.hostedHead) {
    errors.push("effect manifest hostedHead does not match the audited hosted frontier");
  }
  if (manifest?.bootstrapCutover !== input.frontier.bootstrapCutover) {
    errors.push("effect manifest bootstrapCutover does not match the immutable cutover");
  }
  if (manifest?.repositoryCount !== input.frontier.repositoryCount ||
      manifest?.hostedCount !== input.frontier.hostedCount) {
    errors.push("effect manifest migration counts do not match the audited frontier");
  }
  if (!Array.isArray(manifest?.entries)) {
    errors.push("effect manifest entries must be an array");
  }
  if (!hasUniqueStrings(manifest?.pendingVersions)) {
    errors.push("effect manifest pendingVersions must be unique non-empty strings");
  } else {
    const expectedPending = input.frontier.pendingAfterHostedHead.map(item => item.version);
    if (JSON.stringify(manifest.pendingVersions) !== JSON.stringify(expectedPending)) {
      errors.push("effect manifest pendingVersions do not match the audited frontier");
    }
  }

  const entries = Array.isArray(manifest?.entries) ? manifest.entries : [];
  const seen = new Set<string>();
  const expected = new Map(input.frontier.holesBeforeHostedHead.map(item => [expectedEntryKey(item), item]));
  const reconciledVersions: string[] = [];

  for (const raw of entries) {
    const entry = raw as Partial<V3SchemaEffectEntry> | null;
    if (!entry || typeof entry !== "object") {
      errors.push("effect manifest contains a non-object entry");
      continue;
    }
    const version = entry.version;
    const filename = entry.filename;
    const key = typeof version === "string" && typeof filename === "string"
      ? `${version}:${filename}` : null;
    if (!key || seen.has(key)) {
      errors.push(`effect manifest contains a duplicate or malformed entry: ${key ?? "unknown"}`);
      continue;
    }
    seen.add(key);
    const migration = expected.get(key);
    if (!migration) {
      errors.push(`effect manifest entry is not an audited post-cutover hole: ${key}`);
      continue;
    }
    if (!["effect-present", "effect-partial", "effect-missing", "effect-superseded", "effect-uncertain"].includes(entry.classification ?? "")) {
      errors.push(`${key} has an invalid effect classification`);
    }
    if (!hasUniqueStrings(entry.evidenceRefs)) {
      errors.push(`${key} must include unique evidenceRefs`);
    }
    if (!hasUniqueStrings(entry.dependencies)) {
      errors.push(`${key} must include unique dependencies`);
    }
    if (entry.historyAction !== "preserve") {
      errors.push(`${key} must preserve immutable migration history`);
    }
    if ((entry.classification === "effect-partial" || entry.classification === "effect-missing" ||
      entry.classification === "effect-uncertain") &&
        !isNonemptyString(entry.forwardPlan)) {
      errors.push(`${key} requires a forwardPlan for partial or missing effects`);
    }
    if (entry.classification === "effect-present" && entry.forwardPlan !== null) {
      errors.push(`${key} must not propose a forward plan for an effect already present`);
    }
    if (entry.forwardPlan &&
        /\b(?:deploy|apply|replay|write)\b|alter\s+production|production\s+(?:write|migration)/i.test(entry.forwardPlan)) {
      errors.push(`${key} forwardPlan must describe reviewable work, not authorize production action`);
    }
    reconciledVersions.push(migration.version);
  }

  for (const migration of expected.values()) {
    if (!seen.has(expectedEntryKey(migration))) {
      errors.push(`effect manifest is missing audited hole: ${expectedEntryKey(migration)}`);
    }
  }

  return {
    candidateSha: input.candidateSha,
    manifestValid: errors.length === 0,
    productionDeploymentAuthorized: false,
    errors,
    reconciledVersions: reconciledVersions.sort(),
    pendingVersions: input.frontier.pendingAfterHostedHead.map(item => item.version),
  };
}

export function buildV3SchemaEffectManifestTemplate(
  candidateSha: string,
  frontier: ProductionMigrationFrontier,
): V3SchemaEffectManifest {
  return {
    schemaVersion: 1,
    candidateSha,
    hostedHead: frontier.hostedHead ?? "",
    bootstrapCutover: frontier.bootstrapCutover,
    repositoryCount: frontier.repositoryCount,
    hostedCount: frontier.hostedCount,
    entries: frontier.holesBeforeHostedHead.map((migration) => ({
      version: migration.version,
      filename: migration.filename,
      classification: "effect-missing" as const,
      evidenceRefs: [],
      dependencies: [],
      forwardPlan: null,
      historyAction: "preserve" as const,
    })),
    pendingVersions: frontier.pendingAfterHostedHead.map(item => item.version),
  };
}
