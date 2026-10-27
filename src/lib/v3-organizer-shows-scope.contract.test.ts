import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/routes/_authenticated/admin/shows/$slug.tsx", "utf8");
const commands = readFileSync("src/lib/show-definition-command.ts", "utf8");

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

  it("rechecks route/entity scope before governed show operations", () => {
    expect(source).toContain("function assertEditionScope(target?: Show | null)");
    expect(source).toContain("target.edition_id !== edition.id");
    expect(source).toContain("Edition context changed before the show command");
    expect(source).toContain("!showModeTarget || !edition || !assertEditionScope(showModeTarget) || busy");
    expect(source).toContain("async function applyShowModeReview()");
    expect(source).toContain("organizerEditionId !== review.editionId");
    expect(source).toContain('.select("id,edition_id,name,broadcast_config")');
    expect(source).toContain("!sameShowMode(showModeSnapshot(current, currentRevision), review.before)");
    expect(source).toContain("!edition || !draft.name.trim() || !assertEditionScope()");
    expect(source).toContain("!target || !assertEditionScope(target)");
    expect(source).toContain("const review = deleteTarget;");
    expect(source).toContain("if (!review || busy) return;");
    expect(source).toContain("edition.id !== review.editionId");
  });

  it("removes direct browser DML on shows and uses canonical commands", () => {
    expect(source).toContain("await createShow({");
    expect(source).toContain("await updateShowDefinition({");
    expect(source).toContain("await deleteShowDefinition({");
    expect(source).toContain("await applyShowRuntimeChange({");
    expect(source).not.toContain('supabase.from("shows").insert(');
    expect(source).not.toContain('(supabase.from("shows") as any)\n          .update(');
    expect(source).not.toContain('(supabase.from("shows") as any)\n        .delete()');
    expect(commands).toContain('"v3_create_show"');
    expect(commands).toContain('"v3_update_show_definition"');
    expect(commands).toContain('"v3_delete_show"');
  });
});
