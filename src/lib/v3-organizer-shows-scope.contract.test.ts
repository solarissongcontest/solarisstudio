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

  it("rechecks route and entity scope immediately before legacy show mutations", () => {
    expect(source).toContain("function assertEditionScope(target?: Show | null)");
    expect(source).toContain("target.edition_id !== edition.id");
    expect(source).toContain("Edition context changed before the show command");
    expect(source).toContain("!showModeTarget || !assertEditionScope(showModeTarget)");
    expect(source).toContain("!edition || !draft.name.trim() || !assertEditionScope()");
    expect(source).toContain("!target || !assertEditionScope(target)");
    expect(source).toContain("!deleteTarget || !assertEditionScope(deleteTarget)");
  });

  it("does not disguise the legacy CRUD path as canonical V3 authority", () => {
    expect(source).toContain('supabase.from("shows")');
    expect(source).toContain('.update(');
    expect(source).toContain('.insert(');
    expect(source).toContain('.delete()');
    expect(source).not.toContain("studio2_execute_show_operation");
    expect(source).not.toContain("show.lifecycle.apply");
  });
});
