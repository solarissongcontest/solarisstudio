import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20261020092500_v3_all_editions_lifecycle_authority.sql",
  "utf8",
);
const client = readFileSync("src/lib/v3-all-editions-lifecycle.ts", "utf8");
const route = readFileSync("src/routes/_authenticated/admin/editions.tsx", "utf8");
const workspace = readFileSync("src/components/admin/AllEditionsWorkspaceV3.tsx", "utf8");

function functionBody(name: string) {
  const marker = `create or replace function ${name}`;
  const start = migration.indexOf(marker);
  expect(start, `${name} is missing`).toBeGreaterThanOrEqual(0);
  const next = migration.indexOf("\ncreate or replace function ", start + marker.length);
  return migration.slice(start, next >= 0 ? next : migration.length);
}

describe("V3 Organizer All Editions lifecycle authority", () => {
  it("registers the additive lifecycle migration", () => {
    expect(migration).toContain("'v3.organizer.all-editions-lifecycle'");
    expect(migration).toContain("'forward_fix_only'");
    expect(migration).toContain("Permanent browser deletion is retired");
  });

  it("prevents the browser from recreating create/delete/visibility authority", () => {
    const guard = functionBody("private.studio2_guard_all_editions_browser_write");
    expect(guard).toContain("current_user not in ('authenticated', 'anon')");
    expect(guard).toContain("Edition creation must use the governed V3 edition command");
    expect(guard).toContain("Permanent browser edition deletion is retired");
    expect(guard).toContain("Edition visibility must use the governed V3 edition command");
    expect(migration).toContain("before insert or delete on public.editions");
    expect(migration).toContain("before update of published on public.editions");
  });

  it("creates private drafts through global capability, semantic idempotency and a serialized uniqueness check", () => {
    const preview = functionBody("public.studio2_edition_create_draft_preview");
    const apply = functionBody("public.studio2_create_edition_draft_v3");

    expect(preview).toContain("studio2_access_allowed('edition.manage', null, false)");
    expect(preview).toContain("edition.edition_number = p_edition_number");
    expect(preview).toContain("edition.slug = v_slug");
    expect(preview).toContain("private.studio2_platform_mutation_allowed('edition.create_draft')");

    expect(apply).toContain("private.studio2_claim_operation(");
    expect(apply).toContain("'edition.create_draft'");
    expect(apply).toContain("pg_advisory_xact_lock");
    expect(apply).toContain("studio2_edition_create_draft_preview(");
    expect(apply).toContain("insert into public.editions");
    expect(apply).toContain("'draft',\n    false");
    expect(apply).toContain("edition_draft_created");
    expect(apply).toContain("private.v3_emit_domain_event(");
    expect(apply).toContain("private.studio2_complete_operation");
    expect(apply).toContain("public.studio2_reconcile_operation(v_operation_id)");
  });

  it("builds one aggregate CAS revision over edition visibility and child publication controls", () => {
    expect(migration).toContain("private.studio2_all_editions_versions");
    expect(migration).toContain("studio2_all_editions_edition_version");
    expect(migration).toContain("studio2_all_editions_publication_version");

    const preview = functionBody("public.studio2_edition_make_private_preview");
    expect(preview).toContain("'stateVersion', v_version");
    expect(preview).toContain("'showPublicationControls', v_controls");
    expect(preview).toContain("control.state in ('public', 'scheduled')");
  });

  it("makes an edition private atomically by reusing the canonical show-publication operation", () => {
    const apply = functionBody("public.studio2_apply_edition_make_private_v3");

    expect(apply).toContain("'edition.make_private'");
    expect(apply).toContain("'R3'");
    expect(apply).toContain("for update");
    expect(apply).toContain("v_before_version is distinct from p_expected_version");
    expect(apply).toContain("using errcode = 'PT409'");
    expect(apply).toContain("private.studio2_require_fresh_auth(300)");
    expect(apply).toContain("public.studio2_apply_show_publication_change(");
    expect(apply).toContain("'hidden'");
    expect(apply).toContain("p_idempotency_key || ':hide:' || v_control.show_id::text");
    expect(apply).toContain("update public.editions\n  set published = false");
    expect(apply).not.toContain("status = 'draft'");
    expect(apply).toContain("edition_made_private");
    expect(apply).toContain("private.v3_emit_domain_event(");
    expect(apply).toContain("private.studio2_complete_operation");
  });

  it("does not invent a second archive command", () => {
    expect(migration).not.toContain("studio2_archive_edition_v3");
    expect(migration).not.toContain("edition.archive");
    expect(workspace).toContain("Archive / retire edition");
    expect(workspace).toContain("Permanent browser deletion is retired");
  });

  it("reconciles uncertain results rather than blindly retrying", () => {
    expect(client).toContain('"studio2_reconcile_operation"');
    expect(client).toContain("Never create a second mutation");
    expect(client).toContain("edition-create-draft");
    expect(client).toContain("edition-make-private");
    expect(client).toContain("p_expected_version: preview.stateVersion");
  });

  it("cuts the route and workspace off from direct edition lifecycle writes", () => {
    expect(route).toContain("AllEditionsWorkspaceV3");
    expect(route).not.toContain("supabase");

    expect(workspace).toContain("previewEditionDraftV3");
    expect(workspace).toContain("createEditionDraftV3");
    expect(workspace).toContain("previewEditionMakePrivateV3");
    expect(workspace).toContain("makeEditionPrivateV3");

    expect(workspace).not.toContain('.from("editions")');
    expect(workspace).not.toContain("applyShowPublicationChange");
    expect(workspace).not.toContain("loadShowPublicationControls");
    expect(workspace).not.toContain("previewShowPublicationChange");
    expect(workspace).not.toContain("Delete edition");
  });

  it("makes R3 consequence review visible before apply", () => {
    expect(workspace).toContain("one database transaction");
    expect(workspace).toContain("exact aggregate revision");
    expect(workspace).toContain("authentication from the last five minutes");
    expect(workspace).toContain("child show-publication operations");
    expect(workspace).toContain("confirmationText={privateReview?.displayLabel}");
  });
});
