import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync(
  "src/routes/_authenticated/admin/share-graphics.$slug.tsx",
  "utf8",
);
const adapter = readFileSync("src/lib/v3-jury-share-theme.ts", "utf8");

describe("Organizer V3 Jury Share Edition theme editor", () => {
  it("binds the workspace to exact Organizer edition context", () => {
    expect(route).toContain("organizerEditionId === edition.id");
    expect(route).toContain("organizerEditionId !== review.editionId");
    expect(route).toContain("No newest-edition fallback is used");
  });

  it("keeps Default and Liquid Glass read-only while editing only Edition", () => {
    expect(route).toContain('title="Default"');
    expect(route).toContain('title="Liquid Glass"');
    expect(route).toContain('title="Edition"');
    expect(route).toContain("This is the only editable design here");
  });

  it("never loads hidden Jury votes to construct the branding preview", () => {
    expect(route).toContain("SAMPLE_VOTES");
    expect(route).toContain("non-sensitive sample votes");
    expect(route).not.toContain("jury_votes");
    expect(route).not.toContain("jury_ballot_submissions");
    expect(adapter).not.toContain('.from("jury_');
  });

  it("uses structured recipe controls instead of arbitrary styling inputs", () => {
    expect(adapter).toContain("JuryShareThemeComposition");
    expect(adapter).toContain("safeArea");
    expect(route).toContain("never arbitrary CSS, HTML, JavaScript or remote URLs");
    expect(route).not.toMatch(/textarea[^>]+css/i);
    expect(route).not.toMatch(/textarea[^>]+html/i);
    expect(route).not.toMatch(/textarea[^>]+javascript/i);
  });

  it("uses only the System-owned theme snapshot and command RPCs for authority", () => {
    expect(adapter).toContain('rpc("studio2_jury_share_theme_snapshot"');
    expect(adapter).toContain('rpc("studio2_save_jury_share_theme_draft"');
    expect(adapter).toContain('rpc("studio2_set_jury_share_theme_state"');
    expect(adapter).toContain('rpc("studio2_reconcile_operation"');
    expect(route).not.toContain("supabase.from(");
    expect(adapter).not.toContain("edition_jury_share_themes").toBeTruthy;
  });

  it("freezes one reviewed operation identity and reconciles uncertain outcomes", () => {
    expect(route).toContain("createJuryShareThemeOperationIdentity");
    expect(route).toContain("pendingReview.identity.operationId");
    expect(route).toContain("reconcileJuryShareThemeOperation(review.identity.operationId)");
    expect(route).toContain("preserved; retrying this same review will not mint a second operation");
  });

  it("requires server validation before offering Ready activation", () => {
    expect(route).toContain("validation?.valid");
    expect(route).toContain('latest.state === "draft" || latest.state === "invalid"');
    expect(route).toContain("Server validation remains authoritative");
    expect(route).toContain("Ready revalidates again before activation");
  });
});
