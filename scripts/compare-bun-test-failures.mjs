import fs from "node:fs";

const ANSI_PATTERN = /\u001b\[[0-?]*[ -/]*[@-~]/g;
const FAILURE_DURATION_PATTERN = / \[[0-9.]+(?:ms|s)\]$/;

function readExitCode(path) {
  const value = fs.readFileSync(path, "utf8").trim();
  if (!/^\d+$/.test(value)) {
    throw new Error(`${path}: invalid captured bun test exit code`);
  }
  return Number(value);
}

function parseBunTranscript(path, exitCode) {
  const text = fs
    .readFileSync(path, "utf8")
    .replace(/^\uFEFF/, "")
    .replace(ANSI_PATTERN, "");
  const lines = text.split(/\r?\n/);
  let currentFile = null;
  const files = new Set();
  const failures = [];
  let passCount = null;
  let failCount = null;
  let totalCount = null;
  let fileCount = null;

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const group = line.match(/^::group::(.+):$/);
    if (group) {
      currentFile = group[1];
      files.add(currentFile);
      continue;
    }
    if (line === "::endgroup::") {
      currentFile = null;
      continue;
    }
    if (currentFile && line.startsWith("(fail) ")) {
      const testName = line
        .slice("(fail) ".length)
        .replace(FAILURE_DURATION_PATTERN, "")
        .trim();
      if (!testName) {
        throw new Error(`${path}: encountered a failure without a test name`);
      }
      failures.push(`${currentFile}::${testName}`);
      continue;
    }

    const passMatch = line.match(/^\s*(\d+) pass\s*$/);
    if (passMatch) passCount = Number(passMatch[1]);
    const failMatch = line.match(/^\s*(\d+) fail\s*$/);
    if (failMatch) failCount = Number(failMatch[1]);
    const ranMatch = line.match(/^Ran (\d+) tests across (\d+) files\./);
    if (ranMatch) {
      totalCount = Number(ranMatch[1]);
      fileCount = Number(ranMatch[2]);
    }
  }

  if (passCount === null || failCount === null || totalCount === null || fileCount === null) {
    throw new Error(`${path}: missing complete Bun test summary; refusing to certify a crash or partial run`);
  }
  if (passCount + failCount !== totalCount) {
    throw new Error(`${path}: inconsistent test counts: ${passCount} + ${failCount} != ${totalCount}`);
  }
  if (failures.length !== failCount) {
    throw new Error(`${path}: parsed ${failures.length} grouped failures but Bun reported ${failCount}`);
  }
  if (new Set(failures).size !== failures.length) {
    throw new Error(`${path}: duplicate failure identity detected`);
  }
  if (files.size !== fileCount) {
    throw new Error(`${path}: parsed ${files.size} test files but Bun reported ${fileCount}`);
  }
  if ((failCount === 0 && exitCode !== 0) || (failCount > 0 && exitCode === 0)) {
    throw new Error(`${path}: Bun exit code ${exitCode} disagrees with ${failCount} reported failures`);
  }

  return {
    exitCode,
    passCount,
    failCount,
    totalCount,
    fileCount,
    files: [...files].sort(),
    failures: [...new Set(failures)].sort(),
  };
}

function difference(left, right) {
  const rightSet = new Set(right);
  return left.filter((value) => !rightSet.has(value));
}

const [baseOutput, baseStatus, candidateOutput, candidateStatus, jsonOutput] = process.argv.slice(2);
if (!baseOutput || !baseStatus || !candidateOutput || !candidateStatus) {
  throw new Error(
    "usage: compare-bun-test-failures.mjs <base-output> <base-status> <candidate-output> <candidate-status> [json-output]",
  );
}

const base = parseBunTranscript(baseOutput, readExitCode(baseStatus));
const candidate = parseBunTranscript(candidateOutput, readExitCode(candidateStatus));

if (candidate.totalCount < base.totalCount) {
  throw new Error(`candidate ran fewer tests than base: ${candidate.totalCount} < ${base.totalCount}`);
}
if (candidate.fileCount < base.fileCount) {
  throw new Error(`candidate ran fewer test files than base: ${candidate.fileCount} < ${base.fileCount}`);
}

const missingBaseFiles = difference(base.files, candidate.files);
if (missingBaseFiles.length) {
  throw new Error(`candidate omitted baseline test files:\n${missingBaseFiles.join("\n")}`);
}

const newFailures = difference(candidate.failures, base.failures);
const resolvedFailures = difference(base.failures, candidate.failures);
const sharedFailures = candidate.failures.filter((failure) => base.failures.includes(failure));

const report = {
  schemaVersion: 1,
  base,
  candidate,
  sharedFailures,
  newFailures,
  resolvedFailures,
};
const serialized = `${JSON.stringify(report, null, 2)}\n`;
process.stdout.write(serialized);
if (jsonOutput) fs.writeFileSync(jsonOutput, serialized);

if (process.env.GITHUB_STEP_SUMMARY) {
  const lines = [
    "## Unit baseline-delta certification",
    "",
    `- Base: ${base.passCount} pass / ${base.failCount} fail / ${base.totalCount} total across ${base.fileCount} files`,
    `- Candidate: ${candidate.passCount} pass / ${candidate.failCount} fail / ${candidate.totalCount} total across ${candidate.fileCount} files`,
    `- Shared inherited failures: ${sharedFailures.length}`,
    `- New candidate failures: ${newFailures.length}`,
    `- Resolved inherited failures: ${resolvedFailures.length}`,
    "",
    "### New candidate failures",
    ...(newFailures.length ? newFailures.map((failure) => `- ${failure}`) : ["- None"]),
    "",
    "### Resolved inherited failures",
    ...(resolvedFailures.length ? resolvedFailures.map((failure) => `- ${failure}`) : ["- None"]),
    "",
    "### Shared inherited failures",
    ...(sharedFailures.length ? sharedFailures.map((failure) => `- ${failure}`) : ["- None"]),
    "",
  ];
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${lines.join("\n")}\n`);
}

if (newFailures.length) {
  process.stderr.write(`New candidate failures detected:\n${newFailures.join("\n")}\n`);
  process.exit(1);
}
