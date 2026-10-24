import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const server = readFileSync("src/integrations/televoting/entries.server.ts", "utf8");
const routeMap = readFileSync("src/lib/permission-route-map.ts", "utf8");
const rls = readFileSync(
  "supabase/migrations/20260918192731_permission_engine_v2_televoting_rls_cutover.sql",
  "utf8",
);

function section(start: string, end?: string) {
  const startIndex = server.indexOf(start);
  if (startIndex < 0) return "";
  const endIndex = end ? server.indexOf(end, startIndex + start.length) : -1;
  return server.slice(startIndex, endIndex < 0 ? undefined : endIndex);
}

describe("Organizer Televote round-entry authorization", () => {
  it("requires voting.read before the privileged configuration reader", () => {
    const helper = section(
      "async function requireRoundEntriesReadServer()",
      "async function requireRoundEntriesManageServer()",
    );
    const reader = section(
      "export async function getMergedRoundEntriesServer",
      "export async function saveMergedRoundCountriesServer",
    );

    expect(helper).toContain('requireSolarisCapabilityServer("voting.read", null)');
    expect(helper.indexOf("requireMergedTelevotingAdminServer()"))
      .toBeGreaterThan(helper.indexOf("requireSolarisCapabilityServer"));
    expect(reader.indexOf("requireRoundEntriesReadServer()"))
      .toBeLessThan(reader.indexOf("televotingAdmin"));
  });

  it("requires voting.manage before every participant/configuration mutation", () => {
    const helper = section(
      "async function requireRoundEntriesManageServer()",
      "async function audit(",
    );
    expect(helper).toContain('requireSolarisCapabilityServer("voting.manage", null)');
    expect(helper.indexOf("requireMergedTelevotingAdminServer()"))
      .toBeGreaterThan(helper.indexOf("requireSolarisCapabilityServer"));

    const mutations = [
      section(
        "export async function saveMergedRoundCountriesServer",
        "export async function saveMergedCustomRoundEntryServer",
      ),
      section(
        "export async function saveMergedCustomRoundEntryServer",
        "export async function deleteMergedCustomRoundEntryServer",
      ),
      section(
        "export async function deleteMergedCustomRoundEntryServer",
        "export async function reorderMergedRoundEntriesServer",
      ),
      section(
        "export async function reorderMergedRoundEntriesServer",
        "export async function setMergedRoundSelfVotingModeServer",
      ),
      section("export async function setMergedRoundSelfVotingModeServer"),
    ];

    for (const mutation of mutations) {
      const guard = mutation.indexOf("requireRoundEntriesManageServer()");
      const privilegedAccess = mutation.indexOf("televotingAdmin");
      expect(guard).toBeGreaterThan(-1);
      expect(privilegedAccess).toBeGreaterThan(guard);
    }
  });

  it("keeps the existing closed-round safety gate after authorization", () => {
    expect(server).toContain('if (round.status === "open")');
    expect(server).toContain("Close the round before changing its participants");
    expect(server.match(/await assertEditableRound\(data\.roundId\)/g)).toHaveLength(4);
  });

  it("matches existing route and raw-table Permission Engine ownership", () => {
    expect(routeMap).toContain('"/televoting/admin/"');
    expect(routeMap).toContain('"voting.read"');
    expect(rls).toContain("on televoting.round_entries for all to authenticated");
    expect(rls).toContain(
      "using (public.studio2_access_allowed('voting.manage', null, false))",
    );
    expect(rls).toContain(
      "with check (public.studio2_access_allowed('voting.manage', null, false));",
    );
  });
});
