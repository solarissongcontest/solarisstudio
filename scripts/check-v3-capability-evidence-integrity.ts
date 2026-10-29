import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

import {
  V3_ORGANIZER_CAPABILITY_REGISTRY,
  V3_PUBLIC_CAPABILITIES,
} from "../src/lib/v3-capability-registry";

type CapabilitySurface = "public" | "organizer";
type EvidenceStatus = "not-required" | "missing" | "partial" | "complete";

type CapabilityEvidenceInput = {
  surface: CapabilitySurface;
  capabilityId: string;
  declaredStatus: string;
  migrationEvidence?: string;
};

export type CapabilityEvidenceAuditRow = CapabilityEvidenceInput & {
  evidenceRequired: boolean;
  evidenceStatus: EvidenceStatus;
  evidenceReferences: string[];
  repositoryEvidenceReferences: string[];
  missingRepositoryEvidence: string[];
  unverifiableEvidenceReferences: string[];
  statusIntegrityViolation: boolean;
  ownerLane: "Session 2 — Public" | "Session 3 — Organizer";
};

const FINAL_MIGRATION_STATUSES = new Set(["parity", "cutover", "retired"]);
const REPOSITORY_EVIDENCE_PREFIX = /^(?:\.github|docs|e2e|public|scripts|src|supabase)\//;

export function parseV3MigrationEvidence(value?: string): string[] {
  return (value ?? "")
    .split(";")
    .map((item) => item.trim())
    .filter(Boolean);
}

function isRepositoryEvidenceReference(reference: string) {
  return REPOSITORY_EVIDENCE_PREFIX.test(reference);
}

export function auditV3CapabilityEvidence(
  input: CapabilityEvidenceInput,
  fileExists: (path: string) => boolean = existsSync,
): CapabilityEvidenceAuditRow {
  const evidenceRequired = FINAL_MIGRATION_STATUSES.has(input.declaredStatus);
  const evidenceReferences = parseV3MigrationEvidence(input.migrationEvidence);
  const repositoryEvidenceReferences = evidenceReferences.filter(isRepositoryEvidenceReference);
  const unverifiableEvidenceReferences = evidenceReferences.filter(
    (reference) => !isRepositoryEvidenceReference(reference),
  );
  const missingRepositoryEvidence = repositoryEvidenceReferences.filter(
    (reference) => !fileExists(reference),
  );

  let evidenceStatus: EvidenceStatus = "not-required";
  if (evidenceRequired) {
    if (!evidenceReferences.length || !repositoryEvidenceReferences.length) {
      evidenceStatus = "missing";
    } else if (missingRepositoryEvidence.length || unverifiableEvidenceReferences.length) {
      evidenceStatus = "partial";
    } else {
      evidenceStatus = "complete";
    }
  }

  return {
    ...input,
    evidenceRequired,
    evidenceStatus,
    evidenceReferences,
    repositoryEvidenceReferences,
    missingRepositoryEvidence,
    unverifiableEvidenceReferences,
    statusIntegrityViolation: evidenceRequired && evidenceStatus !== "complete",
    ownerLane: input.surface === "public" ? "Session 2 — Public" : "Session 3 — Organizer",
  };
}

function exactSha() {
  const envSha = process.env.GITHUB_SHA?.trim();
  if (envSha && /^[0-9a-f]{40}$/i.test(envSha)) return envSha.toLowerCase();
  try {
    const sha = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
    return /^[0-9a-f]{40}$/i.test(sha) ? sha.toLowerCase() : "unknown";
  } catch {
    return "unknown";
  }
}

export function buildV3CapabilityEvidenceIntegrityReport(
  fileExists: (path: string) => boolean = existsSync,
) {
  const publicRows = V3_PUBLIC_CAPABILITIES.map((item) =>
    auditV3CapabilityEvidence(
      {
        surface: "public",
        capabilityId: item.id,
        declaredStatus: item.specificationStatus,
        migrationEvidence: "migrationEvidence" in item ? item.migrationEvidence : undefined,
      },
      fileExists,
    ),
  );

  const organizerRows = V3_ORGANIZER_CAPABILITY_REGISTRY.map((item) =>
    auditV3CapabilityEvidence(
      {
        surface: "organizer",
        capabilityId: item.legacyId,
        declaredStatus: item.migrationStatus,
        migrationEvidence: item.migrationEvidence,
      },
      fileExists,
    ),
  );

  const rows = [...publicRows, ...organizerRows];
  const violations = rows.filter((item) => item.statusIntegrityViolation);

  return {
    schemaVersion: 1,
    candidateSha: exactSha(),
    generatedAt: new Date().toISOString(),
    invariant:
      "A capability declared parity/cutover/retired must cite machine-verifiable repository evidence that still exists on the exact source tree.",
    summary: {
      publicCapabilities: publicRows.length,
      organizerCapabilities: organizerRows.length,
      evidenceRequired: rows.filter((item) => item.evidenceRequired).length,
      evidenceComplete: rows.filter((item) => item.evidenceStatus === "complete").length,
      statusIntegrityViolations: violations.length,
    },
    violations,
    public: publicRows,
    organizer: organizerRows,
  };
}

function markdown(report: ReturnType<typeof buildV3CapabilityEvidenceIntegrityReport>) {
  const lines = [
    "# V3 capability evidence integrity",
    "",
    `- Exact SHA: \`${report.candidateSha}\``,
    `- Final-state capabilities requiring evidence: **${report.summary.evidenceRequired}**`,
    `- Complete evidence sets: **${report.summary.evidenceComplete}**`,
    `- Status-integrity violations: **${report.summary.statusIntegrityViolations}**`,
    "",
    "> Declaring parity/cutover/retired is not evidence. Final-state registry rows must point to repository evidence that exists on this exact tree.",
    "",
  ];

  if (!report.violations.length) {
    lines.push("No final-state capability evidence violations detected.");
  } else {
    lines.push("## Violations", "");
    for (const item of report.violations) {
      const reasons: string[] = [];
      if (!item.evidenceReferences.length) reasons.push("no migrationEvidence declared");
      if (item.evidenceReferences.length && !item.repositoryEvidenceReferences.length) {
        reasons.push("no machine-verifiable repository evidence reference");
      }
      if (item.missingRepositoryEvidence.length) {
        reasons.push(`missing paths: ${item.missingRepositoryEvidence.join(", ")}`);
      }
      if (item.unverifiableEvidenceReferences.length) {
        reasons.push(`unverifiable refs: ${item.unverifiableEvidenceReferences.join(", ")}`);
      }
      lines.push(
        `- **${item.surface}/${item.capabilityId}** declared \`${item.declaredStatus}\` but evidence is \`${item.evidenceStatus}\`: ${reasons.join("; ")} · owner ${item.ownerLane}`,
      );
    }
  }

  return `${lines.join("\n")}\n`;
}

if (import.meta.main) {
  const report = buildV3CapabilityEvidenceIntegrityReport();
  if (process.argv.includes("--json")) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    process.stdout.write(markdown(report));
  }

  if (process.argv.includes("--require-complete") && report.violations.length) {
    process.exitCode = 1;
  }
}
