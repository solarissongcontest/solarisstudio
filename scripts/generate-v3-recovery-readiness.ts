import { writeFileSync } from "node:fs";
import { buildV3RecoveryReadinessReport } from "../src/lib/v3-recovery-guardrails";
import { validateV3ProjectionReconciliationRegistry } from "../src/lib/v3-projection-reconciliation-registry";

function requiredEnvironment(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(`[v3-recovery-readiness] ${name} is required`);
    process.exit(2);
  }
  return value;
}

const commitSha = requiredEnvironment("V3_RECOVERY_EVIDENCE_SHA").toLowerCase();
if (!/^[0-9a-f]{40}$/.test(commitSha)) {
  console.error("[v3-recovery-readiness] V3_RECOVERY_EVIDENCE_SHA must be an exact 40-character commit SHA");
  process.exit(2);
}

const environment = requiredEnvironment("V3_RECOVERY_EVIDENCE_ENVIRONMENT");
if (environment.length > 120) {
  console.error("[v3-recovery-readiness] V3_RECOVERY_EVIDENCE_ENVIRONMENT must be at most 120 characters");
  process.exit(2);
}

const registryErrors = validateV3ProjectionReconciliationRegistry();
if (registryErrors.length > 0) {
  console.error(JSON.stringify({ ok: false, registryErrors }, null, 2));
  process.exit(1);
}

const report = buildV3RecoveryReadinessReport();
const output = `${JSON.stringify(
  {
    ok: true,
    generatedAt: new Date().toISOString(),
    evidenceIdentity: {
      commitSha,
      environment,
      command: "npx tsx scripts/generate-v3-recovery-readiness.ts",
    },
    report,
  },
  null,
  2,
)}\n`;

const outputPath = process.env.V3_RECOVERY_EVIDENCE_OUTPUT?.trim();
if (outputPath) writeFileSync(outputPath, output, "utf8");
else process.stdout.write(output);
