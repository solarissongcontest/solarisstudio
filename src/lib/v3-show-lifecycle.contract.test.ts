import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20261019211000_v3_show_lifecycle_commands.sql",
  "utf8",
);

describe("V3 canonical show lifecycle command contract", () => {
  it("registers the migration under the S13 forward-only contract", () => {
    expect(migration).toContain("public.v3_register_migration_contract(");
    expect(migration).toContain("'v3.o6.show-lifecycle-commands'");
    expect(migration).toContain("'forward_fix_only'");
  });

  it("gives every show a monotonic canonical version including compatibility writes", () => {
    expect(migration).toContain("add column if not exists version bigint not null default 1");
    expect(migration).toContain("private.studio2_bump_show_version()");
    expect(migration).toContain("before update on public.shows");
    expect(migration).toContain("new.version := old.version + 1");
  });

  it("derives destructive dependencies from database foreign keys instead of a stale browser list", () => {
    expect(migration).toContain("private.studio2_show_dependency_snapshot");
    expect(migration).toContain("pg_catalog.pg_constraint");
    expect(migration).toContain("constraint_row.confrelid = 'public.shows'::regclass");
    expect(migration).toContain("'blockingReferenceCount'");
    expect(migration).toContain("studio2_show_publication_controls");
  });

  it("binds preview and every mutation to exact edition.manage authority", () => {
    expect(migration.match(/studio2_access_allowed\('edition\.manage', p_edition_id, false\)/g)?.length)
      .toBeGreaterThanOrEqual(5);
    expect(migration).toContain("public.studio2_show_lifecycle_preview");
    expect(migration).toContain("show_row.edition_id = p_edition_id");
  });

  it("uses one semantic S2 operation identity for every consequential command", () => {
    for (const command of ["show.create", "show.update", "show.mode.update", "show.delete"]) {
      expect(migration).toContain(`'${command}'`);
    }
    expect(migration.match(/private\.studio2_claim_operation\(/g)?.length).toBe(4);
    expect(migration.match(/private\.studio2_complete_operation\(/g)?.length).toBe(4);
    expect(migration).toContain("public.studio2_reconcile_operation(v_operation_id)");
    expect(migration).toContain("'receiptId', v_operation_id");
  });

  it("rejects stale show writes with deterministic HTTP 409 conflicts", () => {
    expect(migration.match(/p_expected_version/g)?.length).toBeGreaterThan(20);
    expect(migration.match(/raise sqlstate 'PT409' using message = 'VERSION_CONFLICT'/g)?.length)
      .toBeGreaterThanOrEqual(5);
  });

  it("keeps Show Mode lifecycle timestamps server-derived", () => {
    expect(migration).toContain("public.studio2_update_show_mode_v3");
    expect(migration).toContain("v_live_started := coalesce");
    expect(migration).toContain("v_results_started := coalesce");
    expect(migration).toContain("v_ended_at := coalesce");
    expect(migration).toContain("jsonb_set(");
    expect(migration).toContain("'{showMode}'");
  });

  it("makes permanent deletion R3, freshly authenticated and commit-time fail closed", () => {
    expect(migration).toContain("'show.delete'");
    expect(migration).toContain("'R3'");
    expect(migration).toContain("private.studio2_require_fresh_auth(300)");
    expect(migration).toContain("v_preflight := private.studio2_show_delete_preflight");
    expect(migration).toContain("'dependent_records_exist'");
    expect(migration).toContain("message = 'STATE_CHANGED'");
    expect(migration).toContain("'show_deleted'");
  });

  it("writes canonical Organizer audit evidence for all four show mutations", () => {
    expect(migration.match(/insert into public\.admin_audit_log/g)?.length).toBe(4);
    expect(migration).toContain("'show_created'");
    expect(migration).toContain("'show_updated'");
    expect(migration).toContain("'show_mode_updated'");
    expect(migration).toContain("'show_deleted'");
  });

  it("does not expose the authoritative commands to anonymous callers", () => {
    expect(migration).toContain("from public, anon");
    expect(migration).toContain("to authenticated");
    expect(migration).not.toContain("to anon, authenticated");
  });
});
