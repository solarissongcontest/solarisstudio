import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/routes/_authenticated/admin/shows/$slug.tsx", "utf8");

describe("V3 Organizer Shows exact-edition boundary", () => {
  it("binds the workspace to exact Organizer edition context", () => {
    expect(source).toContain("useAdminContext()");
    expect(source).toContain("editionId: organizerEditionId");
    expect(source).toContain("organizerEditionId !== edition.id");
    expect(source).toContain('title="Confirming edition context"');
    expect(source).toContain(
      "will not create, edit or delete show state in a different edition while context is changing",
    );
  });

  it("binds every consequential Show command to exact edition and canonical preflight", () => {
    expect(source).toContain("function assertEditionScope(target?: Show | null)");
    expect(source).toContain("target.edition_id !== edition.id");
    expect(source).toContain("Edition context changed before the show command");
    expect(source).toContain("previewShowLifecycle({ editionId: edition.id, showId: draft.id })");
    expect(source).toContain("previewShowLifecycle({ editionId: edition.id, showId: showModeTarget.id })");
    expect(source).toContain("previewShowLifecycle({ editionId: edition.id, showId: show.id })");
    expect(source).toContain("organizerEditionId !== review.editionId");
    expect(source).toContain("expectedVersion: review.expectedVersion");
  });

  it("uses canonical Show lifecycle commands instead of direct browser CRUD", () => {
    expect(source).toContain('from "@/lib/show-lifecycle-authority"');
    expect(source).toContain("createShow({");
    expect(source).toContain("updateShow({");
    expect(source).toContain("updateShowMode({");
    expect(source).toContain("executeShowDelete({");
    expect(source).not.toContain('supabase.from("shows")');
    expect(source).not.toContain('.from("shows")');
    expect(source).not.toContain("studio2_create_show_v3");
    expect(source).not.toContain("studio2_update_show_v3");
    expect(source).not.toContain("studio2_update_show_mode_v3");
    expect(source).not.toContain("studio2_delete_show_v3");
  });
});
