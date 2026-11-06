import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const server = readFileSync(
  "src/integrations/televoting/friend-voting-settings.server.ts",
  "utf8",
);
const functions = readFileSync(
  "src/integrations/televoting/friend-voting-settings.functions.ts",
  "utf8",
);

describe("Organizer V3 Friend Voting settings authorization", () => {
  it("uses read and manage capabilities instead of a generic Organizer role", () => {
    expect(server).toContain('requireSolarisCapabilityServer("voting.read", null)');
    expect(server).toContain('requireSolarisCapabilityServer("voting.manage", null)');
    expect(server).not.toContain("requireSolarisOrganizerServer");
  });

  it("binds the service-role audit actor to the authenticated capability context", () => {
    expect(server).toContain("const capability = await requireSolarisCapabilityServer");
    expect(server).toContain("p_actor_id: capability.userId");
    expect(server).not.toContain("p_actor_id: input");
  });

  it("authorizes mutation before the service-role-backed before snapshot is read", () => {
    const guard = functions.indexOf(
      'await requireSolarisCapabilityServer("voting.manage", null);',
    );
    const before = functions.indexOf("const before = await loadFriendVotingSettingsServer();");
    const update = functions.indexOf("const result = await updateFriendVotingSettingsServer(data);");

    expect(guard).toBeGreaterThan(-1);
    expect(before).toBeGreaterThan(guard);
    expect(update).toBeGreaterThan(before);
  });

  it("keeps the unguarded loader internal to already-authorized server flows", () => {
    expect(functions).not.toContain("loadFriendVotingSettingsServer();\n    await requireSolarisCapabilityServer");
    expect(server).toContain("export async function getFriendVotingSettingsServer() {");
    expect(server).toContain("return loadFriendVotingSettingsServer();");
  });
});
