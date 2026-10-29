import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { buildV3ReleaseManifest, parseV3ReleaseRiskEvidence, type V3ReleaseEvidence } from "../src/lib/v3-release-evidence";

function candidateSha() {
  const checkedOut = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim().toLowerCase();
  const requested = process.env.V3_CANDIDATE_SHA?.trim().toLowerCase() || process.env.GITHUB_SHA?.trim().toLowerCase();
  if (requested && (!/^[0-9a-f]{40}$/.test(requested) || requested !== checkedOut)) throw new Error("Release manifest candidate must match the checked-out exact SHA");
  return checkedOut;
}

const sha = candidateSha();
const evidenceDirectory = resolve(process.env.V3_RELEASE_EVIDENCE_DIR?.trim() || "v3-release-evidence");
const riskPath = resolve(process.env.V3_RELEASE_RISK_REPORT?.trim() || "v3-release-preflight/static/s15-burndown.json");
const outputDirectory = resolve(process.env.V3_RELEASE_MANIFEST_DIR?.trim() || "v3-release-evidence");

const releaseRisk = parseV3ReleaseRiskEvidence(JSON.parse(readFileSync(riskPath, "utf8")), sha);

const evidence: V3ReleaseEvidence[] = [];
if (existsSync(evidenceDirectory)) {
  for (const name of readdirSync(evidenceDirectory)) {
    if (!name.endsWith(".json") || name === "release-manifest.json") continue;
    try {
      const value = JSON.parse(readFileSync(join(evidenceDirectory, name), "utf8"));
      if (value && typeof value === "object" && "gate_id" in value) evidence.push(value as V3ReleaseEvidence);
    } catch {
      throw new Error(`Invalid release evidence JSON: ${basename(name)}`);
    }
  }
}

const manifest = buildV3ReleaseManifest({
  candidateSha: sha,
  releaseRisk,
  evidence,
});

mkdirSync(outputDirectory, { recursive: true });
const path = join(outputDirectory, "release-manifest.json");
writeFileSync(path, JSON.stringify(manifest, null, 2) + "\n");
process.stdout.write(JSON.stringify(manifest, null, 2) + "\n");
if (!manifest.release_ready) process.exitCode = 1;
