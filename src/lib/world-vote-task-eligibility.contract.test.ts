import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Source contracts support, but do not replace, disposable PostgreSQL/RLS
// rehearsal. No hosted Supabase credentials or network I/O.
const read = (path: string) => readFileSync(new URL("../../" + path, import.meta.url), "utf8");
const sql = read("supabase/migrations/20261107150500_v3_tg10_world_vote_task_eligibility.sql");
const tg8 = read("supabase/migrations/20261107130100_v3_tg8_legislative_vote_commands.sql");
const voteTables = read("supabase/migrations/20261107130000_v3_tg8_legislative_votes.sql");

describe("TG10 institutional vote Task Engine recipient authority", () => {
  it("reuses TG8's exact frozen-and-live authorization, never a legacy edition capability", () => {
    expect(tg8).toContain("private.world_vote_cast_authorized_v1(");
    expect(tg8).toContain("membership.revision=seat.membership_revision");
    expect(tg8).toContain("representation.revision=seat.representation_revision");
    expect(tg8).toContain("proxy.revoked_at is null");
    expect(sql).toContain("private.world_vote_cast_authorized_v1(");
    expect(sql).not.toMatch(/studio2_user_has_capability\s*\(/i);
  });

  it("does not create a second task store, writer, fanout or browser RPC", () => {
    expect(sql).toMatch(/create or replace function private\.world_vote_task_recipient_eligible_v1\s*\(/i);
    expect(sql).not.toMatch(/create\s+table|insert\s+into\s+public\.admin_notifications|insert\s+into\s+public\.notification_deliveries/i);
    expect(sql).not.toMatch(/create or replace function public\./i);
  });

  it("rejects null identities and disabled voting feature flags", () => {
    expect(sql).toContain("p_vote_id is null or p_country_id is null or p_user_id is null");
    expect(sql).toContain("terra_world_voting_rules");
    expect(sql).toContain("terra_world_legislative_voting");
    expect(sql).toContain("return false;");
    expect(sql).toContain("public.studio2_feature_enabled");
  });

  it("uses server-time voting window, active institutions and platform-mode grants", () => {
    expect(sql).toContain("pg_catalog.clock_timestamp()");
    expect(sql).toContain("vote.status = 'open'");
    expect(sql).toContain("vote.opened_at <= v_at");
    expect(sql).toContain("v_at < vote.closes_at");
    expect(sql).toContain("organization.status = 'active'");
    expect(sql).toContain("organ.status = 'active'");
    expect(sql).toContain("private.studio2_capability_allowed_in_platform_mode(");
    expect(sql).not.toMatch(/p_at\s+timestamptz/i);
  });

  it("checks the frozen country seat and excludes already-submitted ballots", () => {
    expect(voteTables).toContain("create table public.world_vote_eligibility");
    expect(voteTables).toContain("create table private.world_ballots");
    expect(voteTables).toContain("unique(vote_id,country_id)");
    expect(sql).toContain("seat.eligible is true");
    expect(sql).toContain("seat.country_id = p_country_id");
    expect(sql).toContain("not exists (");
    expect(sql).toContain("from private.world_ballots ballot");
    expect(sql).toContain("ballot.country_id = seat.country_id");
  });

  it("cannot be invoked directly by browser or service-role tokens", () => {
    expect(sql).toContain("security definer");
    expect(sql).toContain("set search_path = pg_catalog");
    expect(sql).toMatch(/revoke all on function private\.world_vote_task_recipient_eligible_v1\(uuid,uuid,uuid\)\s+from public, anon, authenticated, service_role;/i);
    expect(sql).not.toMatch(/grant execute/i);
  });
  it("keeps the TG10 rehearsal inside the parent disposable TG8 transaction", () => {
    const rehearsal = read("scripts/rehearse-v3-world-vote-task-eligibility.sql");
    expect(rehearsal).toContain("current_setting('solaris.tg8_fixture'");
    expect(rehearsal).toContain("savepoint tg10_vote_task_eligibility;");
    expect(rehearsal).toContain("rollback to savepoint tg10_vote_task_eligibility;");
    expect(rehearsal).toContain("release savepoint tg10_vote_task_eligibility;");
    expect(rehearsal).not.toMatch(/(^|\n)\s*(?:begin|commit)\s*;/im);
  });

  it("rehearses recipient, private privilege, feature and platform denial", () => {
    const rehearsal = read("scripts/rehearse-v3-world-vote-task-eligibility.sql");
    expect(rehearsal).toContain("TG10_VALID_REPRESENTATIVE_TASK_DENIED");
    expect(rehearsal).toContain("TG10_OTHER_COUNTRY_REP_LEAK");
    expect(rehearsal).toContain("TG10_OUTSIDER_TASK_LEAK");
    expect(rehearsal).toContain("TG10_NULL_ACTOR_TASK_LEAK");
    expect(rehearsal).toContain("TG10_EXPIRED_VOTE_TASK_LEAK");
    expect(rehearsal).toContain("set local role anon;");
    expect(rehearsal).toContain("TG10_ANON_EXECUTE_ALLOWED");
    expect(rehearsal).toContain("TG10_DISABLED_VOTING_TASK_LEAK");
    expect(rehearsal).toContain("TG10_DISABLED_RULES_TASK_LEAK");
    expect(rehearsal).toContain("TG10_READ_ONLY_TASK_LEAK");
    expect(rehearsal).toContain("TG10_APPROVED_PROXY_TASK_DENIED");
    expect(rehearsal).toContain("TG10_REPLACED_REPRESENTATIVE_TASK_LEAK");
    expect(rehearsal).toContain("TG10_REVOKED_PROXY_TASK_LEAK");
    expect(rehearsal).toContain("v_proxy_measure");
    expect(rehearsal).toContain("v_proxy_version");
    expect(rehearsal).not.toMatch(/world_vote_electorate|world_legislative_ballots/i);
  });

  it("uses TG8's real cast to revoke already-cast task entitlement", () => {
    const rehearsal = read("scripts/rehearse-v3-world-vote-task-eligibility.sql");
    expect(rehearsal).toContain("public.world_cast_ballot_v1(");
    expect(rehearsal).toContain("TG10_CANONICAL_CAST_FAILED");
    expect(rehearsal).toContain("TG10_ALREADY_CAST_VOTE_TASK_LEAK");
    expect(rehearsal).toContain("public.world_vote_eligibility");
    expect(rehearsal).not.toMatch(/(?:https?:\/\/|postgres(?:ql)?:\/\/)/i);
  });

});
