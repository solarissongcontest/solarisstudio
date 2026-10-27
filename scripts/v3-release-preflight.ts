import { assessS14Execution } from "./lib/v3-s14-execution-gate";
import { isResolvedV3DomainConsequence } from "../src/lib/v3-domain-consequence-registry";
import { classifyV3ConsequenceRelease, requiredConsequenceMaturity } from "../src/lib/v3-consequence-release-classification";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { V3_PUBLIC_CAPABILITIES, V3_ORGANIZER_CAPABILITY_REGISTRY, V3_DOMAIN_CONSEQUENCE_REGISTRY } from "../src/lib/v3-capability-registry";
import { candidateSnapshotFindings, execute, localSupabaseEnvironment, runSweep, staticEnvironment, type Check } from "./lib/v3-release-preflight";

const group = process.argv.find((arg) => arg.startsWith("--group="))?.split("=")[1] ?? "static";
if (!["static", "database"].includes(group)) throw new Error("Use --group=static or --group=database");
const directory = resolve(process.env.V3_PREFLIGHT_DIR ?? `v3-release-preflight/${group}`);
const candidateSha = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const sourceChanges = () => execFileSync("git", ["status", "--porcelain", "--untracked-files=all"], { encoding: "utf8" }).trim().split("\n").filter(Boolean);
const changesBefore = sourceChanges();
const requested = process.env.V3_CANDIDATE_SHA;
if (requested && requested !== candidateSha) throw new Error("Preflight candidate differs from checked-out exact SHA");
const bun = process.execPath;
const scripts = [
  ["capabilityRegistry", "check-v3-capability-registry.ts"],
  ["nonRouteOwnership", "check-v3-non-route-capabilities.ts"],
  ["systemRegistries", "check-v3-system-s1-registries.ts"],
  ["releaseIntegrity", "check-v3-release-integrity.ts"],
  ["migrationAdoption", "check-v3-s13-migration-adoption.ts"],
];
const checks: Check[] = group === "static" ? [
  { id: "productionIsolation", group: "static", command: [bun, "--env-file=/dev/null", "run", "scripts/check-v3-production-isolation.ts"] },
  { id: "s15ZeroOrphan", group: "static", command: [bun, "--env-file=/dev/null", "run", "scripts/check-v3-s15-zero-orphan-readiness.ts", "--json", "--require-zero"], json: true },
  { id: "repositoryReleaseReadiness", group: "static", command: [bun, "--env-file=/dev/null", "run", "scripts/check-v3-release-integrity.ts", "--discovery", "--json"], json: true },
  { id: "burndownAudit", group: "static", command: [bun, "--env-file=/dev/null", "run", "scripts/check-v3-s15-burndown.ts"], json: true },
  { id: "regressionProvenance", group: "static", dependencies: ["productionIsolation"], command: ["bash", ".github/scripts/v3-s15-regression-provenance.sh"] },
  { id: "physicalOwnership", group: "static", command: [bun, "--env-file=/dev/null", "run", "scripts/check-v3-s15-physical-ownership.ts", "--json", "--require-zero"], json: true },
  ...scripts.map(([id, path]): Check => ({ id, group: "static", command: [bun, "--env-file=/dev/null", "run", `scripts/${path}`] })),
  { id: "releaseContracts", group: "static", dependencies: ["productionIsolation"], command: [bun, "--env-file=/dev/null", "test", "src"] },
  { id: "productionBuild", group: "static", dependencies: ["productionIsolation"], command: [bun, "--env-file=/dev/null", "run", "build"] },
  { id: "teaserRestrictedCutover", group: "static", dependencies: ["productionIsolation", "productionBuild"], command: [bun, "--env-file=/dev/null", "run", "scripts/check-v3-teaser-cutover.ts"], json: true },
  { id: "clientBudget", group: "static", dependencies: ["productionBuild"], command: [bun, "--env-file=/dev/null", "run", "budget:client"] },
  { id: "typecheck", group: "static", dependencies: ["productionBuild"], command: [bun, "--env-file=/dev/null", "x", "tsc", "--noEmit"] },
  { id: "lint", group: "static", command: [bun, "--env-file=/dev/null", "run", "lint:ci"] },
] : [
  { id: "s16Catalog", group: "database", command: [bun, "--env-file=/dev/null", "run", "scripts/collect-v3-s16-catalog-evidence.ts", `--out=${directory}/s16-catalog.json`] },
  { id: "s16Authority", group: "database", dependencies: ["s16Catalog"], command: [bun, "--env-file=/dev/null", "run", "scripts/check-v3-s16-mutation-authority.ts", `--catalog=${directory}/s16-catalog.json`, "--enforce"], json: true },
  { id: "sharedWriterAuthority", group: "database", command: ["bash", ".github/scripts/v3-canonical-writer-rehearsal.sh"] },
  { id: "resultsRegression", group: "database", command: ["bash", ".github/scripts/v3-s14-results-lineup-regression.sh"] },
  { id: "qualificationRegression", group: "database", command: ["bash", ".github/scripts/v3-s14-qualification-regression.sh"] },
  { id: "integrationRuntime", group: "database", command: ["bash", ".github/scripts/v3-s14-integration-runtime-regression.sh"] },
  { id: "resultsQualificationPublicationHandoff", group: "handoff", command: ["bash", ".github/scripts/v3-s14-publication-handoff-regression.sh"] },
  { id: "votingResultTruth", group: "database", resetBefore: true, command: ["bash", ".github/scripts/v3-s14-televote-result-truth-rehearsal.sh"] },
  { id: "archiveRegression", group: "database", resetBefore: true, command: ["bash", ".github/scripts/v3-s14-archive-system-rehearsal.sh"] },
  { id: "participantActivityProjection", group: "database", resetBefore: true, command: ["bash", ".github/scripts/v3-participant-activity-regression.sh"] },
  { id: "publicPublishedSnapshot", group: "database", resetBefore: true, command: ["bash", "scripts/rehearse-v3-public-result-snapshot.sh"] },
  { id: "receiptReadReplacement", group: "database", resetBefore: true, command: ["bash", ".github/scripts/v3-operation-receipt-rehearsal.sh"] },
];
const outcomes = runSweep(checks, directory, (check) => {
  if (group === "database") {
    localSupabaseEnvironment();
    if (check.resetBefore) {
      const reset = execute(["supabase", "db", "reset", "--local", "--no-seed"]);
      if (reset.status !== 0) return { ...reset, stderr: `ISOLATED_RESET_FAILED\n${reset.stderr}` };
      localSupabaseEnvironment();
    }
  }
  if (group === "static") {
    try { return execute(check.command, staticEnvironment()); }
    catch (error) {
      if (["productionIsolation", "productionBuild", "releaseContracts", "clientBudget", "typecheck"].includes(check.id)) throw error;
      return execute(check.command);
    }
  }
  return execute(check.command);
});
const s15 = outcomes.s15ZeroOrphan?.report as { findings?: string[] } | undefined;
const audit = (s15?.findings ?? []).map((finding) => {
  const [category, artifact] = finding.split(" ");
  const id = artifact?.split(":")[0];
  const publicRow = category === "PUBLIC_CUTOVER_UNRESOLVED" ? V3_PUBLIC_CAPABILITIES.find((row) => row.id === id) : undefined;
  const organizerRow = category === "ORGANIZER_CUTOVER_UNRESOLVED" ? V3_ORGANIZER_CAPABILITY_REGISTRY.find((row) => row.legacyId === id) : undefined;
  return {
    finding, artifact: id, classification: publicRow || organizerRow ? "N_RELEASE_CUTOVER_INCOMPLETE" : "REQUIRES_OWNER_INVESTIGATION",
    owner: publicRow?.backendOwners ?? (organizerRow ? [organizerRow.targetDomain, organizerRow.ownerCapability] : []),
    source: publicRow ? "src/lib/v3-public-capability-registry.ts + v3-public-capability-supplements.ts" : "src/lib/v3-organizer-capability-registry.ts",
    targetRoute: publicRow?.targetRoute ?? organizerRow?.targetRoute,
    acceptanceScenario: publicRow?.acceptanceScenarioId,
    status: publicRow?.specificationStatus ?? organizerRow?.migrationStatus,
    assessment: "Declared status has not reached cutover/retired. Ownership is mapped; cutover acceptance must be proven by the owning capability. No status promotion or suppression is authorized by this scan.",
  };
});
mkdirSync(directory, { recursive: true });
const consequenceAudit = group === "static" ? V3_DOMAIN_CONSEQUENCE_REGISTRY.filter((row) => !isResolvedV3DomainConsequence(row)).map((row) => {
  const releaseClass = classifyV3ConsequenceRelease(row.eventType);
  return {
    event: row.eventType,
    owner: row.ownerDomain,
    state: row.implementationState,
    consumers: row.consumers,
    evidence: row.evidence,
    releaseClass,
    requiredMaturity: requiredConsequenceMaturity(releaseClass),
    releaseRisk: releaseClass === "integrity_critical" || releaseClass === "delivery_critical"
      ? "hard_blocker"
      : "tracked_migration_debt",
    classification: releaseClass === "integrity_critical"
      ? "INTEGRITY_CRITICAL_CONSEQUENCE_PROOF_MISSING"
      : releaseClass === "delivery_critical"
        ? "DELIVERY_CRITICAL_CONSEQUENCE_PROOF_MISSING"
        : "NON_CRITICAL_CONSEQUENCE_MATURITY_DEBT",
    assessment: releaseClass === "integrity_critical"
      ? "Official-state consequence maturity is incomplete; release remains blocked until transactional/reconciliation proof exists."
      : releaseClass === "delivery_critical"
        ? "Delivery consequence maturity is incomplete; release remains blocked until durable retry/failure evidence exists."
        : "Derived or observational consequence maturity remains tracked without inventing integrity-grade event/outbox ceremony.",
  };
}) : [];
const changesAfter = sourceChanges();
const finalCandidateSha = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const candidateStable = candidateSha === finalCandidateSha;
const generatedToolCaches = [
  ...(existsSync("supabase/.temp") ? readdirSync("supabase/.temp").sort().map((name) => `supabase/.temp/${name}`) : []),
  ...(existsSync("supabase/.branches/_current_branch") ? ["supabase/.branches/_current_branch"] : []),
];
const changedPaths = [...new Set([...changesBefore, ...changesAfter])].sort();
const snapshotFindings = candidateSnapshotFindings(candidateSha, finalCandidateSha, changedPaths);
outcomes[`${group}SourceIntegrity`] = {
  status: snapshotFindings.length ? "fail" : "pass", exitCode: null,
  findings: snapshotFindings,
};
if (changedPaths.length) console.error(`Source integrity failed: ${changedPaths.join(", ")}`);
const s14Execution = group === "static" ? assessS14Execution(candidateSha, outcomes, false) : null;
const passed = Object.values(outcomes).every((outcome) => outcome.status === "pass");
writeFileSync(resolve(directory, "preflight-summary.json"), `${JSON.stringify({ schemaVersion: 1, candidateSha, finalCandidateSha, candidateStable, sourceClean: candidateStable && changesBefore.length === 0 && changesAfter.length === 0, sourceChanges: { before: changesBefore, after: changesAfter }, generatedToolCaches, group, passed, s14Execution, catalog: checks, checks: outcomes, cutoverAudit: audit, consequenceAudit }, null, 2)}\n`);
for (const [id, outcome] of Object.entries(outcomes)) console.log(`${id}: ${outcome.status.toUpperCase()}${outcome.findings.length ? ` (${outcome.findings.length} findings)` : ""}`);
console.log(`Complete ${group} discovery: ${passed ? "PASS" : "FAIL"}; ${directory}/preflight-summary.json`);
if (group === "static" ? !s14Execution?.allowed : !passed) process.exitCode = 1;
