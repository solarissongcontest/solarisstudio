import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const driver = readFileSync(".github/scripts/v3-full-contest-rehearsal.sh", "utf8");
const grandFinalLeg = readFileSync(".github/scripts/v3-s14-grand-final-leg.sh", "utf8");
const workflow = readFileSync(".github/workflows/v3-s14-full-contest-rehearsal.yml", "utf8");
const grandFinalBrowserConfig = readFileSync("playwright.s14-grand-final.config.ts", "utf8");
const grandFinalResultsBrowserConfig = readFileSync(
  "playwright.s14-grand-final-results.config.ts",
  "utf8",
);
const server = readFileSync("src/server.ts", "utf8");
const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
  devDependencies?: Record<string, string>;
};

describe("S14 Grand Final failure evidence", () => {
  it("tracks contest extensions as first-class runtime failure stages", () => {
    expect(driver).toContain("COMPLETED_CONTEST_EXTENSIONS=()");
    expect(driver).toContain('CURRENT_STAGE="$extension_id"');
    expect(driver).toContain('COMPLETED_CONTEST_EXTENSIONS+=("$extension_id")');
    expect(driver).toContain('"${COMPLETED_CONTEST_EXTENSIONS[*]}"');
    expect(driver).toContain('"completedContestExtensions": completed_extensions');
  });

  it("runs qualifier preparation, final voting, and canonical results through the tracked extension wrapper", () => {
    expect(driver).toContain(
      "run_contest_extension grand-final-qualifier-bridge prepare_s14_grand_final_from_qualifiers",
    );
    expect(driver).toContain(
      "run_contest_extension grand-final-voting run_s14_grand_final_voting",
    );
    expect(driver).toContain(
      "run_contest_extension grand-final-results run_s14_grand_final_results",
    );
  });

  it("fails closed before successful evidence unless every tracked stage and contest extension completed", () => {
    expect(driver).toContain(
      '[[ "${#COMPLETED_STAGES[@]}" == "${#ALL_STAGES[@]}" ]] || fail "release-grade S14 evidence cannot be written with missing lifecycle stages"',
    );
    expect(driver).toContain(
      '[[ "${#COMPLETED_CONTEST_EXTENSIONS[@]}" == "${#ALL_CONTEST_EXTENSIONS[@]}" ]] || fail "release-grade S14 evidence cannot be written with missing contest extensions"',
    );
    expect(driver).toContain(
      '[[ "$(db_scalar "select state from public.studio2_edition_runtime where edition_id=\'$EDITION_ID\'::uuid;")" == "archived" ]] || fail "release-grade S14 evidence requires canonical archived state"',
    );
    expect(driver).toContain('"stage-10-archive",');
    expect(driver).toContain('"grand-final-publication",');
    expect(driver).toContain('"pendingStages": []');
    expect(driver).toContain('"pendingContestExtensions": []');
  });

  it("uses the same canonical Grand Final extension vocabulary for success and failure evidence", () => {
    for (const extension of [
      "grand-final-qualifier-bridge",
      "grand-final-voting",
      "grand-final-results",
      "grand-final-publication",
    ]) {
      expect(driver).toContain(extension);
      expect(workflow).toContain(extension);
    }
    expect(driver).not.toContain('"grand-final-jury"');
    expect(driver).not.toContain('"grand-final-televote"');
    expect(workflow).not.toContain('"grand-final-jury"');
    expect(workflow).not.toContain('"grand-final-televote"');
  });

  it("pins and prepares the Playwright runtime before starting the expensive local-Supabase rehearsal", () => {
    expect(packageJson.devDependencies?.["@playwright/test"]).toBe("1.55.0");
    expect(workflow).toContain('      - "package.json"');
    expect(workflow).toContain('      - "bun.lock"');
    expect(workflow).toContain('      - "playwright.s14-grand-final.config.ts"');
    expect(workflow).toContain('      - "playwright.s14-grand-final-results.config.ts"');
    expect(workflow).toContain('      - "e2e/v3-s14-grand-final-runtime.e2e.ts"');
    expect(workflow).toContain('      - "e2e/v3-s14-grand-final-results-runtime.e2e.ts"');
    expect(workflow).toContain('bun -e \'import("@playwright/test")');
    expect(workflow).toContain("bunx playwright install --with-deps chromium");
    expect(workflow).toContain("Chromium executable missing:");
    expect(workflow.indexOf("Preflight S14 Playwright package")).toBeLessThan(
      workflow.indexOf("Start isolated local Supabase"),
    );
    expect(workflow.indexOf("Install S14 Chromium runtime")).toBeLessThan(
      workflow.indexOf("Start isolated local Supabase"),
    );
    expect(workflow.indexOf("Verify S14 Chromium runtime")).toBeLessThan(
      workflow.indexOf("Start isolated local Supabase"),
    );
  });

  it("keeps S14 browser readiness independent of maintenance authorization on both browser legs", () => {
    for (const browserConfig of [grandFinalBrowserConfig, grandFinalResultsBrowserConfig]) {
      expect(browserConfig).toContain(
        '!process.env.E2E_BASE_URL || process.env.SOLARIS_E2E_BYPASS_MAINTENANCE === "1"',
      );
      expect(browserConfig).toContain('name: "solaris_e2e_maintenance_bypass"');
      expect(browserConfig).toContain('domain: "127.0.0.1"');
      expect(browserConfig).toContain("storageState: appAuditStorageState");
      expect(browserConfig).toContain("/favicon.ico");
    }

    expect(grandFinalBrowserConfig).toContain(
      'url: "http://127.0.0.1:4177/favicon.ico"',
    );
    expect(grandFinalResultsBrowserConfig).toContain(
      'url: "http://127.0.0.1:4178/favicon.ico"',
    );
    expect(server).toContain(
      'const localHost = url.hostname === "127.0.0.1" || url.hostname === "localhost";',
    );
    expect(server).toContain("if (!localHost) return false;");
    expect(server).toContain('"/favicon.ico"');
  });

  it("classifies browser bootstrap separately and enters the qualifier bridge only after Playwright initializes", () => {
    expect(driver).toContain('"grand-final-browser-bootstrap"');
    expect(grandFinalLeg).toContain('CURRENT_STAGE="grand-final-browser-bootstrap"');
    expect(grandFinalLeg).toContain(
      "bunx playwright test --list --config=playwright.s14-grand-final.config.ts",
    );
    expect(grandFinalLeg).toContain('CURRENT_STAGE="grand-final-qualifier-bridge"');

    const bootstrapIndex = grandFinalLeg.indexOf('CURRENT_STAGE="grand-final-browser-bootstrap"');
    const configPreflightIndex = grandFinalLeg.indexOf(
      "bunx playwright test --list --config=playwright.s14-grand-final.config.ts",
    );
    const bridgeIndex = grandFinalLeg.indexOf('CURRENT_STAGE="grand-final-qualifier-bridge"');
    const browserRunIndex = grandFinalLeg.indexOf(
      "bunx playwright test --config=playwright.s14-grand-final.config.ts",
    );

    expect(bootstrapIndex).toBeGreaterThanOrEqual(0);
    expect(configPreflightIndex).toBeGreaterThan(bootstrapIndex);
    expect(bridgeIndex).toBeGreaterThan(configPreflightIndex);
    expect(browserRunIndex).toBeGreaterThan(bridgeIndex);
  });

  it("does not preserve the resolved #651 synthetic blocker", () => {
    expect(driver).not.toContain("#651 canonical Televote publication/readiness mismatch");
    expect(driver).toContain('source "$SCRIPT_DIR/v3-s14-grand-final-results.sh"');
  });

  it("keeps the merged stateful driver syntactically valid", () => {
    expect(() =>
      execFileSync("bash", ["-n", ".github/scripts/v3-full-contest-rehearsal.sh"], {
        stdio: "pipe",
      }),
    ).not.toThrow();
  });
});
