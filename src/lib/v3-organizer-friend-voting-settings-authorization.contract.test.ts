import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const server = readFileSync("src/integrations/televoting/friend-voting-settings.server.ts", "utf8");
const adapter = readFileSync("src/integrations/televoting/friend-voting-settings.functions.ts", "utf8");
const routes = readFileSync("src/lib/permission-route-map.ts", "utf8");

function serverMethod(name: string) {
  const start = server.indexOf(`export async function ${name}`);
  if (start < 0) throw new Error(`Missing Friend Voting service ${name}`);
  const next = server.indexOf("\nexport async function ", start + name.length);
  return server.slice(start, next < 0 ? undefined : next);
}

function adapterMethod(name: string) {
  const start = adapter.indexOf(`export const ${name}`);
  if (start < 0) throw new Error(`Missing Friend Voting adapter ${name}`);
  const next = adapter.indexOf("\nexport const ", start + name.length);
  return adapter.slice(start, next < 0 ? undefined : next);
}

describe("Organizer Friend Voting settings capability and audit boundary", () => {
  it("preserves the Organizer voting.read route requirement", () => {
    expect(routes).toContain('"/admin/friend-voting"');
    expect(routes).toContain('"voting.read"');
  });

  it("checks voting.read before loading privileged settings at both entrypoints", () => {
    const browser = adapterMethod("getFriendVotingSettings");
    const direct = serverMethod("getFriendVotingSettingsServer");
    const guard = 'requireSolarisCapabilityServer("voting.read", null)';
    expect(browser.indexOf(guard)).toBeGreaterThanOrEqual(0);
    expect(browser.indexOf(guard)).toBeLessThan(browser.indexOf('"@/integrations/televoting/friend-voting-settings.server"'));
    expect(direct.indexOf(guard)).toBeGreaterThanOrEqual(0);
    expect(direct.indexOf(guard)).toBeLessThan(direct.indexOf("requireSolarisOrganizerServer()"));
    expect(direct.indexOf(guard)).toBeLessThan(direct.indexOf("loadFriendVotingSettingsServer()"));
  });

  it("checks voting.manage before privileged before-snapshot and audited mutation", () => {
    const browser = adapterMethod("updateFriendVotingSettings");
    const direct = serverMethod("updateFriendVotingSettingsServer");
    const guard = 'requireSolarisCapabilityServer("voting.manage", null)';
    const before = browser.indexOf("const before = await loadFriendVotingSettingsServer()");
    const moduleImport = browser.indexOf('"@/integrations/televoting/friend-voting-settings.server"');
    expect(browser.indexOf(guard)).toBeGreaterThanOrEqual(0);
    expect(moduleImport).toBeGreaterThan(browser.indexOf(guard));
    expect(before).toBeGreaterThan(browser.indexOf(guard));
    expect(direct.indexOf(guard)).toBeGreaterThanOrEqual(0);
    expect(direct.indexOf("requireSolarisOrganizerServer()")).toBeGreaterThan(direct.indexOf(guard));
    expect(direct.indexOf('db.rpc("update_friend_voting_settings_with_audit"')).toBeGreaterThan(direct.indexOf(guard));
    expect(direct).toContain("p_actor_id: organizer.id");
  });

  it("binds the capability grant to the server-derived Organizer identity before any private read or audited write", () => {
    for (const method of ["getFriendVotingSettingsServer", "updateFriendVotingSettingsServer"]) {
      const code = serverMethod(method);
      const check = code.indexOf("if (capabilityContext.userId !== organizer.id)");
      const organizer = code.indexOf("await requireSolarisOrganizerServer()");
      expect(check).toBeGreaterThan(organizer);
      const protectedOperation = method.startsWith("get")
        ? code.indexOf("return loadFriendVotingSettingsServer()")
        : code.indexOf('db.rpc("update_friend_voting_settings_with_audit"');
      expect(protectedOperation).toBeGreaterThan(check);
    }
    expect(serverMethod("updateFriendVotingSettingsServer")).toContain("p_actor_id: organizer.id");
  });

  it("retains internal read for authorized calculations without adding a second writer", () => {
    const internal = serverMethod("loadFriendVotingSettingsServer");
    expect(internal).toContain('.from("friend_voting_settings")');
    expect(server).toContain('db.rpc("update_friend_voting_settings_with_audit"');
    expect(server).not.toContain('.from("friend_voting_settings").update(');
  });
});
