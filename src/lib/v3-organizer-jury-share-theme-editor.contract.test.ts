import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  "src/components/admin/JuryShareEditionThemeEditor.tsx",
  "utf8",
);

describe("Organizer Jury Share Edition editor contract", () => {
  it("keeps Default and Liquid Glass Solaris-owned while Edition is configurable", () => {
    expect(source).toContain('title="Default"');
    expect(source).toContain('status="Always available"');
    expect(source).toContain('title="Edition"');
    expect(source).toContain('title="Liquid Glass"');
    expect(source).toContain('status="Solaris-managed"');
  });

  it("uses fixed sample data instead of hidden jury ballots for preview", () => {
    expect(source).toContain("ORGANIZER_JURY_SHARE_SAMPLE_ROWS");
    expect(source).toContain("Grand Final · sample data");
    expect(source).toContain("Hidden jury votes are never required for branding work");
    expect(source).not.toContain("jury_votes");
    expect(source).not.toContain("jury_ballot_submissions");
  });

  it("does not create browser-side backend authority", () => {
    expect(source).not.toContain("supabase");
    expect(source).not.toContain(".rpc(");
    expect(source).not.toContain(".from(");
    expect(source).not.toContain("service_role");
    expect(source).toContain("System remains authoritative");
  });

  it("offers structured composition controls instead of arbitrary executable styling", () => {
    expect(source).toContain("Artwork composition");
    expect(source).toContain("Score rows");
    expect(source).toContain("Header, footer and safe area");
    expect(source).toContain("no Custom CSS, Custom HTML or Custom JavaScript escape hatch");
    expect(source).not.toContain("dangerouslySetInnerHTML");
    expect(source).not.toContain("contentEditable");
    expect(source).not.toContain('type="url"');
  });

  it("keeps Draft and Ready transitions explicit for the later governed adapter", () => {
    expect(source).toContain("Save draft");
    expect(source).toContain("Validate & mark Ready");
    expect(source).toContain("onSaveDraft");
    expect(source).toContain("onRequestReady");
    expect(source).toContain("onArchive");
  });

  it("preserves read-only access when the viewer lacks manage capability", () => {
    expect(source).toContain("Read-only access");
    expect(source).toContain("!canManage");
    expect(source).toContain("disabled = busy || !canManage || state === \"archived\"");
  });
});
