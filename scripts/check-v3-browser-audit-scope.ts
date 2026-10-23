import { appendFileSync, readFileSync } from "node:fs";

export type BrowserAuditScope = {
  runHeavy: boolean;
  reason: string;
  changedFiles: string[];
  browserNeutralFiles: string[];
  browserRelevantOrUnknownFiles: string[];
};

const EXACT_BROWSER_NEUTRAL = new Set([
  ".github/workflows/v3-parallel-pr-conflict-guard.yml",
  ".github/workflows/v3-release-candidate-preflight.yml",
  ".github/workflows/v3-production-head-upgrade.yml",
  "scripts/check-v3-jury-share-certification.ts",
  "scripts/check-v3-parallel-pr-conflicts.ts",
  "scripts/check-v3-pr-integration-state.ts",
  "scripts/check-v3-qa-release-truth.ts",
  "scripts/generate-v3-qa-system-phase-readiness.ts",
  "src/lib/v3-jury-share-certification.ts",
  "src/lib/v3-pr-integration-state.ts",
  "src/lib/v3-qa-release-truth.ts",
  "src/lib/v3-qa-system-phase-readiness.ts",
]);

function normalized(path: string): string {
  return path.trim().replace(/^\.\//, "");
}

export function isBrowserNeutralFile(pathValue: string): boolean {
  const path = normalized(pathValue);
  if (!path) return false;

  if (EXACT_BROWSER_NEUTRAL.has(path)) return true;
  if (path.startsWith("docs/")) return true;
  if (/\.(?:md|mdx|txt)$/.test(path)) return true;

  if (path.startsWith("scripts/__tests__/")) return true;
  if (/^src\/lib\/.*\.(?:contract\.)?test\.tsx?$/.test(path)) return true;

  // QA/release evidence code that is not imported by the browser application.
  if (/^src\/lib\/v3-qa-[^/]+\.tsx?$/.test(path)) return true;
  if (/^scripts\/(?:check|generate)-v3-qa-[^/]+\.tsx?$/.test(path)) return true;

  // Repository-side QA evaluators used only by CI/Chat 5.
  if (/^src\/lib\/v3-(?:jury-share-certification|pr-integration-state)\.tsx?$/.test(path)) {
    return true;
  }
  if (/^scripts\/check-v3-(?:jury-share-certification|pr-integration-state|parallel-pr-conflicts)\.tsx?$/.test(path)) {
    return true;
  }

  // V3 CI orchestration is browser-neutral unless the Browser Audit workflow
  // itself changes. Unknown/non-V3 workflows remain conservative.
  if (/^\.github\/workflows\/v3-[^/]+\.ya?ml$/.test(path)) return true;

  // Local-only V3 rehearsal harnesses do not change shipped browser behavior.
  // Browser seeding/runtime scripts intentionally do not match this rule.
  if (/^\.github\/scripts\/v3-[^/]+\.(?:sh|mjs|ts)$/.test(path)) return true;

  return false;
}

export function assessBrowserAuditScope(
  eventName: string,
  changedFileValues: readonly string[],
): BrowserAuditScope {
  const changedFiles = [...new Set(changedFileValues.map(normalized).filter(Boolean))].sort();

  if (eventName !== "pull_request") {
    return {
      runHeavy: true,
      reason: `${eventName || "unknown"} always runs the full Browser Audit`,
      changedFiles,
      browserNeutralFiles: [],
      browserRelevantOrUnknownFiles: changedFiles,
    };
  }

  if (changedFiles.length === 0) {
    return {
      runHeavy: true,
      reason: "changed-file set is empty or unavailable; fail closed to full Browser Audit",
      changedFiles,
      browserNeutralFiles: [],
      browserRelevantOrUnknownFiles: [],
    };
  }

  const browserNeutralFiles = changedFiles.filter(isBrowserNeutralFile);
  const browserRelevantOrUnknownFiles = changedFiles.filter((path) => !isBrowserNeutralFile(path));
  const runHeavy = browserRelevantOrUnknownFiles.length > 0;

  return {
    runHeavy,
    reason: runHeavy
      ? `full Browser Audit required by ${browserRelevantOrUnknownFiles.length} browser-relevant or unknown changed file(s)`
      : `all ${changedFiles.length} changed file(s) are browser-neutral QA/CI/docs evidence`,
    changedFiles,
    browserNeutralFiles,
    browserRelevantOrUnknownFiles,
  };
}

function argValue(name: string): string | null {
  const index = process.argv.indexOf(name);
  if (index < 0 || index + 1 >= process.argv.length) return null;
  return process.argv[index + 1] ?? null;
}

if (import.meta.main) {
  const eventName = argValue("--event") ?? process.env.GITHUB_EVENT_NAME ?? "";
  const filesPath = argValue("--files");
  if (!filesPath) {
    throw new Error("--files <path> is required");
  }

  const files = readFileSync(filesPath, "utf8").split(/\r?\n/);
  const result = assessBrowserAuditScope(eventName, files);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);

  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `run_heavy=${result.runHeavy ? "true" : "false"}\n`, "utf8");
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      `reason=${result.reason.replace(/[\r\n]+/g, " ")}\n`,
      "utf8",
    );
  }
}
