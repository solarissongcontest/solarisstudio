import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261019235500_v3_televote_aggregate_totals_command.sql",
  ),
  "utf8",
);

describe("V3 aggregate Televote totals command", () => {
  it("owns a versioned show snapshot instead of relying on browser write order", () => {
    expect(migration).toContain("studio2_televote_total_versions");
    expect(migration).toContain("studio2_get_televote_totals_snapshot");
    expect(migration).toContain("studio2_replace_televote_totals");
    expect(migration).toContain("for update");
    expect(migration).toContain("STATE_CHANGED");
    expect(migration).toContain("p_expected_version");
  });

  it("fails closed on authorization, invalid show identity and incomplete aggregate sets", () => {
    expect(migration).toContain("studio2_access_allowed('voting.manage'");
    expect(migration).toContain("TELEVOTE_PARTICIPANT_IDENTITY_INVALID");
    expect(migration).toContain("DUPLICATE_TELEVOTE_ENTITY");
    expect(migration).toContain("TELEVOTE_ENTITY_NOT_IN_SHOW");
    expect(migration).toContain("TELEVOTE_TOTAL_SET_INCOMPLETE");
    expect(migration).toContain("count(distinct p.contest_entity_id)");
  });

  it("blocks edits while canonical results are locked or publicly visible", () => {
    expect(migration).toContain("studio2_result_operations");
    expect(migration).toContain("locked_version is not null");
    expect(migration).toContain("studio2_show_publication_controls");
    expect(migration).toContain("frozen_config ->> 'results'");
    expect(migration).toContain("RESULTS_LOCKED");
    expect(migration).toContain("RESULTS_PUBLISHED");
  });

  it("uses the shared S2 operation ledger and S4 domain event infrastructure", () => {
    expect(migration).toContain("private.studio2_claim_operation(");
    expect(migration).toContain("'televote.totals.replace'");
    expect(migration).toContain("'R2'");
    expect(migration).toContain("private.studio2_complete_operation(");
    expect(migration).toContain("private.v3_emit_domain_event(");
    expect(migration).toContain("'televote.totals_replaced'");
    expect(migration).toContain("'reconciliationRequired', true");
  });

  it("replaces the complete show total set atomically and preserves sanctioned negatives", () => {
    const functionStart = migration.indexOf("create or replace function public.studio2_replace_televote_totals");
    const functionBody = migration.slice(functionStart);

    expect(functionBody).toContain("delete from public.televote_votes");
    expect(functionBody).toContain("insert into public.televote_votes");
    expect(functionBody).toContain("v_points_numeric < -2147483648");
    expect(functionBody).not.toContain("v_points_numeric < 0");
  });

  it("records actor-scoped audit evidence with before and after snapshots", () => {
    expect(migration).toContain("insert into public.admin_audit_log");
    expect(migration).toContain("'snapshot', v_before");
    expect(migration).toContain("'snapshot', v_after");
    expect(migration).toContain("'contestEntityIds', to_jsonb(v_seen)");
    expect(migration).toContain("'reason', v_reason");
  });

  it("does not expose version-table mutation authority to browser roles", () => {
    expect(migration).toContain(
      "revoke all on table public.studio2_televote_total_versions from public, anon, authenticated",
    );
    expect(migration).not.toContain(
      "grant insert, update, delete on table public.studio2_televote_total_versions to authenticated",
    );
  });
});
