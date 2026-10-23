import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync(
  "src/routes/_authenticated/admin/design.$slug.share-graphics.tsx",
  "utf8",
);

describe("Organizer Jury Share route integration", () => {
  it("binds the workspace to exact shell-owned edition context", () => {
    expect(route).toContain("useAdminContext()");
    expect(route).toContain("edition.id !== editionId");
    expect(route).toContain('title="Edition context mismatch"');
    expect(route).toContain("will not substitute a different edition");
    expect(route).not.toContain("editions[0]");
    expect(route).not.toContain("sort((left, right)");
  });

  it("does not introduce a second Jury Share mutation or data authority", () => {
    expect(route).not.toContain("supabase");
    expect(route).not.toContain("jury_votes");
    expect(route).not.toContain("jury_ballot_submissions");
    expect(route).not.toContain("results").toBeFalsy;
    expect(route).toContain("JuryShareEditionThemeEditor");
  });

  it("fails Ready closed until exact-version renderer evidence exists", () => {
    expect(route).toContain("renderValidationReady={false}");
    expect(route).toContain("Ready stays fail-closed");
    expect(route).toContain("exact saved version");
  });

  it("passes only edition-owned visual identity into the editor", () => {
    expect(route).toContain("artworkStoragePath={edition.artwork_storage_path ?? null}");
    expect(route).toContain("artworkUrl={edition.artwork_url ?? null}");
    expect(route).toContain("editionId={edition.id}");
  });
});
