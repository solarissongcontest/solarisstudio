import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const matrix = readFileSync("docs/mobile-v2/completion-matrix.yml", "utf8");
const certification = readFileSync("docs/mobile-v2/release-certification.yml", "utf8");

const partialReleaseBlockers = matrix
  .split("\n")
  .filter((line) => line.includes("release_blocking: true") && line.includes("status: partial"))
  .map((line) => line.trim());

if (partialReleaseBlockers.length) {
  console.error("Mobile V2 cannot be certified while release-blocking implementation is partial:");
  for (const row of partialReleaseBlockers) console.error(`  - ${row}`);
  process.exit(1);
}

const gates = [...certification.matchAll(
  /- id: ([^\n]+)\n\s+approved: (true|false)\n\s+evidence: "([^"]*)"/g,
)].map((match) => ({
  id: match[1].trim(),
  approved: match[2] === "true",
  evidence: match[3].trim(),
}));

if (!gates.length) {
  console.error("No Mobile V2 manual certification gates were found.");
  process.exit(1);
}

const unresolved = gates.filter((gate) => !gate.approved || !gate.evidence);
if (unresolved.length) {
  console.error("Mobile V2 manual certification is still pending:");
  for (const gate of unresolved) {
    console.error(
      `  - ${gate.id}: ${gate.approved ? "approved but missing evidence" : "not approved"}`,
    );
  }
  process.exit(1);
}

const sourceMatch = certification.match(/^source_commit:\s*"([0-9a-f]{40})"\s*$/m);
if (!sourceMatch) {
  console.error(
    "Mobile V2 certification requires source_commit to be the exact 40-character release candidate SHA.",
  );
  process.exit(1);
}

const sourceCommit = sourceMatch[1];

function git(args) {
  return execFileSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

let headCommit;
try {
  headCommit = git(["rev-parse", "HEAD"]);
  git(["cat-file", "-e", `${sourceCommit}^{commit}`]);
  git(["merge-base", "--is-ancestor", sourceCommit, headCommit]);
} catch {
  console.error(
    `Mobile V2 source_commit ${sourceCommit} is not an ancestor of the checked-out certification commit.`,
  );
  process.exit(1);
}

const changedSinceSource = git(["diff", "--name-only", `${sourceCommit}..HEAD`])
  .split("\n")
  .map((value) => value.trim())
  .filter(Boolean);

const allowedEvidenceFiles = new Set([
  "docs/mobile-v2/release-certification.yml",
]);

const implementationChanges = changedSinceSource.filter(
  (path) => !allowedEvidenceFiles.has(path),
);

if (implementationChanges.length) {
  console.error(
    "Mobile V2 certification evidence is stale because implementation changed after source_commit:",
  );
  for (const path of implementationChanges) console.error(`  - ${path}`);
  console.error(
    "Choose the latest implementation commit as source_commit and repeat visual/device/production evidence.",
  );
  process.exit(1);
}

console.log(
  `Mobile V2 release certification passed: ${gates.length} manual gates approved with evidence for source ${sourceCommit}.`,
);
