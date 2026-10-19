import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261020001500_v3_o6_show_lineup_member_authority.sql",
  ),
  "utf8",
);

const client = readFileSync(
  resolve(process.cwd(), "src/lib/v3-show-lineup-operations.ts"),
  "utf8",
);

describe("V3 O6 governed show line-up membership", () => {
  it("registers a forward-only non-destructive S13 migration contract", () => {
    expect(migration).toContain("'v3.o6.show-lineup-member-authority'");
    expect(migration).toContain("'forward_fix_only'");
    expect(migration).toContain("false,");
  });

  it("preflights destructive removal against official show facts rather than participant FKs", () => {
    expect(migration).toContain("private.v3_show_lineup_member_dependencies");
    for (const table of [
      "public.results",
      "public.jury_votes",
      "public.jury_ballot_statuses",
      "public.jury_ballot_submissions",
      "public.televote_votes",
      "public.voters",
    ]) {
      expect(migration).toContain(table);
    }
    expect(migration).toContain("'canRemove', v_total = 0");
    expect(migration).toContain("public.studio2_show_lineup_member_preflight");
  });

  it("makes add and remove semantic idempotent R2 operations", () => {
    expect(migration).toContain("'show.lineup.member.add'");
    expect(migration).toContain("'show.lineup.member.remove'");
    expect(migration.match(/private\.studio2_claim_operation\(/g)?.length).toBe(2);
    expect(migration.match(/private\.studio2_complete_operation\(/g)?.length).toBe(2);
    expect(migration.match(/public\.studio2_reconcile_operation\(v_operation_id\)/g)?.length).toBe(4);
    expect(migration.match(/'R2'/g)?.length).toBe(2);
  });

  it("serializes through the show and validates CAS after claiming for lost-response replay", () => {
    const addClaim = migration.indexOf("'show.lineup.member.add'");
    const addLock = migration.indexOf("perform private.v3_lock_show_lineup(p_show_id)", addClaim);
    const addCas = migration.indexOf("v_before := private.v3_assert_show_lineup_version(", addLock);
    expect(addClaim).toBeGreaterThan(-1);
    expect(addLock).toBeGreaterThan(addClaim);
    expect(addCas).toBeGreaterThan(addLock);

    const removeClaim = migration.indexOf("'show.lineup.member.remove'");
    const removeLock = migration.indexOf("perform private.v3_lock_show_lineup(p_show_id)", removeClaim);
    const removeCas = migration.indexOf("v_before := private.v3_assert_show_lineup_version(", removeLock);
    expect(removeClaim).toBeGreaterThan(-1);
    expect(removeLock).toBeGreaterThan(removeClaim);
    expect(removeCas).toBeGreaterThan(removeLock);
  });

  it("binds added contest entities to the exact edition and refuses duplicate show identity", () => {
    expect(migration).toContain("and e.edition_id = v_edition_id");
    expect(migration).toContain("p.contest_entity_id = p_contest_entity_id");
    expect(migration).toContain("v_country_id is not null and p.country_id = v_country_id");
    expect(migration).toContain("message = 'STATE_CHANGED'");
  });

  it("preserves existing running-order append/compaction behavior through canonical participant writes", () => {
    expect(migration).toContain("insert into public.participants");
    expect(migration).toContain("delete from public.participants p");
    expect(migration).not.toContain("update public.participants\n  set running_order = running_order - 1");
  });

  it("fails closed when official dependencies exist and requires a removal reason", () => {
    expect(migration).toContain("if p_participant_id is null or v_reason is null");
    expect(migration).toContain("message = 'DEPENDENCY_FAILURE'");
    expect(migration).toContain("detail = v_dependencies::text");
  });

  it("emits completed immutable membership facts with before/after versions", () => {
    expect(migration).toContain("'show.lineup_member_added'");
    expect(migration).toContain("'show.lineup_member_removed'");
    expect(migration).toContain("private.v3_emit_show_lineup_event(");
    expect(migration).toContain("v_before ->> 'stateVersion'");
    expect(migration).toContain("v_after ->> 'stateVersion'");
  });

  it("exposes typed preflight/add/remove client operations with replay identity", () => {
    expect(client).toContain("getV3ShowLineupMemberPreflight");
    expect(client).toContain("addV3ShowLineupMember");
    expect(client).toContain("removeV3ShowLineupMember");
    expect(client).toContain('rpc("studio2_show_lineup_member_preflight"');
    expect(client).toContain('rpc("studio2_add_show_lineup_member"');
    expect(client).toContain('rpc("studio2_remove_show_lineup_member"');
    expect(client).toContain("operationId: input.identity?.operationId");
  });
});
