import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const server = readFileSync(
  "src/integrations/televoting/integrity-moderation.server.ts",
  "utf8",
);
const cutover = readFileSync(
  "supabase/migrations/20260916164619_permission_engine_v2_televoting_integrity_wrapper_cutover.sql",
  "utf8",
);

function section(start: string, end?: string) {
  const startIndex = server.indexOf(start);
  if (startIndex < 0) return "";
  const endIndex = end ? server.indexOf(end, startIndex + start.length) : -1;
  return server.slice(startIndex, endIndex < 0 ? undefined : endIndex);
}

describe("V3 Televote integrity caller identity", () => {
  it("gates the privileged moderation read projection by explicit edition scope", () => {
    const load = section(
      "export async function loadIntegrityModerationServer",
      "export async function recordIntegrityDecisionServer",
    );
    const guard = load.indexOf(
      'await requireSolarisCapabilityServer("integrity.read", editionId);',
    );
    const declarations = load.indexOf("listIntegrityDeclarationsServer");
    const privilegedRead = load.indexOf("supabaseAdmin");

    expect(load).toContain("Choose an edition before loading integrity moderation.");
    expect(guard).toBeGreaterThan(-1);
    expect(declarations).toBeGreaterThan(guard);
    expect(privilegedRead).toBeGreaterThan(guard);
  });

  it("uses the authenticated caller client for all four canonical integrity RPC mutations", () => {
    expect(server).toContain("createSolarisAuthenticatedClientServer");
    expect(server).toContain('.schema("televoting")');
    expect(server).not.toContain("televotingAdmin");
    expect(server).not.toContain("requireMergedTelevotingAdminServer");

    for (const rpc of [
      "organizer_record_integrity_decision",
      "organizer_exclude_integrity_ballot",
      "organizer_create_integrity_sanction",
      "organizer_revoke_integrity_sanction",
    ]) {
      expect(server).toContain(`authenticatedTelevotingClient().rpc("${rpc}"`);
    }
  });

  it("preserves the database-owned capability split instead of flattening mutations into one server role check", () => {
    expect(cutover).toContain("if auth.uid() is null then");
    expect(cutover).toContain(
      "studio2_access_allowed('integrity.manage', v_edition_id, false)",
    );
    expect(cutover).toContain(
      "studio2_access_allowed('televote.ballots.manage', v_edition_id, false)",
    );
    expect(cutover.match(/studio2_access_allowed\('integrity\.sanction', v_edition_id, false\)/g))
      .toHaveLength(2);
  });

  it("keeps actor identity server-derived inside the governed RPCs", () => {
    expect(cutover).toContain("auth.uid()");
    expect(cutover).toContain("p_reason,\n    auth.uid()");
    expect(server).not.toContain("actorId");
    expect(server).not.toContain("organizerId");
    expect(server).not.toContain("userId");
  });
});
