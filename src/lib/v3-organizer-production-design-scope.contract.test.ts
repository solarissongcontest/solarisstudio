import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/routes/_authenticated/admin/design.$slug.tsx", "utf8");

describe("V3 Organizer Production design exact-edition boundary", () => {
  it("binds route reads to the route edition instead of broad Organizer data", () => {
    expect(source).toContain("useAdminContext()");
    expect(source).toContain("editionId: organizerEditionId");
    expect(source).toContain("useShows(edition?.id)");
    expect(source).toContain("useParticipants(edition?.id)");
    expect(source).not.toContain("useAllShows");
    expect(source).not.toContain("useAllParticipants");
  });

  it("fails closed when the route edition and Organizer context disagree", () => {
    expect(source).toContain("organizerEditionId !== edition.id");
    expect(source).toContain('title="Confirming edition context"');
    expect(source).toContain(
      "will not save into a different edition while context is changing",
    );
    expect(source).toContain("disabled={saving || !previewShow || organizerEditionId !== edition.id}");
  });

  it("rechecks exact edition scope immediately before every legacy production mutation", () => {
    expect(source).toContain("function assertEditionScope()");
    expect(source).toContain("Edition context changed before this Production save");
    expect(source).toContain("!assertEditionScope()) return;");
    expect(source.match(/!assertEditionScope\(\)\) return;/g)).toHaveLength(3);
  });

  it("does not pretend the legacy mutation path is already canonical V3 authority", () => {
    expect(source).toContain("supabase");
    expect(source).toContain('.from("themes")');
    expect(source).toContain('.from("editions")');
    expect(source).toContain('.from("shows")');
    expect(source).not.toContain("studio2_apply_production_design");
    expect(source).not.toContain("production.design.apply");
  });
});
