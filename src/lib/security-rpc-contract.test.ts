import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260820071500_harden_organizer_security_definer_rpcs.sql"),
  "utf8",
);

const friendVotingServer = readFileSync(
  resolve(process.cwd(), "src/integrations/televoting/friend-voting-settings.server.ts"),
  "utf8",
);

describe("organizer RPC security boundary", () => {
  it("removes anonymous execution from jury and account administration mutations", () => {
    expect(migration).toContain("admin_country_accounts() from public, anon");
    expect(migration).toContain("admin_set_country_account_status(uuid, text, text) from public, anon");
    expect(migration).toContain("assign_jury_vote(uuid, uuid, uuid, uuid, uuid, uuid, uuid, integer) from public, anon");
    expect(migration).toContain("clear_jury_point(uuid, uuid, uuid, uuid, uuid, integer) from public, anon");
  });

  it("keeps the raw friend-voting settings mutation service-role only", () => {
    expect(friendVotingServer).toContain("requireSolarisOrganizerServer");
    expect(friendVotingServer).toContain("supabaseAdmin");
    expect(migration).toContain("update_friend_voting_settings_with_audit(uuid, jsonb) from public, anon, authenticated");
    expect(migration).toContain("update_friend_voting_settings_with_audit(uuid, jsonb) to service_role");
  });

  it("does not expose internal participant trigger functions as browser RPCs", () => {
    expect(migration).toContain("preserve_edition_participation_before_show_delete() from public, anon, authenticated");
    expect(migration).toContain("sync_participant_entry_details() from public, anon, authenticated");
  });

  it("pins the participant identity helper search path", () => {
    expect(migration).toContain("set search_path = public, pg_temp");
  });
});
