import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  "src/routes/_authenticated/admin/beta-test.tsx",
  "utf8",
);

const scenarios = readFileSync(
  "src/features/admin-beta-test/sections-v2.ts",
  "utf8",
);

describe("V3 Organizer Acceptance Test", () => {
  it("requires the exact selected edition instead of substituting the newest edition", () => {
    expect(source).toContain(
      "const activeEdition = editions.find((edition) => edition.id === editionId) ?? null;",
    );
    expect(source).not.toContain(
      "[...editions].sort((a, b) => (b.edition_number ?? -1) - (a.edition_number ?? -1))[0]",
    );
    expect(source).toContain('title="Choose an edition"');
    expect(source).toContain(
      "Solaris will not substitute the newest edition or mix acceptance drafts across editions.",
    );
  });

  it("isolates drafts and submission markers by edition", () => {
    expect(source).toContain(
      "`${ADMIN_BETA_DRAFT_KEY}:${activeEdition.id}`",
    );
    expect(source).toContain(
      "`${ADMIN_BETA_SUBMITTED_KEY}:${activeEdition.id}`",
    );
    expect(source).toContain("window.localStorage.getItem(draftKey)");
    expect(source).toContain("window.localStorage.setItem(submittedKey, \"true\")");
    expect(source).toContain("window.localStorage.removeItem(draftKey)");
  });

  it("binds submitted acceptance evidence to the exact edition", () => {
    expect(source).toContain("activeEdition.id !== editionId");
    expect(source).toContain("organizerEditionId: activeEdition.id");
    expect(source).toContain("organizerEditionSlug: activeEdition.slug");
    expect(source).toContain("organizerEditionLabel: editionLabel(activeEdition)");
  });

  it("treats acceptance as scenario execution rather than page opening", () => {
    expect(source).toContain("Test scenarios, not page availability.");
    expect(source).toContain("Merely opening a route is not acceptance evidence.");
    expect(source).toContain("Submit acceptance evidence");
    expect(scenarios).toContain(
      "Choose “Tested properly” only if you actually explored the normal workflow, not just opened the page.",
    );
    expect(scenarios).toContain("Two-admin concurrent editing");
    expect(scenarios).toContain("Mobile layout & touch behavior");
    expect(scenarios).toContain("End-to-end contest rehearsal");
  });
});
