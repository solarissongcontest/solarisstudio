export type V3QaSystemPhaseId =
  | "S10"
  | "S11"
  | "S12"
  | "S13"
  | "S14"
  | "S15"
  | "S16";

export type V3QaSystemPhaseOwner = "system" | "qa-integrator";
export type V3QaStaticReadiness = "missing" | "partial" | "wired";

export type V3QaSystemPhaseManifestRow = {
  id: V3QaSystemPhaseId;
  name: string;
  owner: V3QaSystemPhaseOwner;
  implementationFiles: readonly string[];
  verificationFiles: readonly string[];
  dependsOn: readonly string[];
  exactShaEvidenceRequired: true;
  certificationRequirement: string;
};

export type V3QaSystemPhaseReadinessRow = V3QaSystemPhaseManifestRow & {
  staticReadiness: V3QaStaticReadiness;
  presentImplementationFiles: readonly string[];
  missingImplementationFiles: readonly string[];
  presentVerificationFiles: readonly string[];
  missingVerificationFiles: readonly string[];
  certificationClaim: false;
};

/**
 * Static repository wiring for the final System/QA phases.
 *
 * This deliberately does NOT model runtime success. File presence can prove that
 * a phase has implementation/evidence plumbing, but it can never prove that an
 * exact release candidate passed the phase. S14-S16 especially must stay bound
 * to external exact-SHA evidence rather than becoming optimistic source scans.
 */
