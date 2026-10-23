export type V3S13MigrationAuditInput = {
  path: string;
  source: string;
};

export type V3S13MigrationRisk =
  | "destructive_ddl"
  | "bulk_delete"
  | "bulk_truncate"
  | "backfill_like_dml";

export type V3S13ReviewedExemptionReason =
  | "pre_framework_merge"
  | "immutable_history_forward_repaired";

export type V3S13ReviewedMigrationExemption = {
  path: string;
  reason: V3S13ReviewedExemptionReason;
  rationale: string;
};

export type V3S13MigrationAuditFinding = {
  path: string;
  risks: readonly V3S13MigrationRisk[];
  declaresContract: boolean;
  explicitExemption: boolean;
  finding: "missing_s13_adoption" | "high_risk_without_contract";
};

export type V3S13MigrationExemptionIssue = {
  path: string;
  issue:
    | "duplicate_exemption"
    | "invalid_exemption_path"
    | "invalid_exemption_reason"
    | "empty_exemption_rationale"
    | "stale_exemption";
};

export type V3S13MigrationAuditReport = {
  schemaVersion: 2;
  migrationCount: number;
  adoptedCount: number;
  exemptCount: number;
  highRiskCount: number;
  findingCount: number;
  exemptionIssueCount: number;
  clean: boolean;
  findings: readonly V3S13MigrationAuditFinding[];
  exemptionIssues: readonly V3S13MigrationExemptionIssue[];
};

const CONTRACT_DECLARATION = /(?:v3_register_migration_contract\s*\(|insert\s+into\s+private\.v3_migration_contracts\b)/i;
const MIGRATION_PATH = /^supabase\/migrations\/\d{14}_[a-z0-9_.-]+\.sql$/;
const VALID_EXEMPTION_REASONS = new Set<V3S13ReviewedExemptionReason>([
  "pre_framework_merge",
  "immutable_history_forward_repaired",
]);

function stripSqlComments(source: string) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n]*/g, " ");
}

export function classifyV3S13MigrationRisks(source: string): readonly V3S13MigrationRisk[] {
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

  // Conservative by design: moving existing rows after the S13 boundary must
  // either use the resumable migration machinery or have a reviewed exception.
  if (
    /\bupdate\s+[a-z0-9_."\s]+\s+set\b/i.test(sql) ||
    /\binsert\s+into\b[\s\S]*?\bselect\b/i.test(sql)
  ) {
    risks.add("backfill_like_dml");
  }

  return [...risks].sort();
}

function validateReviewedExemptions(
  migrations: readonly V3S13MigrationAuditInput[],
  exemptions: readonly V3S13ReviewedMigrationExemption[],
) {
  const migrationPaths = new Set(migrations.map((migration) => migration.path));
  const validByPath = new Map<string, V3S13ReviewedMigrationExemption>();
  const issues: V3S13MigrationExemptionIssue[] = [];
  const seen = new Set<string>();

  for (const exemption of exemptions) {
    if (seen.has(exemption.path)) {
      issues.push({ path: exemption.path, issue: "duplicate_exemption" });
      continue;
    }
    seen.add(exemption.path);

    if (!MIGRATION_PATH.test(exemption.path)) {
      issues.push({ path: exemption.path, issue: "invalid_exemption_path" });
      continue;
    }
    if (!VALID_EXEMPTION_REASONS.has(exemption.reason)) {
      issues.push({ path: exemption.path, issue: "invalid_exemption_reason" });
      continue;
    }
    if (!exemption.rationale.trim()) {
      issues.push({ path: exemption.path, issue: "empty_exemption_rationale" });
      continue;
    }
    if (!migrationPaths.has(exemption.path)) {
      issues.push({ path: exemption.path, issue: "stale_exemption" });
      continue;
    }

    validByPath.set(exemption.path, exemption);
  }

  return { validByPath, issues };
}

export function auditV3S13MigrationAdoption(
  migrations: readonly V3S13MigrationAuditInput[],
  exemptions: readonly V3S13ReviewedMigrationExemption[] = [],
): V3S13MigrationAuditReport {
  const findings: V3S13MigrationAuditFinding[] = [];
  const { validByPath, issues: exemptionIssues } = validateReviewedExemptions(
    migrations,
    exemptions,
  );
  let adoptedCount = 0;
  let exemptCount = 0;
  let highRiskCount = 0;

  for (const migration of migrations) {
    const declaresContract = CONTRACT_DECLARATION.test(stripSqlComments(migration.source));
    const explicitExemption = validByPath.has(migration.path);
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
      finding: risks.length ? "high_risk_without_contract" : "missing_s13_adoption",
    });
  }

  const findingCount = findings.length;
  const exemptionIssueCount = exemptionIssues.length;
  return {
    schemaVersion: 2,
    migrationCount: migrations.length,
    adoptedCount,
    exemptCount,
    highRiskCount,
    findingCount,
    exemptionIssueCount,
    clean: findingCount === 0 && exemptionIssueCount === 0,
    findings,
    exemptionIssues,
  };
}
