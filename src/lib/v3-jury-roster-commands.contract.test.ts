import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20261019224500_v3_jury_roster_commands.sql"),
  "utf8",
);

function section(start: string, end: string) {
  const startIndex = migration.indexOf(start);
  const endIndex = migration.indexOf(end, startIndex + start.length);
  expect(startIndex).toBeGreaterThanOrEqual(0);
  expect(endIndex).toBeGreaterThan(startIndex);
  return migration.slice(startIndex, endIndex);
}

describe("V3 Jury roster command authority", () => {
  it("registers an additive forward-fix migration", () => {
    expect(migration).toContain("public.v3_register_migration_contract(");
    expect(migration).toContain("'20261019224500_v3_jury_roster_commands'");
    expect(migration).toContain("'forward_fix_only'");
  });

  it("gives the show roster one canonical monotonic version, including legacy compatibility writes", () => {
    expect(migration).toContain("private.v3_jury_roster_versions");
    expect(migration).toContain("private.v3_touch_jury_roster_version()");
    expect(migration).toContain("after insert or update or delete on public.voters");
    expect(migration).toContain("version = private.v3_jury_roster_versions.version + 1");
  });

  it("binds preview and apply to exact edition + show scope", () => {
    const preview = section(
      "create or replace function public.studio2_jury_roster_preview(",
      "create or replace function public.studio2_apply_jury_roster_change(",
    );
    const apply = section(
      "create or replace function public.studio2_apply_jury_roster_change(",
      "-- Reuse the established Jury responsibility consequence channel",
    );

    for (const source of [preview, apply]) {
      expect(source).toContain("public.studio2_access_allowed('voting.manage', p_edition_id, false)");
      expect(source).toContain("show_row.id = p_show_id");
      expect(source).toContain("show_row.edition_id = p_edition_id");
    }
  });

  it("claims semantic S2 idempotency before mutable-state CAS and returns a receipt", () => {
    const apply = section(
      "create or replace function public.studio2_apply_jury_roster_change(",
      "-- Reuse the established Jury responsibility consequence channel",
    );
    const claim = apply.indexOf("private.studio2_claim_operation(");
    const replay = apply.indexOf("if coalesce((v_claim ->> 'replayed')::boolean, false) then");
    const showLock = apply.indexOf("select show_row.*");
    const versionConflict = apply.indexOf("message = 'VERSION_CONFLICT'");

    expect(claim).toBeGreaterThanOrEqual(0);
    expect(replay).toBeGreaterThan(claim);
    expect(showLock).toBeGreaterThan(replay);
    expect(versionConflict).toBeGreaterThan(showLock);
    expect(apply).toContain("private.studio2_complete_operation(v_operation_id, v_result)");
    expect(apply).toContain("'receiptId', v_operation_id");
  });

  it("materializes missing participating juries in one transaction without duplicating existing identities", () => {
    const apply = section(
      "create or replace function public.studio2_apply_jury_roster_change(",
      "-- Reuse the established Jury responsibility consequence channel",
    );
    expect(apply).toContain("v_kind = 'materialize'");
    expect(apply).toContain("participant.edition_id = p_edition_id");
    expect(apply).toContain("participant.show_id = p_show_id");
    expect(apply).toContain("participant.participation_status not in ('withdrawn', 'disqualified')");
    expect(apply).toContain("where not exists (");
    expect(apply).toContain("insert into public.voters (");
    expect(apply).toContain("returning id");
  });

  it("makes reorder an all-roster atomic set operation rather than two racing row writes", () => {
    const apply = section(
      "create or replace function public.studio2_apply_jury_roster_change(",
      "-- Reuse the established Jury responsibility consequence channel",
    );
    expect(apply).toContain("jsonb_typeof(v_payload -> 'orderedVoterIds') <> 'array'");
    expect(apply).toContain("v_distinct_order_count <> v_order_count");
    expect(apply).toContain("is distinct from v_roster_ids");
    expect(apply).toContain("update public.voters voter\n    set sort_order = requested.sort_order");
  });

  it("blocks voter removal when official jury evidence depends on that roster identity", () => {
    expect(migration).toContain("private.v3_jury_roster_voter_dependencies(");
    expect(migration).toContain("'scoreRows'");
    expect(migration).toContain("'ballotStatuses'");
    expect(migration).toContain("'ballotSubmissions'");
    expect(migration).toContain("private.v3_jury_roster_voter_removable(v_dependencies)");

    const apply = section(
      "create or replace function public.studio2_apply_jury_roster_change(",
      "-- Reuse the established Jury responsibility consequence channel",
    );
    expect(apply).toContain("perform private.studio2_require_fresh_auth(300)");
    expect(apply).toContain("message = 'DEPENDENCY_FAILURE'");
    expect(apply).toContain("delete from public.voters");
  });

  it("does not let add/update mutate voter edition or show identity", () => {
    const apply = section(
      "create or replace function public.studio2_apply_jury_roster_change(",
      "-- Reuse the established Jury responsibility consequence channel",
    );
    const updateBranch = apply.slice(apply.indexOf("elsif v_kind = 'update'"), apply.indexOf("elsif v_kind = 'reorder'"));
    expect(updateBranch).toContain("set name = v_name");
    expect(updateBranch).not.toContain("edition_id =");
    expect(updateBranch).not.toContain("show_id =");
    expect(updateBranch).not.toContain("country_id =");
    expect(updateBranch).not.toContain("contest_entity_id =");
  });

  it("writes audit evidence and reuses the canonical Jury task reconciliation channel exactly once", () => {
    expect(migration).toContain("insert into public.admin_audit_log");
    expect(migration).toContain("private.v3_emit_jury_roster_operation_event()");
    expect(migration).toContain("new.command not like 'jury.roster.%'");
    expect(migration).toContain("'jury.ballot_changed'");
    expect(migration).toContain("'jury_roster'");
    expect(migration).toContain("array['jury.tasks']::text[]");
  });

  it("keeps roster authority server-side without weakening historical jury-vote protection", () => {
    expect(migration).not.toContain("alter table public.jury_votes");
    expect(migration).not.toContain("jury_votes_voter_id_fkey");
    expect(migration).not.toMatch(
      /references public\.voters\s*\(id\)[\s\S]{0,160}on delete cascade/i,
    );
    expect(migration).toContain("revoke all on function public.studio2_apply_jury_roster_change(");
    expect(migration).toContain("to authenticated, service_role");
  });
});