export const V3_QA_SYSTEM_PHASE_MANIFEST: readonly V3QaSystemPhaseManifestRow[] = [
  {
    id: "S10",
    name: "SLOs and alerts",
    owner: "system",
    implementationFiles: [
      "src/lib/v3-reliability-slo.ts",
      "src/lib/v3-error-budget.ts",
      "src/lib/v3-s10-slo-policy.ts",
    ],
    verificationFiles: ["src/lib/v3-s10-slo-policy.test.ts"],
    dependsOn: ["S9 observability"],
    exactShaEvidenceRequired: true,
    certificationRequirement:
      "Measured SLO/error-budget evidence and alert behavior must be retained for the exact candidate; repository wiring alone is not certification.",
  },
  {
    id: "S11",
    name: "recovery",
    owner: "system",
    implementationFiles: [
      "src/lib/v3-recovery-guardrails.ts",
      "scripts/generate-v3-recovery-readiness.ts",
      ".github/scripts/v3-s11-database-restore-rehearsal.sh",
      "docs/runbooks/full-service-recovery.md",
    ],
    verificationFiles: [
      "src/lib/v3-recovery-guardrails.test.ts",
      "src/lib/v3-recovery-guardrails.contract.test.ts",
    ],
    dependsOn: ["S4 events/outbox", "S6 projections/reconciliation"],
    exactShaEvidenceRequired: true,
    certificationRequirement:
      "Database, storage, deployment and full-service recovery evidence must converge on the exact candidate; documented procedures do not certify recovery.",
  },
  {
    id: "S12",
    name: "capacity",
    owner: "system",
    implementationFiles: [
      "src/lib/v3-capacity-scenarios.ts",
      "src/lib/v3-capacity-evidence.ts",
      "scripts/generate-v3-capacity-evidence.ts",
      ".github/scripts/v3-s12-local-capacity-rehearsal.mjs",
      "docs/runbooks/capacity-evidence-review.md",
    ],
    verificationFiles: [
      "src/lib/v3-s12-capacity.contract.test.ts",
      "src/lib/v3-capacity-evidence.test.ts",
    ],
    dependsOn: ["S8 resource protection", "S9 observability"],
    exactShaEvidenceRequired: true,
    certificationRequirement:
      "The bounded local capacity portfolio must pass its review gate for the exact candidate; no hosted production load is acceptable evidence.",
  },
  {
    id: "S13",
    name: "migration hardening",
    owner: "system",
    implementationFiles: [
      "src/lib/v3-s13-migration-adoption-audit.ts",
      ".github/scripts/v3-production-head-upgrade-rehearsal.sh",
      ".github/workflows/v3-production-head-upgrade.yml",
    ],
    verificationFiles: [
      "src/lib/v3-s13-migration-adoption-repository.contract.test.ts",
      "src/lib/v3-current-main-migration-rehearsal.contract.test.ts",
    ],
    dependsOn: ["S1 domain ownership", "S3 invariants", "S11 recovery"],
    exactShaEvidenceRequired: true,
    certificationRequirement:
      "Forward adoption, current-main upgrade and compatibility/recovery rehearsals must pass for the exact candidate with no unclassified migration debt.",
  },
  {
    id: "S14",
    name: "full-contest rehearsal",
    owner: "qa-integrator",
    implementationFiles: [
      ".github/scripts/v3-full-contest-rehearsal.sh",
      ".github/workflows/v3-s14-full-contest-rehearsal.yml",
      "scripts/v3-s14-full-contest-spec.ts",
      "scripts/check-v3-s14-rehearsal-readiness.ts",
    ],
    verificationFiles: [
      "src/lib/v3-s14-stateful-harness.contract.test.ts",
      "src/lib/v3-s14-failure-evidence.contract.test.ts",
    ],
    dependsOn: ["S0-S13", "Public cutover", "Organizer cutover", "Navigation acceptance"],
    exactShaEvidenceRequired: true,
    certificationRequirement:
      "One bounded seeded contest must traverse the complete canonical lifecycle, failure injections and Archive on isolated local infrastructure for the exact candidate.",
  },
  {
    id: "S15",
    name: "zero-orphan system audit",
    owner: "qa-integrator",
    implementationFiles: [
      "scripts/check-v3-s15-zero-orphan-readiness.ts",
      "scripts/check-v3-s15-zero-orphan-readiness-core.ts",
      "scripts/build-v3-s15-zero-orphan-evidence.ts",
    ],
    verificationFiles: [
      "src/lib/v3-s15-zero-orphan.contract.test.ts",
      "src/lib/v3-s15-exact-sha-evidence.contract.test.ts",
    ],
    dependsOn: ["System registries", "Public registry", "Organizer registry", "S14"],
    exactShaEvidenceRequired: true,
    certificationRequirement:
      "The final exact-candidate scan must find zero orphan domains, commands, events, projections, jobs, routes, flags, deep links and legacy surfaces.",
  },
  {
    id: "S16",
    name: "final release certification",
    owner: "qa-integrator",
    implementationFiles: [
      "scripts/check-v3-release-integrity.ts",
      ".github/workflows/v3-release-candidate-preflight.yml",
    ],
    verificationFiles: ["src/lib/v3-qa-integration-infrastructure.contract.test.ts"],
    dependsOn: ["S10-S13 exact-SHA evidence", "S14", "S15", "complete release matrix"],
    exactShaEvidenceRequired: true,
    certificationRequirement:
      "Certification may be issued only from the frozen candidate's complete external evidence bundle. Static repository wiring must never manufacture a release certificate.",
  },
] as const;

export function assessV3QaSystemPhaseReadiness(
  exists: (path: string) => boolean,
): V3QaSystemPhaseReadinessRow[] {
  return V3_QA_SYSTEM_PHASE_MANIFEST.map((phase) => {
    const presentImplementationFiles = phase.implementationFiles.filter(exists);
    const missingImplementationFiles = phase.implementationFiles.filter((path) => !exists(path));
    const presentVerificationFiles = phase.verificationFiles.filter(exists);
    const missingVerificationFiles = phase.verificationFiles.filter((path) => !exists(path));

    const presentCount = presentImplementationFiles.length + presentVerificationFiles.length;
    const expectedCount = phase.implementationFiles.length + phase.verificationFiles.length;
    const staticReadiness: V3QaStaticReadiness =
      presentCount === 0 ? "missing" : presentCount === expectedCount ? "wired" : "partial";

    return {
      ...phase,
      staticReadiness,
      presentImplementationFiles,
      missingImplementationFiles,
      presentVerificationFiles,
      missingVerificationFiles,
      certificationClaim: false,
    };
  });
}
