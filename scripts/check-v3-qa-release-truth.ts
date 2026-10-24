import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { assessV3QaReleaseTruth } from "../src/lib/v3-qa-release-truth";

function currentSha() {
  for (const candidate of [process.env.V3_CANDIDATE_SHA, process.env.GITHUB_SHA]) {
    const normalized = candidate?.trim().toLowerCase();
    if (normalized && /^[0-9a-f]{40}$/.test(normalized)) return normalized;
  }
  try {
    const value = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim().toLowerCase();
    if (/^[0-9a-f]{40}$/.test(value)) return value;
  } catch {
    // The explicit error below is more useful than leaking git stderr.
  }
  throw new Error("Cannot resolve one exact 40-character candidate SHA");
}

const candidateSha = currentSha();
const evidenceDir = resolve(process.env.V3_RELEASE_EVIDENCE_DIR?.trim() || "v3-release-evidence");
const truth = assessV3QaReleaseTruth(candidateSha, evidenceDir);

process.stdout.write(`${JSON.stringify(truth, null, 2)}\n`);

if (process.argv.includes("--fail-on-invalid") && truth.invalidEvidence.length) {
  process.stderr.write(`V3 QA release truth found invalid evidence:\n- ${truth.invalidEvidence.join("\n- ")}\n`);
  process.exit(1);
}

if (process.argv.includes("--require-s16-ready") && !truth.readyForS16) {
  const missing = truth.missingEvidence.filter((id) => id !== "S16");
  process.stderr.write(
    `V3 candidate ${truth.candidateSha} is not ready for S16. Missing: ${missing.join(", ") || "none"}; invalid: ${truth.invalidEvidence.join(" | ") || "none"}\n`,
  );
  process.exit(1);
}

if (process.argv.includes("--require-certified") && !truth.certified) {
  process.stderr.write(
    `V3 candidate ${truth.candidateSha} is not certified. Missing: ${truth.missingEvidence.join(", ") || "none"}; invalid: ${truth.invalidEvidence.join(" | ") || "none"}\n`,
  );
  process.exit(1);
}
