import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261023205700_v3_jury_share_edition_theme_authority.sql",
  ),
  "utf8",
);

function body(name: string) {
  const marker = `create or replace function ${name}(`;
  const start = migration.indexOf(marker);
  expect(start).toBeGreaterThanOrEqual(0);
  const next = migration.indexOf("create or replace function", start + marker.length);
  return migration.slice(start, next === -1 ? migration.length : next);
}

describe("System V3 Jury Share Edition theme authority", () => {
  it("registers as a forward-only additive S13 contract", () => {
    expect(migration).toContain("public.v3_register_migration_contract(");
    expect(migration).toContain("'v3.results.jury-share-edition-theme-authority-v1'");
    expect(migration).toContain("'forward_fix_only'");
    expect(migration).toContain("without duplicating generic theme or Jury truth");
  });

  it("stores only edition-scoped versioned render recipes, never ballots or image binaries", () => {
    expect(migration).toContain("private.v3_edition_jury_share_themes");
    expect(migration).toContain("edition_id uuid not null references public.editions(id) on delete restrict");
    expect(migration).toContain("unique (edition_id, version)");
    expect(migration).toContain("version integer not null check (version >= 1)");
    expect(migration).toContain("composition_json jsonb");
    expect(migration).toContain("composition_hash text");
    expect(migration).not.toContain("jury_share_votes");
    expect(migration).not.toContain("jury_share_ballots");
    expect(migration).not.toMatch(/image_(?:binary|blob)|bytea/i);
  });

  it("bounds composition and validation metadata instead of accepting arbitrary payload growth", () => {
    expect(migration).toContain("pg_column_size(composition_json) <= 131072");
    expect(migration).toContain("pg_column_size(validation_result) <= 32768");
    expect(body("public.studio2_save_jury_share_theme_draft")).toContain(
      "pg_column_size(p_composition) > 131072",
    );
    expect(body("public.v3_set_jury_share_theme_validation")).toContain(
      "pg_column_size(coalesce(p_validation_result, '{}'::jsonb)) > 32768",
    );
  });

  it("enforces one ready theme per edition and immutable activated composition", () => {
    expect(migration).toContain("v3_edition_jury_share_theme_one_ready_uidx");
    expect(migration).toContain("where state = 'ready'");
    const guard = body("private.v3_guard_jury_share_theme_revision");
    expect(guard).toContain("old.state <> 'draft'");
    expect(guard).toContain("new.composition_json is distinct from old.composition_json");
    expect(guard).toContain("Activated Jury Share Edition composition is immutable");
    expect(guard).toContain("Archived Jury Share Edition themes are terminal");
  });

  it("uses monotonic optimistic revisions for concurrent Organizer edits", () => {
    const guard = body("private.v3_guard_jury_share_theme_revision");
    expect(guard).toContain("new.revision <> old.revision + 1");
    expect(body("public.studio2_save_jury_share_theme_draft")).toContain(
      "v_before.revision <> p_expected_revision",
    );
    expect(body("public.studio2_activate_jury_share_theme")).toContain(
      "v_theme.revision <> p_expected_revision",
    );
    expect(body("public.studio2_archive_jury_share_theme")).toContain(
      "v_theme.revision <> p_expected_revision",
    );
    expect(migration).toContain("VERSION_CONFLICT");
  });

  it("requires trusted server validation before activation", () => {
    const validate = body("public.v3_set_jury_share_theme_validation");
    expect(validate).toContain("private.studio2_request_is_service_role()");
    expect(validate).toContain("Service role required for Jury Share theme validation");
    expect(migration).toContain(
      "grant execute on function public.v3_set_jury_share_theme_validation(\n  uuid, bigint, boolean, jsonb\n) to service_role;",
    );
    const activate = body("public.studio2_activate_jury_share_theme");
    expect(activate).toContain("v_theme.validation_state <> 'valid'");
    expect(activate).toContain("has not passed server validation");
  });

  it("uses canonical edition.manage authority rather than role-name shortcuts", () => {
    for (const name of [
      "public.studio2_save_jury_share_theme_draft",
      "public.studio2_activate_jury_share_theme",
      "public.studio2_archive_jury_share_theme",
      "public.studio2_jury_share_theme_state",
    ]) {
      expect(body(name)).toContain("studio2_access_allowed('edition.manage'");
      expect(body(name)).not.toContain("has_role(");
    }
  });

  it("makes draft, activate and archive mutations idempotent and receipted", () => {
    const save = body("public.studio2_save_jury_share_theme_draft");
    expect(save).toContain("private.studio2_claim_operation(");
    expect(save).toContain("'results.jury_share_theme.save_draft'");
    expect(save).toContain("'R1'");
    expect(save).toContain("private.studio2_complete_operation");

    const activate = body("public.studio2_activate_jury_share_theme");
    expect(activate).toContain("private.studio2_claim_operation(");
    expect(activate).toContain("'results.jury_share_theme.activate'");
    expect(activate).toContain("'R2'");
    expect(activate).toContain("private.studio2_complete_operation");

    const archive = body("public.studio2_archive_jury_share_theme");
    expect(archive).toContain("private.studio2_claim_operation(");
    expect(archive).toContain("'results.jury_share_theme.archive'");
    expect(archive).toContain("'R2'");
    expect(archive).toContain("private.studio2_complete_operation");
  });

  it("writes bounded audit evidence instead of copying full compositions into audit rows", () => {
    for (const action of [
      "jury_share_theme_draft_saved",
      "jury_share_theme_validation_recorded",
      "jury_share_theme_activated",
      "jury_share_theme_archived",
    ]) {
      expect(migration).toContain(`'${action}'`);
    }
    expect(migration).toContain("'compositionHash'");
    const auditSegments = migration.match(/insert into public\.admin_audit_log[\s\S]*?\);/g) ?? [];
    expect(auditSegments.length).toBeGreaterThanOrEqual(4);
    for (const segment of auditSegments) {
      expect(segment).not.toContain("'composition',");
      expect(segment).not.toContain("p_composition");
    }
  });

  it("uses archived versions for historical editions and never reconstructs history from the generic theme library", () => {
    const selection = body("private.v3_jury_share_edition_theme_selection");
    expect(selection).toContain("v_edition.status in ('completed', 'archived')");
    expect(selection).toContain("theme.state = 'archived'");
    expect(selection).toContain("historical_edition_theme_not_archived");
    expect(selection).not.toContain("public.themes");
    expect(selection).not.toContain("theme_colors");
  });

  it("archives the ready recipe only after edition completion for deliberate historical freezing", () => {
    const archive = body("public.studio2_archive_jury_share_theme");
    expect(archive).toContain("v_edition_status not in ('completed', 'archived')");
    expect(archive).toContain("Edition must be completed before its Jury Share theme is archived");
    expect(archive).toContain("set state = 'archived', revision = revision + 1");
  });

  it("feeds real Edition availability into the canonical Jury Share projection without changing ballot/result authority", () => {
    const projection = body("public.v3_jury_share_projection");
    expect(projection).toContain("private.v3_jury_share_projection_core(");
    expect(projection).toContain("private.v3_jury_share_theme_availability(v_edition_id)");
    expect(projection).toContain("jsonb_set(");
    expect(projection).toContain("'{projection,themes}'");
    expect(projection).toContain("'jury_share_cards_v1'");
  });

  it("keeps the private theme table out of browser CRUD", () => {
    expect(migration).toContain(
      "revoke all on table private.v3_edition_jury_share_themes\n  from public, anon, authenticated;",
    );
    expect(migration).toContain(
      "grant select, insert, update on table private.v3_edition_jury_share_themes\n  to service_role;",
    );
    expect(migration).not.toContain(
      "grant insert on table private.v3_edition_jury_share_themes to authenticated",
    );
  });
});
