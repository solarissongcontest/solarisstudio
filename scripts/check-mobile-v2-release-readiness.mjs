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

console.log(`Mobile V2 release certification passed: ${gates.length} manual gates approved with evidence.`);
