export type V3S13MigrationAuditInput = {
  path: string;
  source: string;
};

export type V3S13MigrationRisk =
  | "destructive_ddl"
  | "bulk_delete"
  | "bulk_truncate"
  | "backfill_like_dml";

export type V3S13ReviewedExemption = {
  path: string;
  owner: string;
  reason: string;
  evidence: string;
};

export type V3S13MigrationAuditFinding = {
  path: string;
  risks: readonly V3S13MigrationRisk[];
  declaresContract: boolean;
  explicitExemption: boolean;
  reviewedExemption: boolean;
  finding: "missing_s13_adoption" | "high_risk_without_contract";
};

export type V3S13MigrationAuditReport = {
  schemaVersion: 1;
  migrationCount: number;
  adoptedCount: number;
  exemptCount: number;
  highRiskCount: number;
  findingCount: number;
  highRiskFindingCount: number;
  findings: readonly V3S13MigrationAuditFinding[];
};

export const V3_S13_FRAMEWORK_MIGRATION =
  "20261016234500_v3_s13_migration_hardening.sql";
export const V3_S13_FRAMEWORK_VERSION = "20261016234500";

// Historical post-framework migrations may only be grandfathered here after a
// System review. Do not add broad patterns or date ranges: each exemption must
// name one concrete migration and carry durable ownership + evidence.
export const V3_S13_REVIEWED_EXEMPTIONS: readonly V3S13ReviewedExemption[] = [];

const S13_MARKER = /--\s*V3-S13:\s*(?:contract|exempt)\b/i;
const S13_EXEMPTION = /--\s*V3-S13:\s*exempt\b[^\n]*\breason\s*=\s*\S+/i;
const CONTRACT_DECLARATION =
  /(?:v3_register_migration_contract\s*\(|insert\s+into\s+private\.v3_migration_contracts\b)/i;

function stripSqlComments(source: string) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n]*/g, " ");
}

function migrationVersion(path: string) {
  const name = path.split("/").at(-1) ?? "";
  const version = name.split("_", 1)[0] ?? "";
  return /^\d{14}$/.test(version) ? version : null;
}

export function classifyV3S13MigrationRisks(
  source: string,
): readonly V3S13MigrationRisk[] {
  const sql = stripSqlComments(source);
  const risks = new Set<V3S13MigrationRisk>();

  if (
    /\bdrop\s+(?:table|schema|view|materialized\s+view|type|function)\b/i.test(sql) ||
    /\balter\s+table\b[\s\S]*?\bdrop\s+(?:column|constraint)\b/i.test(sql)
  ) {
    risks.add("destructive_ddl");
  }
  if (/\bdelete\s+from\b/i.test(sql)) risks.add("bulk_delete");
  if (/\btruncate\b/i.test(sql)) risks.add("bulk_truncate");

  // Conservative on purpose: moving existing rows with UPDATE or
  // INSERT..SELECT is backfill-like and needs either the bounded S13 machinery
  // or a concrete reviewed exemption.
  if (
    /\bupdate\s+[a-z0-9_."\s]+\s+set\b/i.test(sql) ||
    /\binsert\s+into\b[\s\S]*?\bselect\b/i.test(sql)
  ) {
    risks.add("backfill_like_dml");
  }

  return [...risks].sort();
}

export function validateV3S13ReviewedExemptions(
  migrations: readonly V3S13MigrationAuditInput[],
  exemptions: readonly V3S13ReviewedExemption[],
): readonly string[] {
  const migrationPaths = new Set(migrations.map((migration) => migration.path));
  const seen = new Set<string>();
  const errors: string[] = [];

  for (const exemption of exemptions) {
    if (seen.has(exemption.path)) {
      errors.push(`duplicate exemption: ${exemption.path}`);
    }
    seen.add(exemption.path);

    if (!migrationPaths.has(exemption.path)) {
      errors.push(`exemption does not match a post-framework migration: ${exemption.path}`);
    }
    const version = migrationVersion(exemption.path);
    if (!version || version <= V3_S13_FRAMEWORK_VERSION) {
      errors.push(`exemption is not newer than the S13 framework: ${exemption.path}`);
    }
    for (const [field, value] of [
      ["owner", exemption.owner],
      ["reason", exemption.reason],
      ["evidence", exemption.evidence],
    ] as const) {
      if (!value.trim()) errors.push(`exemption ${exemption.path} is missing ${field}`);
    }
  }

  return errors.sort();
}

export function auditV3S13MigrationAdoption(
  migrations: readonly V3S13MigrationAuditInput[],
  reviewedExemptions: readonly V3S13ReviewedExemption[] =
    V3_S13_REVIEWED_EXEMPTIONS,
): V3S13MigrationAuditReport {
  const findings: V3S13MigrationAuditFinding[] = [];
  const reviewedPaths = new Set(reviewedExemptions.map((entry) => entry.path));
  let adoptedCount = 0;
  let exemptCount = 0;
  let highRiskCount = 0;

  for (const migration of migrations) {
    const declaresContract =
      CONTRACT_DECLARATION.test(migration.source) ||
      (/--\s*V3-S13:\s*contract\b/i.test(migration.source) &&
        S13_MARKER.test(migration.source));
    const inlineExemption = S13_EXEMPTION.test(migration.source);
    const reviewedExemption = reviewedPaths.has(migration.path);
    const explicitExemption = inlineExemption || reviewedExemption;
    const risks = classifyV3S13MigrationRisks(migration.source);

    if (declaresContract) adoptedCount += 1;
    if (explicitExemption) exemptCount += 1;
    if (risks.length) highRiskCount += 1;

    if (declaresContract || explicitExemption) continue;

    findings.push({
      path: migration.path,
      risks,
      declaresContract,
      explicitExemption,
      reviewedExemption,
      finding: risks.length
        ? "high_risk_without_contract"
        : "missing_s13_adoption",
    });
  }

  return {
    schemaVersion: 1,
    migrationCount: migrations.length,
    adoptedCount,
    exemptCount,
    highRiskCount,
    findingCount: findings.length,
    highRiskFindingCount: findings.filter((finding) => finding.risks.length > 0)
      .length,
    findings,
  };
}
