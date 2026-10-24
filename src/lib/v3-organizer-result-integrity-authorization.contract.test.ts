import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const auth = readFileSync(
  "src/integrations/televoting/result-integrity-auth.server.ts",
  "utf8",
);
const functions = readFileSync(
  "src/integrations/televoting/result-integrity.functions.ts",
  "utf8",
);
const server = readFileSync(
  "src/integrations/televoting/result-integrity.server.ts",
  "utf8",
);
const rolePresets = readFileSync("src/lib/role-presets.ts", "utf8");

describe("Organizer V3 Result Integrity authorization", () => {
  it("requires preview, integrity, and private ballot access before reads", () => {
    expect(auth).toContain('"results.preview"');
    expect(auth).toContain('"integrity.read"');
    expect(auth).toContain('"televote.ballots.read"');
    expect(auth).toContain("RESULT_INTEGRITY_READ_CAPABILITIES");
  });

  it("requires integrity.manage in addition to the complete read bundle for recompute", () => {
    expect(auth).toContain("...RESULT_INTEGRITY_READ_CAPABILITIES");
    expect(auth).toContain('"integrity.manage"');
    expect(auth).toContain("RESULT_INTEGRITY_RECOMPUTE_CAPABILITIES");
  });

  it("resolves one authoritative capability context per endpoint guard", () => {
    expect(auth).toContain("await getSolarisCapabilitiesServer(null)");
    expect(auth).toContain("context.capabilities.includes(capability)");
    expect(auth).not.toContain("requireMergedTelevotingAdminServer");
  });

  it("guards each endpoint before importing the raw implementation", () => {
    const readGuard = functions.indexOf("await requireResultIntegrityReadServer();");
    const readEngine = functions.indexOf("getResultIntegrityServer");
    const recomputeGuard = functions.indexOf(
      "await requireResultIntegrityRecomputeServer();",
    );
    const recomputeEngine = functions.indexOf("recomputeResultIntegrityServer");

    expect(readGuard).toBeGreaterThan(-1);
    expect(readEngine).toBeGreaterThan(readGuard);
    expect(recomputeGuard).toBeGreaterThan(-1);
    expect(recomputeEngine).toBeGreaterThan(recomputeGuard);
  });

  it("protects exactly the data classes the raw server exposes", () => {
    expect(server).toContain('.from("round_results")');
    expect(server).toContain('.from("vote_preflight_checks")');
    expect(server).toContain("username_normalized");
    expect(server).toContain("admin_evidence");
    expect(server).toContain('.from("round_influence_results")');
  });

  it("matches the existing votingSupervisor operator profile", () => {
    const start = rolePresets.indexOf("votingSupervisor: [");
    const end = rolePresets.indexOf("],", start);
    const preset = rolePresets.slice(start, end);

    expect(preset).toContain("'televote.ballots.read'");
    expect(preset).toContain("'results.preview'");
    expect(preset).toContain("'integrity.read'");
    expect(preset).toContain("'integrity.manage'");
  });
});
