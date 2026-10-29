import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { combineReports, assertLocalTargets, localSupabaseEnvironment, runSweep, staticEnvironment, type Check } from "../../scripts/lib/v3-release-preflight";

describe("release cascade discovery", () => {
  it("collects all independent failures and blocks only dependent work", () => {
    const dir = mkdtempSync(join(tmpdir(), "release-preflight-"));
    const calls: string[] = [];
    const checks: Check[] = [
      { id: "first", group: "static", command: ["first"], json: true },
      { id: "dependent", group: "static", command: ["dependent"], dependencies: ["first"] },
      { id: "independent", group: "static", command: ["independent"] },
      { id: "last", group: "static", command: ["last"] },
    ];
    try {
      const result = runSweep(checks, dir, (check) => {
        calls.push(check.id);
        return { status: check.id === "last" ? 0 : 1, stdout: check.id === "first" ? '{"findings":["ORPHAN one","ORPHAN two"]}' : "", stderr: "" };
      });
      expect(calls).toEqual(["first", "independent", "last"]);
      expect(result.first.findings).toEqual(["ORPHAN one", "ORPHAN two"]);
      expect(result.dependent.status).toBe("blocked");
      expect(result.independent.status).toBe("fail");
      expect(result.last.status).toBe("pass");
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it("preserves structured authority findings as report evidence and mergeable strings", () => {
    const dir = mkdtempSync(join(tmpdir(), "release-authority-"));
    const finding = { domain: "media-upload", kind: "direct_application_writer" };
    try {
      const outcomes = runSweep([{ id: "s16Authority", group: "database", command: ["check"], json: true }], dir,
        () => ({ status: 1, stdout: JSON.stringify({ findings: [finding] }), stderr: "" }));
      expect(outcomes.s16Authority.findings).toEqual([`STRUCTURED_FINDING ${JSON.stringify(finding)}`]);
      expect(outcomes.s16Authority.report).toEqual({ findings: [finding] });
      expect(() => combineReports([{ candidateSha: "a".repeat(40), sourceClean: true, group: "database", passed: false, checks: outcomes }], "a".repeat(40))).not.toThrow();
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it.each(["127.0.0.1", "localhost", "[::1]"])("accepts explicit loopback targets %s", (host) => {
    expect(() => assertLocalTargets(`http://${host}:54321`, `postgresql://${host}:54322/postgres`)).not.toThrow();
  });
  it.each([
    ["https://hosted.supabase.co", "postgresql://localhost/postgres"],
    ["http://localhost:54321", "postgresql://hosted.invalid/postgres"],
    [undefined, "postgresql://localhost/postgres"],
    ["http://localhost:54321", undefined],
  ])("rejects a missing/hosted target before any fixture (%s)", (api, db) => {
    expect(() => assertLocalTargets(api, db)).toThrow();
  });
  it("validates CLI status without evaluating shell output", () => {
    expect(() => localSupabaseEnvironment(() => ({ status: 0, stdout: 'API_URL="https://hosted.invalid"\nDB_URL="postgresql://localhost/postgres"', stderr: "" }))).toThrow();
    expect(() => staticEnvironment({ SUPABASE_URL: "https://hosted.invalid" })).toThrow();
    expect(staticEnvironment({}).SUPABASE_URL).toBe("http://127.0.0.1:54321");
  });
  it("rejects incomplete, conflicting or older discovery instead of certifying it", () => {
    const sha = "a".repeat(40);
    const pass = { status: "pass" as const, exitCode: 0, findings: [] };
    const a = { candidateSha: sha, sourceClean: true, group: "static", passed: true, checks: { static: pass } };
    const b = { candidateSha: sha, sourceClean: true, group: "database", passed: true, checks: { database: pass } };
    expect(combineReports([a, b], sha).passed).toBe(true);
    expect(combineReports([{ ...a, sourceClean: false }, b], sha).passed).toBe(false);
    expect(combineReports([a], sha).discoveryFindings).toContain("MISSING_DISCOVERY_GROUP database");
    expect(combineReports([a, { ...b, candidateSha: "b".repeat(40) }], sha).passed).toBe(false);
    expect(combineReports([a, { ...b, passed: false }], sha).discoveryFindings).toContain("GROUP_STATUS_CONFLICT database");
  });

});
