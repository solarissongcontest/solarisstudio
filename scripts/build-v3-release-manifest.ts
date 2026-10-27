import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { buildV3ReleaseManifest, type V3ReleaseEvidence } from "../src/lib/v3-release-evidence";

function candidateSha() {
  const env = process.env.V3_CANDIDATE_SHA?.trim().toLowerCase() || process.env.GITHUB_SHA?.trim().toLowerCase();
  if (env && /^[0-9a-f]{40}$/.test(env)) return env;
  return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim().toLowerCase();
}

const sha = candidateSha();
const evidenceDirectory = resolve(process.env.V3_RELEASE_EVIDENCE_DIR?.trim() || "v3-release-evidence");
const riskPath = resolve(process.env.V3_RELEASE_RISK_REPORT?.trim() || "v3-release-preflight/static/s15-burndown.json");
const outputDirectory = resolve(process.env.V3_RELEASE_MANIFEST_DIR?.trim() || "v3-release-evidence");

const riskSource = JSON.parse(readFileSync(riskPath, "utf8")) as {
  releaseRisk?: { totals?: Record<string, number>; unresolvedTotal?: number };
  releaseRiskTotals?: Record<string, number>;
  currentReadinessFindingCount?: number;
};
const totals = riskSource.releaseRisk?.totals ?? riskSource.releaseRiskTotals ?? {};
const unresolvedTotal = riskSource.releaseRisk?.unresolvedTotal ?? riskSource.currentReadinessFindingCount ?? 0;

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
  releaseRisk: {
    hard_blocker: Number(totals.hard_blocker ?? 0),
    conditional_blocker: Number(totals.conditional_blocker ?? 0),
    tracked_migration_debt: Number(totals.tracked_migration_debt ?? 0),
    obsolete_or_replaced: Number(totals.obsolete_or_replaced ?? 0),
    unresolvedTotal: Number(unresolvedTotal),
  },
  evidence,
});

mkdirSync(outputDirectory, { recursive: true });
const path = join(outputDirectory, "release-manifest.json");
writeFileSync(path, JSON.stringify(manifest, null, 2) + "\n");
process.stdout.write(JSON.stringify(manifest, null, 2) + "\n");
if (!manifest.release_ready) process.exitCode = 1;
