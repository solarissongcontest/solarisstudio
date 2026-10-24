import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const server = readFileSync(
  "src/integrations/televoting/friend-voting-settings.server.ts",
  "utf8",
);
const routeCapabilities = readFileSync("src/lib/permission-route-map.ts", "utf8");

function block(startMarker: string, endMarker?: string) {
  const start = server.indexOf(startMarker);
  expect(start, `${startMarker} must exist`).toBeGreaterThanOrEqual(0);
  const end = endMarker ? server.indexOf(endMarker, start + startMarker.length) : server.length;
  return server.slice(start, end < 0 ? server.length : end);
}

describe("Organizer Friend Voting settings authorization", () => {
  it("keeps the route discoverable with voting.read", () => {
    expect(routeCapabilities).toContain('"/admin/friend-voting"');
    expect(routeCapabilities).toContain('"voting.read"');
  });

  it("uses the caller-authenticated capability resolver", () => {
    expect(server).toContain("createSolarisAuthenticatedClientServer");
    expect(server).toContain('rpc("studio2_access_allowed"');
    expect(server).toContain('read: "voting.read"');
    expect(server).toContain('manage: "voting.manage"');
    expect(server).toContain("p_edition_id: null");
    expect(server).toContain("if (data !== true)");
  });

  it("requires voting.read for the Organizer settings read", () => {
    const read = block(
      "export async function getFriendVotingSettingsServer()",
      "export async function updateFriendVotingSettingsServer",
    );
    expect(read).toContain("requireFriendVotingCapability(FRIEND_VOTING_CAPABILITIES.read, false)");
    const authorizationIndex = read.indexOf("requireFriendVotingCapability");
    const settingsReadIndex = read.indexOf("loadFriendVotingSettingsServer");
    expect(authorizationIndex).toBeGreaterThanOrEqual(0);
    expect(settingsReadIndex).toBeGreaterThanOrEqual(0);
    expect(authorizationIndex).toBeLessThan(settingsReadIndex);
  });

  it("requires strict voting.manage before the service-only settings mutation", () => {
    const update = block("export async function updateFriendVotingSettingsServer");
    expect(update).toContain("requireFriendVotingCapability(FRIEND_VOTING_CAPABILITIES.manage, true)");
    const authorizationIndex = update.indexOf("requireFriendVotingCapability");
    const mutationIndex = update.indexOf('db.rpc("update_friend_voting_settings_with_audit"');
    expect(authorizationIndex).toBeGreaterThanOrEqual(0);
    expect(mutationIndex).toBeGreaterThanOrEqual(0);
    expect(authorizationIndex).toBeLessThan(mutationIndex);
  });
});
