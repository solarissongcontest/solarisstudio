import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  validateV3S16SurfaceEvidence,
  type V3S16SurfaceCategory,
} from "../src/lib/v3-s16-surface-evidence-contract";

const SHA_RE = /^[0-9a-f]{40}$/;
const surfaces: Array<{ category: V3S16SurfaceCategory; filename: string }> = [
  { category: "public-acceptance", filename: "s16-public-acceptance.json" },
  { category: "organizer-acceptance", filename: "s16-organizer-acceptance.json" },
  { category: "navigation-acceptance", filename: "s16-navigation-acceptance.json" },
  { category: "accessibility", filename: "s16-accessibility.json" },
  { category: "responsive-behavior", filename: "s16-responsive-behavior.json" },
];

const candidateSha = process.env.V3_CANDIDATE_SHA?.trim().toLowerCase() || "";
const checkedOutSha = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" })
  .trim()
  .toLowerCase();
const inputRoot = resolve(process.env.V3_S16_EVIDENCE_INPUT_ROOT?.trim() || "");
const outputRoot = resolve(
  process.env.V3_RELEASE_EVIDENCE_DIR?.trim() || "v3-s16-supplemental",
);
const evidenceSourceSha = process.env.V3_S16_EVIDENCE_SOURCE_SHA?.trim().toLowerCase() || "";

if (!SHA_RE.test(candidateSha)) {
  throw new Error("V3_CANDIDATE_SHA must be one exact 40-character Git commit SHA");
}
if (candidateSha !== checkedOutSha) {
  throw new Error(`candidate ${candidateSha} does not match checked-out SHA ${checkedOutSha}`);
}
if (!SHA_RE.test(evidenceSourceSha)) {
  throw new Error("V3_S16_EVIDENCE_SOURCE_SHA must be one exact 40-character Git commit SHA");
}
if (!process.env.V3_S16_EVIDENCE_INPUT_ROOT?.trim()) {
  throw new Error("V3_S16_EVIDENCE_INPUT_ROOT is required");
}
if (!existsSync(inputRoot)) {
  throw new Error(`supplemental evidence input root does not exist: ${inputRoot}`);
}

mkdirSync(outputRoot, { recursive: true });
const validated: Array<{ category: string; filename: string }> = [];

for (const surface of surfaces) {
  const sourcePath = join(inputRoot, surface.filename);
  if (!existsSync(sourcePath)) throw new Error(`missing supplemental evidence: ${surface.filename}`);

  let value: unknown;
  try {
    value = JSON.parse(readFileSync(sourcePath, "utf8"));
  } catch {
    throw new Error(`${surface.filename} is not valid JSON`);
  }

  const issues = validateV3S16SurfaceEvidence(value, surface.category, candidateSha);
  if (issues.length) {
    throw new Error(`${surface.filename} failed exact-candidate validation:\n- ${issues.join("\n- ")}`);
  }

  cpSync(sourcePath, join(outputRoot, surface.filename));
  validated.push(surface);
}

writeFileSync(
  join(outputRoot, "supplemental-provenance.json"),
  `${JSON.stringify(
    {
      schemaVersion: 1,
      candidateSha,
      evidenceSourceSha,
      validatedSurfaceFiles: validated,
    },
    null,
    2,
  )}\n`,
  "utf8",
);

process.stdout.write(
  `Validated ${validated.length} S16 supplemental surface artifacts for ${candidateSha} from evidence commit ${evidenceSourceSha}\n`,
);
