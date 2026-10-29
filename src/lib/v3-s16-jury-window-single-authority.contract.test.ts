import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20261029160000_v3_s16_jury_window_single_authority.sql",
  "utf8",
).toLowerCase();

const previous = readFileSync(
  "supabase/migrations/20261003014000_organisation_os_v5_jury_window_operations.sql",
  "utf8",
).toLowerCase();

describe("V3 S16 Jury window single mutation authority", () => {
  it("moves the semantic Jury window mutation into the canonical R2 command", () => {
    expect(migration).toContain(
      "create or replace function public.studio2_apply_jury_voting_status",
    );
    expect(migration).toContain(
      "public.studio2_access_allowed('voting.manage', v_show.edition_id, false)",
    );
    expect(migration).toContain("private.studio2_claim_operation(");
    expect(migration).toContain("pg_advisory_xact_lock(");
    expect(migration).toContain("p_expected_version <> v_current_version");
    expect(migration).toContain("update public.jury_voting_windows");
    expect(migration).toContain("insert into public.jury_voting_windows");
    expect(migration).toContain("private.studio2_complete_operation(v_operation_id, v_result)");
    expect(migration).not.toContain(
      "v_change := public.admin_set_jury_voting_status",
    );
  });

  it("revalidates the opening invariants at commit time", () => {
    expect(migration).toContain("jury voting is disabled for this show");
    expect(migration).toContain(
      "this show does not have enough entries for the configured jury point scale",
    );
    expect(migration).toContain(
      "participating juries cannot vote for themselves",
    );
    expect(migration).toContain(
      "the configured jury scale leaves participating juries too few eligible entries after self-voting is blocked",
    );
  });

  it("advances CAS exactly at the governed operation boundary", () => {
    expect(migration).toContain(
      "insert into public.studio2_jury_window_versions (edition_id, version, updated_at)",
    );
    expect(migration).toContain(
      "public.studio2_jury_window_versions.version + 1",
    );
    expect(migration).toContain("returning version into v_next_version");
    expect(migration).toContain(
      "drop trigger if exists studio2_jury_window_touch_edition_version",
    );
  });

  it("turns the legacy semantic writer and trigger helper into fail-closed non-writers", () => {
    expect(previous).toContain(
      "v_change := public.admin_set_jury_voting_status(p_show_id, p_status)",
    );
    expect(migration).toContain(
      "legacy jury window mutation is retired; use studio2_apply_jury_voting_status",
    );
    expect(migration).toContain(
      "retired jury cas trigger primitive must not be invoked",
    );
    expect(migration).toContain(
      "revoke all on function public.admin_set_jury_voting_status(uuid, text)",
    );
    expect(migration).toContain(
      "from public, anon, authenticated, service_role",
    );
  });

  it("removes transport DML from the Jury window version table and proves drift closed", () => {
    expect(migration).toContain(
      "revoke insert, update, delete, truncate\n  on table public.studio2_jury_window_versions\n  from service_role",
    );
    expect(migration).toContain("do $proof$");
    expect(migration).toContain(
      "has_table_privilege('service_role', 'public.studio2_jury_window_versions', 'update')",
    );
    expect(migration).toContain(
      "obsolete jury window cas trigger remains attached",
    );
  });
});
