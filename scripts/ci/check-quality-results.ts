import {
  evaluateQualityResults,
  type QualityResultInput,
} from "./quality-result-policy.ts";

function workflowEscape(value: string) {
  return value
    .replaceAll("%", "%25")
    .replaceAll("\r", "%0D")
    .replaceAll("\n", "%0A");
}

function annotation(level: "error" | "notice", title: string, message: string) {
  if (!process.env.GITHUB_ACTIONS) return;
  console.log(
    `::${level} title=${workflowEscape(title)}::${workflowEscape(message)}`,
  );
}

const serialized = process.env.QUALITY_RESULTS_JSON;
if (!serialized?.trim()) {
  console.error("Quality aggregation infrastructure failure: QUALITY_RESULTS_JSON is missing.");
  annotation(
    "error",
    "Quality aggregation infrastructure failure",
    "QUALITY_RESULTS_JSON is missing",
  );
  process.exit(1);
}

let inputs: QualityResultInput[];
try {
  const parsed: unknown = JSON.parse(serialized);
  if (!Array.isArray(parsed)) {
    throw new Error("QUALITY_RESULTS_JSON must be a JSON array");
  }
  inputs = parsed as QualityResultInput[];
} catch (error) {
  const detail = error instanceof Error ? error.message : String(error);
  console.error(`Quality aggregation infrastructure failure: ${detail}`);
  annotation("error", "Quality aggregation infrastructure failure", detail);
  process.exit(1);
}

if (inputs.length === 0) {
  console.error("Quality aggregation infrastructure failure: result vector is empty.");
  annotation(
    "error",
    "Quality aggregation infrastructure failure",
    "result vector is empty",
  );
  process.exit(1);
}

const evaluation = evaluateQualityResults(inputs);

console.log("Quality collected status vector");
console.log(
  "check\trequired\traw outcome\tconclusion\tcollected\tblocking\treason",
);
for (const result of evaluation.results) {
  console.log(
    [
      result.name,
      result.required ? "yes" : "no",
      result.rawOutcome,
      result.rawConclusion,
      result.collectedStatus,
      result.blocking ? "yes" : "no",
      result.reason,
    ].join("\t"),
  );
}

if (!evaluation.ok) {
  const summary = evaluation.blocking
    .map(
      (result) =>
        `${result.name}: ${result.collectedStatus} (${result.rawOutcome}/${result.rawConclusion})`,
    )
    .join("; ");
  console.error(`Quality aggregation failed: ${summary}`);
  annotation("error", "Quality aggregation failed", summary);
  process.exit(1);
}

annotation(
  "notice",
  "Quality aggregation passed",
  `${evaluation.results.length} collected result(s) satisfied policy`,
);
console.log("All collected Quality results satisfy policy.");
