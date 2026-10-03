import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const matrix = readFileSync(
  "docs/organisation-os-v5/completion-matrix.yml",
  "utf8",
);
const certification = readFileSync(
  "docs/organisation-os-v5/release-certification.yml",
  "utf8",
);

const requirementLines = matrix
  .split("\n")
  .filter((line) => /^  - \{ id: \d+, key: /.test(line));

if (requirementLines.length !== 39) {
  console.error(
    `Organisation OS V5 completion matrix must contain exactly 39 §240 requirements; found ${requirementLines.length}.`,
  );
  process.exit(1);
}

const requirementIds = requirementLines.map((line) => {
  const match = line.match(/^  - \{ id: (\d+),/);
  return match ? Number(match[1]) : NaN;
});
if (
  requirementIds.some((id, index) => id !== index + 1)
) {
  console.error("Organisation OS V5 completion requirement ids must be contiguous 1..39.");
  process.exit(1);
}

const partialReleaseBlockers = requirementLines.filter(
  (line) =>
    line.includes("release_blocking: true") &&
    line.includes("status: partial"),
);
if (partialReleaseBlockers.length) {
  console.error(
    "Organisation OS V5 cannot be certified while release-blocking implementation proof is partial:",
  );
  for (const row of partialReleaseBlockers) console.error(`  - ${row.trim()}`);
  process.exit(1);
}

function sectionListCount(sectionName, listName, nextSectionName) {
  const start = matrix.indexOf(`${sectionName}:\n`);
  if (start < 0) return -1;
  const end = nextSectionName
    ? matrix.indexOf(`\n${nextSectionName}:\n`, start)
    : matrix.length;
  const section = matrix.slice(start, end < 0 ? matrix.length : end);
  const listStart = section.indexOf(`  ${listName}:\n`);
  if (listStart < 0) return -1;
  return section
    .slice(listStart + `  ${listName}:\n`.length)
    .split("\n")
    .filter((line) => /^    - [a-z0-9-]+$/.test(line))
    .length;
}

const phoneSteps = sectionListCount("phone_exam", "steps", "mandatory_failures");
const failureCases = sectionListCount("mandatory_failures", "cases", null);
if (phoneSteps !== 42) {
  console.error(
    `Organisation OS V5 phone exam must contain exactly 42 source-defined steps; found ${phoneSteps}.`,
  );
  process.exit(1);
}
if (failureCases !== 17) {
  console.error(
    `Organisation OS V5 failure injection must contain exactly 17 source-defined cases; found ${failureCases}.`,
  );
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
  console.error("No Organisation OS V5 manual certification gates were found.");
  process.exit(1);
}

const unresolved = gates.filter((gate) => !gate.approved || !gate.evidence);
if (unresolved.length) {
  console.error("Organisation OS V5 manual certification is still pending:");
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
    "Organisation OS V5 certification requires source_commit to be the exact 40-character release candidate SHA.",
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
    `Organisation OS V5 source_commit ${sourceCommit} is not an ancestor of the checked-out certification commit.`,
  );
  process.exit(1);
}

const changedSinceSource = git(["diff", "--name-only", `${sourceCommit}..HEAD`])
  .split("\n")
  .map((value) => value.trim())
  .filter(Boolean);

const allowedEvidenceFiles = new Set([
  "docs/organisation-os-v5/release-certification.yml",
]);

const implementationChanges = changedSinceSource.filter(
  (path) => !allowedEvidenceFiles.has(path),
);

if (implementationChanges.length) {
  console.error(
    "Organisation OS V5 certification evidence is stale because implementation changed after source_commit:",
  );
  for (const path of implementationChanges) console.error(`  - ${path}`);
  console.error(
    "Choose the latest implementation commit as source_commit and repeat the affected Organizer V5 evidence.",
  );
  process.exit(1);
}

console.log(
  `Organisation OS V5 release certification passed: ${gates.length} manual gates approved with evidence for source ${sourceCommit}.`,
);
