import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const route = readFileSync("src/routes/_authenticated/admin/editions.tsx", "utf8");
const workspace = readFileSync("src/components/admin/AllEditionsWorkspaceV3.tsx", "utf8");
const client = readFileSync("src/lib/v3-all-editions-lifecycle.ts", "utf8");
const migration = readFileSync(
  "supabase/migrations/20261020092500_v3_all_editions_lifecycle_authority.sql",
  "utf8",
);

describe("V3 Organizer edition lifecycle review boundary", () => {
  it("routes the All Editions screen through the governed workspace", () => {
    expect(route).toContain("AllEditionsWorkspaceV3");
    expect(route).not.toContain("supabase");
    expect(workspace).toContain("previewEditionMakePrivateV3(edition.id)");
    expect(workspace).toContain("makeEditionPrivateV3(review, review.reason)");
  });

  it("uses exact aggregate CAS instead of browser snapshots", () => {
    expect(migration).toContain("studio2_all_editions_versions");
    expect(migration).toContain("p_expected_version bigint");
    expect(migration).toContain("v_before_version is distinct from p_expected_version");
    expect(migration).toContain("using errcode = 'PT409'");
    expect(workspace).toContain("exact aggregate revision");
    expect(client).toContain("p_expected_version: preview.stateVersion");
  });

  it("keeps the cross-domain make-private action R3 and deliberate", () => {
    expect(migration).toContain("'edition.make_private'");
    expect(migration).toContain("'R3'");
    expect(migration).toContain("private.studio2_require_fresh_auth(300)");
    expect(workspace).toContain("Reason");
    expect(workspace).toContain("review.reason.trim().length < 5");
    expect(workspace).toContain("confirmationText={privateReview?.displayLabel}");
    expect(workspace).toContain("authentication from the last five minutes");
  });

  it("reuses canonical show publication authority in one transaction", () => {
    expect(migration).toContain("public.studio2_apply_show_publication_change(");
    expect(migration).toContain("p_idempotency_key || ':hide:' || v_control.show_id::text");
    expect(migration).toContain("update public.editions\n  set published = false");
    expect(workspace).not.toContain("applyShowPublicationChange");
    expect(workspace).not.toContain("loadShowPublicationControls");
    expect(workspace).not.toContain("previewShowPublicationChange");
  });

  it("retires permanent browser deletion instead of cascading historical truth", () => {
    expect(migration).toContain("Permanent browser edition deletion is retired");
    expect(workspace).toContain("Archive / retire edition");
    expect(workspace).toContain("Permanent edition deletion is retired");
    expect(workspace).not.toContain("Delete edition");
    expect(workspace).not.toContain('.from("editions")');
  });

  it("produces durable audit, event and operation evidence", () => {
    expect(migration).toContain("edition_made_private");
    expect(migration).toContain("private.v3_emit_domain_event(");
    expect(migration).toContain("'edition.changed'");
    expect(migration).toContain("private.studio2_complete_operation");
    expect(client).toContain('"studio2_reconcile_operation"');
  });
});
