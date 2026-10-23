import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const editor = readFileSync(
  resolve(process.cwd(), "src/components/admin/JuryShareEditionThemeEditor.tsx"),
  "utf8",
);
const client = readFileSync(
  resolve(process.cwd(), "src/lib/v3-jury-share-theme-client.ts"),
  "utf8",
);

describe("Organizer V3 Jury Share Edition editor contract", () => {
  it("uses the canonical System snapshot and commands instead of direct browser table writes", () => {
    expect(client).toContain('"studio2_jury_share_theme_snapshot"');
    expect(client).toContain('"studio2_save_jury_share_theme_draft"');
    expect(client).toContain('"studio2_set_jury_share_theme_state"');
    expect(client).toContain('"studio2_reconcile_operation"');
    expect(client).not.toContain('.from("edition_jury_share_themes")');
    expect(client).not.toContain(".insert(");
    expect(client).not.toContain(".update(");
    expect(client).not.toContain(".delete(");
  });

  it("never loads real Jury ballots merely to style a preview", () => {
    expect(editor).toContain("SAMPLE_VOTES");
    expect(editor).toContain("Non-sensitive sample vote data only");
    expect(editor).not.toContain("jury_votes");
    expect(editor).not.toContain("jury_ballot_submissions");
    expect(editor).not.toContain("v3_jury_share_projection");
  });

  it("exposes structured theme controls rather than arbitrary executable styling", () => {
    expect(editor).toContain("Use Edition artwork");
    expect(editor).toContain("Inherit Edition scoreboard");
    expect(editor).toContain("Story safe area");
    expect(client).toContain("JuryShareEditionComposition");
    expect(editor).not.toContain("Custom CSS");
    expect(editor).not.toContain("Custom HTML");
    expect(editor).not.toContain("Custom JavaScript");
    expect(client).not.toContain("customCSS");
    expect(client).not.toContain("customHTML");
    expect(client).not.toContain("customJavaScript");
  });

  it("binds all reads and writes to the explicit Edition identity", () => {
    expect(editor).toContain("editionId");
    expect(client).toContain("p_edition_id: editionId");
    expect(client).toContain("p_edition_id: request.editionId");
    expect(client).toContain("different edition than requested");
  });

  it("fails Ready closed until canonical server and renderer evidence both exist", () => {
    expect(editor).toContain("serverValidation?.valid");
    expect(editor).toContain("renderValidationReady");
    expect(editor).toContain("Authoritative PNG/JPEG render validation");
    expect(editor).toContain("disabled={Boolean(readyBlockedReason)");
    expect(editor).toContain("pretty browser preview as authority");
  });

  it("protects uncertain outcomes with one operation identity and reconciliation rather than blind retries", () => {
    expect(client).toContain("createJuryShareThemeOperationIdentity");
    expect(client).toContain("p_operation_id: request.operationId");
    expect(client).toContain("p_idempotency_key: request.idempotencyKey");
    expect(client).toContain("reconcileMutation(request.operationId, client)");
  });

  it("represents the required Organizer Draft to Ready review flow without mutating historical versions in-place", () => {
    expect(editor).toContain("Save draft");
    expect(editor).toContain("Mark Ready");
    expect(editor).toContain("Archive / freeze");
    expect(editor).toContain("later edit creates a new draft version");
    expect(editor).toContain("Archived Jury Share theme versions are immutable");
  });
});
