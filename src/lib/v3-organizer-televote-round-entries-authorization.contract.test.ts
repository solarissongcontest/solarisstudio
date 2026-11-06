import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const raw = readFileSync("src/integrations/televoting/entries.server.ts", "utf8");
const adapters = readFileSync("src/integrations/televoting/entries.functions.ts", "utf8");

const writers = [
  "saveMergedRoundCountriesServer",
  "saveMergedCustomRoundEntryServer",
  "deleteMergedCustomRoundEntryServer",
  "reorderMergedRoundEntriesServer",
  "setMergedRoundSelfVotingModeServer",
];

function serverMethod(name: string) {
  const first = raw.indexOf("export async function " + name);
  if (first < 0) throw new Error("Missing " + name);
  const next = raw.indexOf("\nexport async function ", first + name.length);
  return raw.slice(first, next < 0 ? undefined : next);
}

describe("V3 Organizer Televote round-entry service permission boundary", () => {
  it("requires named global voting.read before loading private round entries", () => {
    const helper = raw.slice(raw.indexOf("async function requireRoundEntriesReadServer"), raw.indexOf("async function requireRoundEntriesManageServer"));
    expect(helper).toContain('requireSolarisCapabilityServer("voting.read", null)');
    expect(helper.indexOf("requireMergedTelevotingAdminServer()")).toBeGreaterThan(helper.indexOf("requireSolarisCapabilityServer("));
    expect(serverMethod("getMergedRoundEntriesServer")).toContain("await requireRoundEntriesReadServer()");
  });

  it.each(writers)("%s requires named global voting.manage before legacy writer executes", name => {
    const helper = raw.slice(raw.indexOf("async function requireRoundEntriesManageServer"), raw.indexOf("async function audit("));
    const writer = serverMethod(name);
    expect(helper).toContain('requireSolarisCapabilityServer("voting.manage", null)');
    expect(helper.indexOf("requireMergedTelevotingAdminServer()")).toBeGreaterThan(helper.indexOf("requireSolarisCapabilityServer("));
    expect(writer).toContain("const actor = await requireRoundEntriesManageServer()");
    expect(writer.indexOf("requireRoundEntriesManageServer()")).toBeLessThan(writer.indexOf("assertEditableRound("));
  });

  it("preserves existing editability limits and moderator audit instead of bypassing canonical authority", () => {
    expect(raw).toContain('if (round.status === "open") throw new Error');
    expect(raw).toContain('.from("round_entries")');
    expect(raw).toContain('.from("admin_audit_log").insert(');
    expect(raw).toContain("normalizeOrders(");
    expect(raw).toContain("syncParticipantMode(");
  });

  it("keeps the browser adapter as a separate independently guarded boundary", () => {
    expect(adapters).toMatch(/import\(\s*"@\/integrations\/televoting\/entries\.server"\s*\)/);
    expect(adapters).not.toContain("televotingAdmin");
    expect(adapters).not.toContain("supabaseAdmin");
  });
});
