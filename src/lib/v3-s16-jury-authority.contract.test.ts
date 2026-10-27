import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { V3_S16_AUTHORITY_CONTRACTS } from "./v3-s16-release-risk";

const route = readFileSync("src/routes/jury-voting.tsx", "utf8");
const migration = readFileSync("supabase/migrations/20261014132819_v3_jury_reliability_foundation.sql", "utf8");
const organizerMigration = readFileSync("supabase/migrations/20261003014000_organisation_os_v5_jury_window_operations.sql", "utf8");

describe("S16 Jury mutation authority cutover", () => {
  it("removes the participant browser legacy ballot writer", () => {
    expect(route).toContain("useServerFn(submitV3JuryBallot)");
    expect(route).toContain("useServerFn(reconcileV3JurySubmission)");
    expect(route).not.toContain('supabase.rpc("submit_country_jury_ballot"');
  });

  it("keeps one receipt-bearing participant command while reusing the validated ballot primitive internally", () => {
    expect(migration).toContain("create or replace function public.v3_submit_jury_ballot(");
    expect(migration).toContain("v_ballot_id := public.submit_country_jury_ballot(_show_id, _entries, _preflight_id)");
    expect(migration).toContain("private.v3_jury_operations");
    expect(migration).toContain("'authority', 'authoritative_server'");
  });

  it("declares the two canonical Jury mutation commands for S16", () => {
    const jury = V3_S16_AUTHORITY_CONTRACTS.find((contract) => contract.domain === "jury");
    expect(jury?.canonicalCommands).toContain("public.v3_submit_jury_ballot");
    expect(jury?.canonicalCommands).toContain("public.studio2_apply_jury_voting_status");
    expect(jury?.legacyApplicationWriters?.map((writer) => writer.id)).toContain("browser-direct-submit_country_jury_ballot");
  });

  it("matches the existing Organizer precedent that revokes browser access to the lower-level writer", () => {
    expect(organizerMigration).toContain("Browser organizers must use preview + R2 apply");
    expect(organizerMigration).toContain("revoke execute on function public.admin_set_jury_voting_status(uuid, text)");
    expect(organizerMigration).toContain("from authenticated");
  });
});
