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
    expect(browser).toContain("  workflow_call:");
    expect(workflow).toContain("uses: ./.github/workflows/browser-audit.yml");
    expect(browser).toContain("Browser certification requires successful exact-head S14/S15 artifacts");
    expect(browser).toContain("ref: ${{ inputs.certified_candidate_sha || github.event.pull_request.head.sha || github.sha }}");
  });
  it("defers backend release changes while retaining ordinary UI audits", async () => {
    const marker = "          script: |\n";
    const script = browser.slice(browser.indexOf(marker) + marker.length).split("\n  # Browser CI")[0]
      .split("\n").map((line) => line.replace(/^ {12}/, "")).join("\n");
    const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
    const gate = new AsyncFunction("context", "core", "github", "require", "process", script);
    for (const [filename, expected] of [["supabase/migrations/new.sql", false], ["src/components/public/OrdinaryCard.tsx", true]] as const) {
      let output: unknown;
      await gate(
        { eventName: "pull_request", repo: { owner: "owner", repo: "repo" }, payload: { pull_request: { number: 1629 } } },
        { setOutput: (_name: string, value: unknown) => { output = value; }, info: () => {} },
        { paginate: async () => [{ filename }], rest: { pulls: { listFiles: null } } },
        () => ({ readFileSync: () => workflow }),
        { env: {} },
      );
      expect(output).toBe(expected);
    }

  });

  it("requires matching completed certificates before reusable browser verification", async () => {
    const marker = "          script: |\n";
    const script = browser.slice(browser.indexOf(marker) + marker.length).split("\n  # Browser CI")[0]
      .split("\n").map((line) => line.replace(/^ {12}/, "")).join("\n");
    const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
    const gate = new AsyncFunction("context", "core", "github", "require", "process", script);
    const sha = "a".repeat(40);
    for (const stale of [false, true]) {
      let output: unknown;
      const run = () => gate({}, { setOutput: (_name: string, value: unknown) => { output = value; } }, {}, (name: string) => name === "child_process"
        ? { execFileSync: () => sha }
        : { readFileSync: (path: string) => JSON.stringify(path.includes("s14-")
          ? { candidateSha: stale ? "b".repeat(40) : sha, passed: true, partial: false, runtimeFailure: false, lifecycle: { finalState: "archived" } }
          : { candidateSha: sha, schemaVersion: 4, zeroOrphans: true, findings: [], physicalOwnership: { zeroOwnershipConflicts: true } }) },
        { env: { CERTIFIED_CANDIDATE_SHA: sha } });
      if (stale) await expect(run()).rejects.toThrow("successful exact-head S14/S15 artifacts");
      else { await run(); expect(output).toBe(true); }
    }
  });

});
