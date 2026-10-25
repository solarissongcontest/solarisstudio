import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const workflow = readFileSync(".github/workflows/v3-s14-full-contest-rehearsal.yml", "utf8");
const browser = readFileSync(".github/workflows/browser-audit.yml", "utf8");
const qualification = readFileSync(".github/tests/v3-s14-qualification.sql", "utf8");
describe("release cascade certification boundaries", () => {
  it("runs independent discovery together and requires all groups before one-state certification", () => {
    const staticJob = workflow.slice(workflow.indexOf("  static-preflight:"), workflow.indexOf("  focused-preflight:"));
    const databaseJob = workflow.slice(workflow.indexOf("  focused-preflight:"), workflow.indexOf("  discovery-summary:"));
    expect(staticJob).not.toContain("needs:");
    expect(databaseJob).not.toContain("needs:");
    expect(workflow).toContain("needs: [static-preflight, focused-preflight, discovery-summary]");
    expect(workflow).toContain("Merge all observable failures without losing failed groups");
    expect(workflow).toContain("needs: [stateful-rehearsal]");
    expect(workflow.indexOf("  s15-certification:")).toBeGreaterThan(workflow.indexOf("Run complete one-state S14"));
  });
  it("uses real Auth and canonical operations in the published Results handoff", () => {
    const runner = readFileSync("scripts/v3-s14-publication-handoff-regression.ts", "utf8");
    expect(runner).toContain("/auth/v1/token?grant_type=password");
    expect(runner.indexOf("localSupabaseEnvironment()")).toBeLessThan(runner.indexOf("await request("));
    for (const operation of ["studio2_execute_result_operation", "studio2_apply_show_publication_change", "studio2_transition_edition_v3", "studio2_reconcile_operation", "studio2_process_edition_domain_event"]) expect(qualification).toContain(operation);
    expect(qualification).toContain("set local role authenticated;");
    expect(qualification).not.toMatch(/update public\.(studio2_result_operations|studio2_show_publication_controls|studio2_edition_runtime)/i);
    expect(qualification.trim().endsWith("rollback;")).toBe(true);
  });
  it("defers browser certification and checks out the exact certified source", () => {
    expect(browser).toContain("needs: [release-gate]");
    expect(browser).toContain("Release changes require successful exact-head cascade/S14/S15 before browsers.");
    expect(browser).toContain("workflows: [\"V3 S14 stateful full-contest rehearsal\"]");
    expect(browser).toContain("context.payload.workflow_run.conclusion === 'success'");
    expect(browser).toContain("ref: ${{ github.event.pull_request.head.sha || github.event.workflow_run.head_sha || github.sha }}");
  });
  it("defers backend release changes while retaining ordinary UI audits", async () => {
    const marker = "          script: |\n";
    const script = browser.slice(browser.indexOf(marker) + marker.length).split("\n  # Browser CI")[0]
      .split("\n").map((line) => line.replace(/^ {12}/, "")).join("\n");
    const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
    const gate = new AsyncFunction("context", "core", "github", "require", script);
    for (const [filename, expected] of [["supabase/migrations/new.sql", false], ["src/components/public/OrdinaryCard.tsx", true]] as const) {
      let output: unknown;
      await gate(
        { eventName: "pull_request", repo: { owner: "owner", repo: "repo" }, payload: { pull_request: { number: 1629 } } },
        { setOutput: (_name: string, value: unknown) => { output = value; }, info: () => {} },
        { paginate: async () => [{ filename }], rest: { pulls: { listFiles: null } } },
        () => ({ readFileSync: () => workflow }),
      );
      expect(output).toBe(expected);
    }
    let output: unknown;
    await gate({ eventName: "workflow_run", repo: { owner: "owner", repo: "repo" }, payload: { workflow_run: { conclusion: "failure", head_repository: { full_name: "owner/repo" } } } },
      { setOutput: (_name: string, value: unknown) => { output = value; } }, {}, () => ({}));
    expect(output).toBe(false);
  });

});
