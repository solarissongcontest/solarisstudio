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
    expect(source).toContain('prepareEditionLifecycleReview(edition, "delete")');
    expect(source).toContain("editionLifecycleFingerprint");
    expect(source).toContain("showLifecycleFingerprint");
    expect(source).toContain("publicationControlFingerprints");
    expect(source).not.toContain("setPrivateEdition(edition)");
    expect(source).not.toContain("setDeleteEdition(edition)");
  });

  it("re-reads exact edition dependencies and fails closed on review drift", () => {
    expect(source).toContain("revalidateEditionLifecycleReview");
    expect(source).toContain('supabase.from("editions").select("*").eq("id", review.editionId).maybeSingle()');
    expect(source).toContain('supabase.from("shows").select("*").eq("edition_id", review.editionId)');
    expect(source).toContain('supabase.from("participants").select("id").eq("edition_id", review.editionId)');
    expect(source).toContain("loadShowPublicationControls(review.editionId)");
    expect(source).toContain("Edition state changed after this review opened");
    expect(source).toContain("Nothing was applied");
  });

  it("keeps deletion Tier-4 deliberate with a reason and exact-name confirmation", () => {
    expect(source).toContain("Reason for permanent deletion");
    expect(source).toContain("Why is permanent deletion required instead of archive?");
    expect(source).toContain("lifecycleReview.reason.trim().length < 5");
    expect(source).toContain("confirmationText");
    expect(source).toContain("to confirm permanent deletion");
    expect(source).toContain("Archive is safer when historical truth must remain available");
  });

  it("preserves existing authorities and does not pretend System #1068 is solved", () => {
    expect(source).toContain("previewShowPublicationChange");
    expect(source).toContain("applyShowPublicationChange");
    expect(source).toContain('.from("editions")\n          .delete()');
    expect(source).toContain("System #1068 still owns the canonical edition lifecycle command");
    expect(source).toContain("no edition CAS, durable operation receipt or atomic cross-domain preflight");
    expect(source).toContain("Do not treat this review as V3 lifecycle parity");
  });
});
