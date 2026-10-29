import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const auth = readFileSync(
  "src/integrations/televoting/private-analysis-auth.server.ts",
  "utf8",
);
const analytics = readFileSync(
  "src/integrations/televoting/analytics.functions.ts",
  "utf8",
);
const intelligence = readFileSync(
  "src/integrations/televoting/intelligence.functions.ts",
  "utf8",
);
const rolePresets = readFileSync("src/lib/role-presets.ts", "utf8");

describe("Organizer V3 private voting analysis authorization", () => {
  it("requires the complete cross-channel privacy bundle from one authoritative context", () => {
    expect(auth).toContain('"televote.ballots.read"');
    expect(auth).toContain('"jury.ballots.read"');
    expect(auth).toContain('"integrity.read"');
    expect(auth).toContain("await getSolarisCapabilitiesServer(null)");
    expect(auth).toContain("context.capabilities.includes(capability)");
    expect(auth).not.toContain("requireMergedTelevotingAdminServer");
  });

  it("matches the existing votingSupervisor least-privilege preset", () => {
    const presetStart = rolePresets.indexOf("votingSupervisor: [");
    const presetEnd = rolePresets.indexOf("],", presetStart);
    const preset = rolePresets.slice(presetStart, presetEnd);

    expect(preset).toContain("'jury.ballots.read'");
    expect(preset).toContain("'televote.ballots.read'");
    expect(preset).toContain("'integrity.read'");
  });

  it("guards Analytics before importing its raw cross-channel engine", () => {
    const guard = analytics.indexOf("await requirePrivateVotingAnalysisServer();");
    const engine = analytics.indexOf(
      '"@/integrations/televoting/analytics.server"',
    );

    expect(guard).toBeGreaterThan(-1);
    expect(engine).toBeGreaterThan(guard);
  });

  it("guards every public Intelligence server-function entry before analysis work", () => {
    for (const exportedName of [
      "getMergedTelevotingIntelligence",
      "getLightweightFriendVotingIntelligence",
      "getFriendVotingCoordination",
    ]) {
      const start = intelligence.indexOf(`export const ${exportedName}`);
      expect(start, exportedName).toBeGreaterThan(-1);
      const next = intelligence.indexOf("export const ", start + 1);
      const block = intelligence.slice(start, next === -1 ? undefined : next);
      const guard = block.indexOf("await requirePrivateAnalysis();");

      expect(guard, exportedName).toBeGreaterThan(-1);
    }
  });

  it("keeps capability resolution ahead of settings, network, and analysis imports", () => {
    const firstHandler = intelligence.indexOf(
      "export const getMergedTelevotingIntelligence",
    );
    const firstGuard = intelligence.indexOf(
      "await requirePrivateAnalysis();",
      firstHandler,
    );
    const resilientCall = intelligence.indexOf(
      "getResilientFriendVotingIntelligence(data)",
      firstHandler,
    );

    expect(firstGuard).toBeGreaterThan(firstHandler);
    expect(resilientCall).toBeGreaterThan(firstGuard);
  });
});
