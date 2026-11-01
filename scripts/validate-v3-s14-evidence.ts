import { readFileSync } from "node:fs";
import { validateV3S14Evidence } from "./v3-s14-evidence-validator";

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const file = arg("--file");
const candidateSha = arg("--candidate-sha");
const requireComplete = process.argv.includes("--require-complete");

if (!file || !candidateSha) {
  throw new Error(
    "Usage: bun run scripts/validate-v3-s14-evidence.ts --file <path> --candidate-sha <sha> [--require-complete]",
  );
}

const evidence = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
validateV3S14Evidence({ candidateSha, evidence, requireComplete });
console.log(
  `S14 ${requireComplete ? "complete" : "failure"} evidence valid for exact candidate ${candidateSha.toLowerCase()}`,
);
