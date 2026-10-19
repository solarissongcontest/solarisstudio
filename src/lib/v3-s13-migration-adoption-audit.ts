export type V3S13MigrationAuditInput = {
  path: string;
  source: string;
};

export type V3S13MigrationRisk =
  | "destructive_ddl"
  | "bulk_delete"
  | "bulk_truncate"
  | "backfill_like_dml";

export type V3S13MigrationAuditFinding = {
  path: string;
  risks: readonly V3S13MigrationRisk[];
  declaresContract: boolean;
  explicitExemption: boolean;
  finding: "missing_s13_adoption" | "high_risk_without_contract";
};

export type V3S13MigrationAuditReport = {
  schemaVersion: 1;
  migrationCount: number;
  adoptedCount: number;
  exemptCount: number;
  highRiskCount: number;
  findingCount: number;
  findings: readonly V3S13MigrationAuditFinding[];
};

const S13_MARKER = /--\s*V3-S13:\s*(?:contract|exempt)\b/i;
const S13_EXEMPTION = /--\s*V3-S13:\s*exempt\b[^\n]*\breason\s*=\s*\S+/i;
const CONTRACT_DECLARATION = /(?:v3_register_migration_contract\s*\(|insert\s+into\s+private\.v3_migration_contracts\b)/i;

function stripSqlComments(source: string) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n]*/g, " ");
}

export function classifyV3S13MigrationRisks(source: string): readonly V3S13MigrationRisk[] {
  const sql = stripSqlComments(source);
  const risks = new Set<V3S13MigrationRisk>();

  if (/\bdrop\s+(?:table|schema|view|materialized\s+view|type|function)\b/i.test(sql)
      || /\balter\s+table\b[\s\S]*?\bdrop\s+(?:column|constraint)\b/i.test(sql)) {
    risks.add("destructive_ddl");
  }
  if (/\bdelete\s+from\b/i.test(sql)) risks.add("bulk_delete");
  if (/\btruncate\b/i.test(sql)) risks.add("bulk_truncate");

  // This is intentionally conservative. A post-framework migration that moves
  // existing rows with UPDATE/INSERT..SELECT is backfill-like and should either
  // adopt the resumable S13 machinery or carry a reviewed explicit exemption.
  if (/\bupdate\s+[a-z0-9_."\s]+\s+set\b/i.test(sql)
      || /\binsert\s+into\b[\s\S]*?\bselect\b/i.test(sql)) {
    risks.add("backfill_like_dml");
  }

  return [...risks].sort();
}

export function auditV3S13MigrationAdoption(
  migrations: readonly V3S13MigrationAuditInput[],
): V3S13MigrationAuditReport {
  const findings: V3S13MigrationAuditFinding[] = [];
  let adoptedCount = 0;
  let exemptCount = 0;
  let highRiskCount = 0;

  for (const migration of migrations) {
    const declaresContract = CONTRACT_DECLARATION.test(migration.source)
      || (/--\s*V3-S13:\s*contract\b/i.test(migration.source) && S13_MARKER.test(migration.source));
    const explicitExemption = S13_EXEMPTION.test(migration.source);
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

  return {
    schemaVersion: 1,
    migrationCount: migrations.length,
    adoptedCount,
    exemptCount,
    highRiskCount,
    findingCount: findings.length,
    findings,
  };
}
