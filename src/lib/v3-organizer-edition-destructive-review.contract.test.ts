import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = readFileSync(
  "src/routes/_authenticated/admin/editions.tsx",
  "utf8",
);

describe("V3 Organizer edition destructive review boundary", () => {
  it("prepares an exact reviewed edition scope instead of mutating from the action menu", () => {
    expect(source).toContain("prepareEditionLifecycleReview");
    expect(source).toContain('prepareEditionLifecycleReview(edition, "private")');
    expect(source).toContain('intent: "private"');
    expect(source).toContain("<AdminConfirmSheet");
    expect(source).toContain("confirmationText={lifecycleReview?.editionName}");
    expect(source).toContain("commands.push({ preview, operationId: crypto.randomUUID() })");
    expect(source).not.toMatch(/onClick=\{.*makePrivate\(edition\)/);
    expect(source).toContain("editionLifecycleFingerprint");
    expect(source).toContain("showLifecycleFingerprint");
    expect(source).toContain("publicationControlFingerprints");
    expect(source).not.toContain("setPrivateEdition(edition)");
    expect(source).not.toContain("setDeleteEdition(edition)");
  });

  it("re-reads exact edition dependencies and fails closed on review drift", () => {
    expect(source).toContain("revalidateEditionLifecycleReview");
    expect(source).toContain('supabase.from("editions").select("*").eq("id", editionId).maybeSingle()');
    expect(source).toContain('supabase.from("shows").select("*").eq("edition_id", editionId)');
    expect(source).toContain('supabase.from("participants").select("id").eq("edition_id", editionId)');
    expect(source).toContain("loadShowPublicationControls(editionId)");
    expect(source).toContain("Edition state changed after this review opened");
    expect(source).toContain("Nothing was applied");
    expect(source).toContain("await readEditionLifecycleScope(review.editionId)");
    for (const fingerprint of ["review.editionLifecycleFingerprint", "review.showLifecycleFingerprint", "review.participantFingerprint", "review.publicationControlFingerprints"]) expect(source).toContain(fingerprint);
    const apply = source.slice(source.indexOf("const makePrivate = async"));
    expect(apply.indexOf("await revalidateEditionLifecycleReview(review)")).toBeLessThan(apply.indexOf("await applyReviewedEditionPublication(review, applyShowPublicationChange)"));
    expect(source).toContain("if (!review.attempted) await revalidateEditionLifecycleReview(review)");
  });

  it("prohibits permanent edition deletion instead of exposing an irreversible action", () => {
    // Original invariant: never allow casual irreversible deletion. Retirement
    // now prohibits that action in both UI and API; archive preserves history.
    expect(source).toContain("Permanent deletion is intentionally not offered here");
    expect(source).toContain("canonical lifecycle/archive authority");
    expect(source).not.toContain('prepareEditionLifecycleReview(edition, "delete")');
    expect(source).not.toMatch(/\.delete\(/);
    const authority = readFileSync("supabase/migrations/20261027204500_v3_edition_authority.sql", "utf8");
    expect(authority).toContain("revoke all on function public.admin_confirmation_delete_edition(uuid)");
    expect(authority).toContain("from public, anon, authenticated, service_role");
    const proof = readFileSync(".github/tests/v3-edition-authority.sql", "utf8");
    expect(proof).toContain("has_function_privilege('service_role','public.admin_confirmation_delete_edition(uuid)','EXECUTE')");
  });

  it("preserves canonical publication and edition authorities without claiming cross-show atomicity", () => {
    expect(source).toContain("previewShowPublicationChange");
    expect(source).toContain("applyReviewedEditionPublication(review, applyShowPublicationChange)");
    expect(source).toContain("await createEdition({");
    expect(source).not.toMatch(/\.from\("editions"\)\s*\.(?:update|delete)/);
    expect(source).toContain("This multi-show batch is not atomic; partial progress may exist");
    expect(source).toContain("Retry this same review to recover its exact operation receipts");
    expect(source).toContain("Official lifecycle and historical results remain governed by their separate authorities");
    const apply = readFileSync("src/lib/edition-publication-review.ts", "utf8");
    expect(apply).toContain("command.preview.editionId !== review.editionId");
    expect(apply).toContain('command.preview.targetState !== "hidden"');
    expect(apply).toContain("idempotencyKey: command.operationId");
    expect(apply).toContain("another publication is active");
    expect(apply).not.toContain('.from("results")');
  });
});
