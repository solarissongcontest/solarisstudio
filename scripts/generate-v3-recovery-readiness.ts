import { writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { requireV3RecoveryEvidenceIdentity, requireV3RecoveryCleanTree } from "../src/lib/v3-recovery-evidence-identity";
import { buildV3RecoveryReadinessReport } from "../src/lib/v3-recovery-guardrails";
import { validateV3ProjectionReconciliationRegistry } from "../src/lib/v3-projection-reconciliation-registry";

function failRecoveryIdentity(message: string): never {
  console.error(`[v3-recovery-readiness] ${message}`);
  process.exit(2);
}

function requiredEnvironment(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(`[v3-recovery-readiness] ${name} is required`);
    process.exit(2);
  }
  return value;
}

let checkoutHead: string;
try {
  checkoutHead = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
} catch {
  failRecoveryIdentity("Cannot verify Git HEAD for S11 recovery evidence");
}

let commitSha: string;
try {
  commitSha = requireV3RecoveryEvidenceIdentity(
    requiredEnvironment("V3_RECOVERY_EVIDENCE_SHA"),
    checkoutHead,
  );
} catch (error) {
  failRecoveryIdentity(error instanceof Error ? error.message : String(error));
}

try {
  const sourceStatus = execFileSync("git", ["status", "--porcelain", "--untracked-files=all"], { encoding: "utf8" });
  requireV3RecoveryCleanTree(sourceStatus);
} catch (error) {
  failRecoveryIdentity(error instanceof Error ? error.message : "Cannot verify a clean Git source tree");
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
