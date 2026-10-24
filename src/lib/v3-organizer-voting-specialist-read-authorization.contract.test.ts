import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { V3_ORGANIZER_CAPABILITY_REGISTRY } from "./v3-organizer-capability-registry";

const analytics = readFileSync(
  "src/integrations/televoting/analytics.functions.ts",
  "utf8",
);
const intelligence = readFileSync(
  "src/integrations/televoting/intelligence.functions.ts",
  "utf8",
);
const routeMap = readFileSync("src/lib/permission-route-map.ts", "utf8");

function handlerBody(source: string, exportName: string) {
  const start = source.indexOf(`export const ${exportName}`);
  if (start < 0) throw new Error(`Missing ${exportName}`);
  const next = source.indexOf("\nexport const ", start + 1);
  return source.slice(start, next < 0 ? source.length : next);
}

describe("V3 Organizer voting specialist server-function authorization", () => {
  it("keeps canonical route ownership on voting.read", () => {
    expect(routeMap).toContain('rule(["/televoting/admin"], "voting.read")');
    expect(routeMap).toContain('"/admin/friend-voting"');
  });

  it("authorizes Analytics before the privileged analytics engine is imported", () => {
    const handler = handlerBody(analytics, "getMergedScopedAnalytics");
    expect(analytics).toContain('requireSolarisCapabilityServer("voting.read")');
    expect(handler).toContain("await requireVotingRead()");
    expect(handler.indexOf("await requireVotingRead()"))
      .toBeLessThan(handler.indexOf('import("@/integrations/televoting/analytics.server")'));
  });

  it.each([
    "getMergedTelevotingIntelligence",
    "getLightweightFriendVotingIntelligence",
    "getFriendVotingCoordination",
  ])("authorizes %s before privileged intelligence work", (exportName) => {
    const handler = handlerBody(intelligence, exportName);
    expect(intelligence).toContain('requireSolarisCapabilityServer("voting.read")');
    expect(handler).toContain("await requireVotingRead()");

    const capabilityCheck = handler.indexOf("await requireVotingRead()");
    const firstPrivilegedWork = Math.min(
      ...[
        "getResilientFriendVotingIntelligence(data)",
        'import("@/integrations/televoting/coordination-groups.server")',
        'import("@/integrations/televoting/friend-voting-settings.server")',
      ]
        .map((needle) => handler.indexOf(needle))
        .filter((index) => index >= 0),
    );

    expect(firstPrivilegedWork).toBeGreaterThan(-1);
    expect(capabilityCheck).toBeLessThan(firstPrivilegedWork);
  });

  it("keeps the browser-facing adapters read-only", () => {
    for (const source of [analytics, intelligence]) {
      expect(source).not.toContain(".insert(");
      expect(source).not.toContain(".update(");
      expect(source).not.toContain(".delete(");
      expect(source).not.toContain(".upsert(");
    }
  });

  it("does not overclaim specialist parity from this boundary hardening", () => {
    for (const id of ["voting-analytics", "voting-intelligence"]) {
      const capability = V3_ORGANIZER_CAPABILITY_REGISTRY.find(
        (item) => item.legacyId === id,
      );
      expect(capability).toBeDefined();
      expect(capability?.migrationStatus).toBe("building");
      expect(["parity", "cutover", "retired"]).not.toContain(capability?.migrationStatus);
    }
  });
});