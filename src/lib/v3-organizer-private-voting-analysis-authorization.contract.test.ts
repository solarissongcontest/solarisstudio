import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SOLARIS_ROLE_PRESETS } from "./role-presets";

const read = (file: string) => readFileSync(file, "utf8");
const auth = read("src/integrations/televoting/private-analysis-auth.server.ts");
const analytics = read("src/integrations/televoting/analytics.functions.ts");
const intelligence = read("src/integrations/televoting/intelligence.functions.ts");

function handlerBody(source: string, name: string) {
  const start = source.indexOf(`export const ${name}`);
  if (start < 0) throw new Error(`Missing server function ${name}`);
  const next = source.indexOf("\nexport const ", start + 1);
  return source.slice(start, next < 0 ? undefined : next);
}

describe("Organizer private cross-channel voting analysis", () => {
  it("requires Televote, jury and integrity reads from one authenticated global scope", () => {
    expect(auth).toContain('"televote.ballots.read"');
    expect(auth).toContain('"jury.ballots.read"');
    expect(auth).toContain('"integrity.read"');
    expect(auth).toContain("await getSolarisCapabilitiesServer(null)");
    expect(auth).toContain("context.capabilities.includes(capability)");
    expect(auth).not.toContain("requireMergedTelevotingAdminServer");
    for (const capability of ["televote.ballots.read", "jury.ballots.read", "integrity.read"] as const) {
      expect(SOLARIS_ROLE_PRESETS.votingSupervisor).toContain(capability);
    }
  });

  it("authorizes scoped Analytics before importing its privileged engine", () => {
    const code = handlerBody(analytics, "getMergedScopedAnalytics");
    expect(code).toContain("await requirePrivateVotingAnalysisServer()");
    expect(code.indexOf("await requirePrivateVotingAnalysisServer()"))
      .toBeLessThan(code.indexOf('import("@/integrations/televoting/analytics.server")'));
  });

  it.each([
    "getMergedTelevotingIntelligence",
    "getLightweightFriendVotingIntelligence",
    "getFriendVotingCoordination",
  ])("authorizes %s before private analysis starts", (name) => {
    const code = handlerBody(intelligence, name);
    const gate = code.indexOf("await requirePrivateAnalysis()");
    expect(gate).toBeGreaterThan(-1);
    const privateActions = [
      "getResilientFriendVotingIntelligence(data)",
      'import("@/integrations/televoting/coordination-groups.server")',
      'import("@/integrations/televoting/friend-voting-settings.server")',
    ].map((needle) => code.indexOf(needle)).filter((x) => x >= 0);
    expect(privateActions.length).toBeGreaterThan(0);
    expect(gate).toBeLessThan(Math.min(...privateActions));
  });

  it("scopes cross-channel analytics private data by actor, with no automatic poll", () => {
    const page = read("src/routes/televoting/admin/analytics.tsx");
    expect(page).toContain("useAuthenticatedUser().id");
    expect(page).toContain('queryKey: ["merged-televoting-analytics", actorId, scopeKey(scope), hodPersonId ?? "all-hods"]');
    expect(page).toContain("enabled: Boolean(actorId)");
    for (const rule of ["gcTime: 0", "retry: false", "refetchInterval: false", "refetchOnWindowFocus: false", "refetchOnReconnect: false"]) {
      expect(page).toContain(rule);
    }
    expect(page).not.toContain('queryKey: ["merged-televoting-admin"]');
    expect(page).not.toContain("useNavigate");
  });

  it("scopes HOD intelligence and network data by actor, with no automatic polls", () => {
    const page = read("src/routes/_authenticated/admin/friend-voting.tsx");
    expect(page).toContain("useAuthenticatedUser().id");
    expect(page).toContain('queryKey: ["friend-voting-complete", actorId');
    expect(page).toContain('queryKey: ["friend-voting-network", actorId');
    expect(page).toContain('enabled: Boolean(actorId) && tab === "network" && lens === "hod"');
    for (const rule of ["gcTime: 0", "retry: 0", "refetchInterval: false", "refetchOnWindowFocus: false", "refetchOnReconnect: false"]) {
      expect((page.match(new RegExp(rule, "g")) ?? [])).toHaveLength(2);
    }
  });

  it("keeps all adapters observational and away from result/ballot mutations", () => {
    for (const file of [analytics, intelligence, auth]) {
      expect(file).not.toMatch(/\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
    }
  });
});
