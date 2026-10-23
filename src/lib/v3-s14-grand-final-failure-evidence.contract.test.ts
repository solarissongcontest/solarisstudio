import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const driver = readFileSync(".github/scripts/v3-full-contest-rehearsal.sh", "utf8");
const grandFinalLeg = readFileSync(".github/scripts/v3-s14-grand-final-leg.sh", "utf8");
const grandFinalResults = readFileSync(".github/scripts/v3-s14-grand-final-results.sh", "utf8");
const browserRuntime = readFileSync(".github/scripts/v3-s14-browser-runtime.sh", "utf8");
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

  it("keeps the local-only maintenance bypass scoped in both Playwright configs", () => {
    for (const browserConfig of [grandFinalBrowserConfig, grandFinalResultsBrowserConfig]) {
      expect(browserConfig).toContain(
        '!process.env.E2E_BASE_URL || process.env.SOLARIS_E2E_BYPASS_MAINTENANCE === "1"',
      );
      expect(browserConfig).toContain('name: "solaris_e2e_maintenance_bypass"');
      expect(browserConfig).toContain('domain: "127.0.0.1"');
      expect(browserConfig).toContain("storageState: appAuditStorageState");
    }
    expect(server).toContain(
      'const localHost = url.hostname === "127.0.0.1" || url.hostname === "localhost";',
    );
    expect(server).toContain("if (!localHost) return false;");
  });

  it("owns Vite outside Playwright and separates bootstrap, HTTP readiness, and app execution evidence", () => {
    expect(grandFinalLeg).toContain('source "$S14_BROWSER_RUNTIME_DIR/v3-s14-browser-runtime.sh"');
    expect(grandFinalResults).toContain(
      'source "$S14_BROWSER_RUNTIME_DIR/v3-s14-browser-runtime.sh"',
    );
    expect(grandFinalLeg).toContain("run_s14_browser_test");
    expect(grandFinalResults).toContain("run_s14_browser_test");

    expect(browserRuntime).toContain('CURRENT_STAGE="${bootstrap_stage}:vite-bootstrap"');
    expect(browserRuntime).toContain('CURRENT_STAGE="${bootstrap_stage}:http-readiness"');
    expect(browserRuntime).toContain('CURRENT_STAGE="${bootstrap_stage}:playwright-bootstrap"');
    expect(browserRuntime).toContain('CURRENT_STAGE="$run_stage"');
    expect(browserRuntime).toContain(
      'bun run dev --host 127.0.0.1 --port "$port" --strictPort',
    );
    expect(browserRuntime).toContain('"$base_url/favicon.ico"');
    expect(browserRuntime).toContain("Cookie: solaris_e2e_maintenance_bypass=1");
    expect(browserRuntime).toContain('E2E_BASE_URL="$base_url"');
    expect(browserRuntime).toContain('tail -300 "$vite_log"');
    expect(browserRuntime).toContain('ss -ltnp 2>/dev/null | grep ":$port"');

    expect(grandFinalLeg).toContain("grand-final-browser-bootstrap");
    expect(grandFinalLeg).toContain("grand-final-qualifier-bridge");
    expect(grandFinalResults).toContain('"grand-final-results:browser-bootstrap"');
    expect(grandFinalResults).toContain("grand-final-results");
    expect(grandFinalLeg).not.toContain(
      "bunx playwright test --config=playwright.s14-grand-final.config.ts",
    );
    expect(grandFinalResults).not.toContain(
      "bunx playwright test --config=playwright.s14-grand-final-results.config.ts",
    );
  });

  it("does not preserve the resolved #651 synthetic blocker", () => {
    expect(driver).not.toContain("#651 canonical Televote publication/readiness mismatch");
    expect(driver).toContain('source "$SCRIPT_DIR/v3-s14-grand-final-results.sh"');
  });

  it("keeps the browser runtime and Grand Final shell adapters syntactically valid", () => {
    for (const path of [
      ".github/scripts/v3-s14-browser-runtime.sh",
      ".github/scripts/v3-s14-grand-final-leg.sh",
      ".github/scripts/v3-s14-grand-final-results.sh",
      ".github/scripts/v3-full-contest-rehearsal.sh",
    ]) {
      expect(() => execFileSync("bash", ["-n", path], { stdio: "pipe" })).not.toThrow();
    }
  });
});
