import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const driver = readFileSync(".github/scripts/v3-full-contest-rehearsal.sh", "utf8");
const finalLeg = readFileSync(".github/scripts/v3-s14-grand-final-leg.sh", "utf8");
const browser = readFileSync("e2e/v3-s14-grand-final-runtime.e2e.ts", "utf8");
const browserConfig = readFileSync("playwright.s14-grand-final.config.ts", "utf8");
const qualification = readFileSync(
  "supabase/migrations/20260822212800_result_rank_is_qualification_source.sql",
  "utf8",
);
const lineup = readFileSync("src/components/admin/ShowLineupWorkspace.tsx", "utf8");

describe("S14 canonical qualifier-to-final preparation", () => {
  it("keeps promotion maintenance access local and authenticates the Organizer normally", () => {
    for (const [config, port] of [[browserConfig, 4177], [readFileSync("playwright.s14-grand-final-results.config.ts", "utf8"), 4178]] as const) {
    const compiled = ts.transpileModule(config, {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    }).outputText;
    const local = {
      VITE_SUPABASE_URL: "http://127.0.0.1:54321",
      SUPABASE_URL: "http://127.0.0.1:54321",
      E2E_SUPABASE_URL: "http://127.0.0.1:54321",
      VITE_CONFIRMATIONS_SUPABASE_URL: "http://127.0.0.1:54321",
      CONFIRMATIONS_SUPABASE_URL: "http://127.0.0.1:54321",
    };
    function load(env: Record<string, string | undefined>) {
      const exports: Record<string, unknown> = {};
      runInNewContext(compiled, {
        exports, URL, process: { env },
        require: () => ({ defineConfig: (config: unknown) => config, devices: { "Desktop Chrome": {} } }),
      });
      return exports.default;
    }
    expect(load(local)).toMatchObject({
      webServer: { url: `http://127.0.0.1:${port}/assets/terraos-maintenance.css`, timeout: 120_000 },
      use: { contextOptions: { reducedMotion: "reduce" }, storageState: { cookies: [{ name: "solaris_e2e_maintenance_bypass", domain: "127.0.0.1" }] } },
    });
    expect(() => load({ ...local, E2E_BASE_URL: "https://hosted.invalid" })).toThrow();
    expect(() => load({ ...local, E2E_SUPABASE_URL: "https://hosted.invalid" })).toThrow();
    expect(() => load({ ...local, SUPABASE_URL: undefined })).toThrow();
    }
    expect(browser).toContain("auth/v1/token?grant_type=password");
    expect(browser).toContain("seedOrganizerBrowserSession");
  });

  it("provisions the pinned browser runner before invoking canonical promotion", () => {
    const manifest = JSON.parse(readFileSync("package.json", "utf8"));
    expect(manifest.devDependencies["@playwright/test"]).toBe("1.55.0");
    const workflow = readFileSync(".github/workflows/v3-s14-full-contest-rehearsal.yml", "utf8");
    expect(workflow).toContain("bunx playwright install --with-deps chromium");
    expect(workflow.indexOf("Install Chromium")).toBeLessThan(workflow.indexOf("Run complete one-state S14"));
    expect(workflow).toContain("test-results/v3-s14-grand-final/");
  });

  it("reconciles missing eligible source identities in the qualification owner", () => {
    const repair = readFileSync("supabase/migrations/20261025113648_reconcile_semifinal_qualification_flags.sql", "utf8");
    expect(repair).toContain("public.refresh_edition_qualifications");
    expect(repair).toContain("current_participant.participation_status, 'confirmed') = 'confirmed'");
    expect(repair).toContain("select 1 from ranked_semis ranked");
    expect(repair).toContain("s.kind = 'semi-final'");
    expect(repair).not.toMatch(/delete from|update private\.v3_result_versions/i);
    const workflow = readFileSync(".github/workflows/v3-s14-full-contest-rehearsal.yml", "utf8");
    expect(workflow).toContain("needs: [static-preflight, focused-preflight, discovery-summary]");
    expect(readFileSync("scripts/v3-release-preflight.ts", "utf8")).toContain("v3-s14-qualification-regression.sh");
  });

  it("requires real result-ranked qualification before creating final appearances", () => {
    expect(finalLeg).toContain("exactly 20 canonical semi-final qualifiers");
    expect(finalLeg).toContain("ten canonical qualifiers from each semi-final");
    expect(finalLeg).toContain("r.final_rank between 1 and 10");
    expect(finalLeg).toContain("p.qualified is true");
    expect(qualification).toContain("final_rank between 1 and cutoff");
    expect(qualification).toContain("set qualified = o.qualified");
  });

  it("promotes qualifiers through the actual Organizer lineup action instead of privileged QA writes", () => {
    expect(lineup).toContain("addQualifiers");
    expect(lineup).toContain("resolveLineupShowSelection");
    expect(lineup).toContain("loading: loadingEdition || loadingShows");
    expect(lineup).toContain("Add semi-final qualifiers");
    expect(finalLeg).toContain("playwright.s14-grand-final.config.ts");
    expect(browser).toContain('/admin/entries/${editionSlug}?show=');
    expect(browser).toContain('getByRole("button", { name: "Add semi-final qualifiers" })');
    expect(browser).toContain("Added 20 qualifiers without creating a running order");
    expect(finalLeg).not.toMatch(/delete\s+from\s+public\.participants\s+where\s+show_id/i);
    expect(finalLeg).not.toMatch(/insert\s+into\s+public\.participants/i);
    expect(finalLeg).toContain("grand final contains a country without canonical qualified truth");
    expect(finalLeg).toContain("grand final contains duplicate qualifier identities");
  });

  it("keeps qualifier promotion browser evidence local-only", () => {
    expect(browser).toContain("S14 grand-final browser refuses non-local Supabase URL");
    expect(browser).toContain("127\\.0\\.0\\.1|localhost");
    expect(browserConfig).toContain("127.0.0.1:4177");
    expect(browserConfig).not.toContain("supabase.co");
  });

  it("uses the same atomic running-order primitives already exercised in Stage 5", () => {
    expect(finalLeg).toContain("admin_set_show_allocations");
    expect(finalLeg).toContain("admin_set_show_running_order");
    expect(finalLeg).toContain("grand-final running order is not contiguous 1..20");
  });

  it("prepares explicit canonical Jury and Televote sources for the final", () => {
    expect(finalLeg).toContain("grand-final Jury roster does not contain all 66 delegations");
    expect(finalLeg).toContain("S14_FINAL_TELEVOTE_ROUND_ID");
    expect(finalLeg).toContain("televoting_round_bindings");
    expect(finalLeg).toContain("grand-final Televote round does not contain exactly 20 finalists");
    expect(finalLeg).toContain("source_mode='show'");
  });

  it("runs only after semifinal Results and Publication establish canonical qualifier truth", () => {
    expect(driver).toContain('source "$SCRIPT_DIR/v3-s14-grand-final-leg.sh"');
    expect(driver).toContain("prepare_s14_grand_final_from_qualifiers");
    expect(driver.indexOf("run_s14_stage_9_publication")).toBeLessThan(
      driver.indexOf("prepare_s14_grand_final_from_qualifiers"),
    );
    expect(finalLeg).toContain("S14_GRAND_FINAL_PREPARED_FROM_CANONICAL_QUALIFIERS");
  });

  it("keeps the grand-final shell syntactically valid", () => {
    expect(() =>
      execFileSync("bash", ["-n", ".github/scripts/v3-s14-grand-final-leg.sh"], { stdio: "pipe" }),
    ).not.toThrow();
  });
});
