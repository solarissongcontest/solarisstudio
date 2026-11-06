import { readFileSync, writeFileSync } from "node:fs";
import {
  buildV3PrIntegrationReport,
  formatV3PrIntegrationReportMarkdown,
  type V3PrIntegrationSnapshot,
} from "../src/lib/v3-pr-integration-state";

type CliOptions = {
  input: string;
  jsonOutput?: string;
  markdownOutput?: string;
  requireExactHeadVerified: boolean;
};

function usage() {
  return [
    "Usage:",
    "  npx tsx scripts/check-v3-pr-integration-state.ts --input <snapshot.json|-> [options]",
    "",
    "Options:",
    "  --json-output <path>              Write machine-readable evidence.",
    "  --markdown-output <path>          Write the human-readable report.",
    "  --require-exact-head-verified     Exit non-zero unless every supplied candidate is exact-head verified.",
    "  --help                            Show this help.",
    "",
    "The caller supplies GitHub/main/check metadata as a snapshot. This evaluator",
    "performs no network or Supabase access and never authorizes a merge or release.",
  ].join("\n");
}

function parseArgs(argv: string[]): CliOptions {
  let input = "";
  let jsonOutput: string | undefined;
  let markdownOutput: string | undefined;
  let requireExactHeadVerified = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help") {
      process.stdout.write(`${usage()}\n`);
      process.exit(0);
    }
    if (arg === "--require-exact-head-verified") {
      requireExactHeadVerified = true;
      continue;
    }

    const value = argv[index + 1];
    if (arg === "--input") {
      if (!value) throw new Error("--input requires a path or -");
      input = value;
      index += 1;
      continue;
    }
    if (arg === "--json-output") {
      if (!value) throw new Error("--json-output requires a path");
      jsonOutput = value;
      index += 1;
      continue;
    }
    if (arg === "--markdown-output") {
      if (!value) throw new Error("--markdown-output requires a path");
      markdownOutput = value;
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!input) throw new Error("--input is required");

  return {
    input,
    jsonOutput,
    markdownOutput,
    requireExactHeadVerified,
  };
}

function readSnapshot(path: string): V3PrIntegrationSnapshot {
  const raw = path === "-" ? readFileSync(0, "utf8") : readFileSync(path, "utf8");
  const parsed = JSON.parse(raw) as unknown;

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Input must be a JSON object");
  }

  const candidate = parsed as Partial<V3PrIntegrationSnapshot>;
  if (
    typeof candidate.repository !== "string" ||
    typeof candidate.mainSha !== "string" ||
    !Array.isArray(candidate.candidates)
  ) {
    throw new Error("Input must contain repository, mainSha and candidates");
  }

  return candidate as V3PrIntegrationSnapshot;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const report = buildV3PrIntegrationReport(readSnapshot(options.input));
  const json = `${JSON.stringify(report, null, 2)}\n`;
  const markdown = formatV3PrIntegrationReportMarkdown(report);

  if (options.jsonOutput) {
    writeFileSync(options.jsonOutput, json, "utf8");
  } else {
    process.stdout.write(json);
  }

  if (options.markdownOutput) {
    writeFileSync(options.markdownOutput, markdown, "utf8");
  }

  if (
    options.requireExactHeadVerified &&
    report.candidates.some((candidate) => candidate.state !== "exact_head_verified")
  ) {
    process.stderr.write(
      "One or more V3 PR candidates do not have current-main, exact-head verified evidence.\n",
    );
    process.exitCode = 1;
  }
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Failed to assess V3 PR integration state: ${message}\n`);
  process.exitCode = 1;
}
