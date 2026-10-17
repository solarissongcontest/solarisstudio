import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/lib/studio2-communications.ts", "utf8");

function functionBody(name: string) {
  const start = source.indexOf(`export async function ${name}`);
  expect(start, `${name} should exist`).toBeGreaterThanOrEqual(0);
  const nextExport = source.indexOf("\nexport async function ", start + 1);
  return source.slice(start, nextExport === -1 ? source.length : nextExport);
}

describe("V3 Organizer Communications exact-edition boundary", () => {
  it("requires an explicit edition for Organizer notice lists and rejects foreign rows", () => {
    expect(source).toContain("const scopedEditionId = requireEditionId(editionId);");
    expect(source).toContain(".eq('edition_id', scopedEditionId)");
    expect(source).toContain(
      "noticeRows.some((row) => row.edition_id !== scopedEditionId)",
    );
  });

  it("requires edition scope when building create/update draft arguments", () => {
    expect(source).toContain("const editionId = requireEditionId(input.editionId);");
    expect(source).toContain("p_edition_id: editionId");
  });

  it("proves notice ownership before an update and validates returned identity + edition", () => {
    const update = functionBody("updateStudio2NoticeDraft");
    const guardIndex = update.indexOf("await assertNoticeInEdition(noticeId, editionId);");
    const mutationIndex = update.indexOf("studio2_update_notice_draft_v2");
    const responseValidationIndex = update.indexOf(
      "return validateStudio2NoticeResponse(notice, { noticeId, editionId });",
    );

    expect(guardIndex).toBeGreaterThanOrEqual(0);
    expect(mutationIndex).toBeGreaterThan(guardIndex);
    expect(responseValidationIndex).toBeGreaterThan(mutationIndex);

    expect(source).toContain("if (expected.noticeId && notice.id !== expected.noticeId)");
    expect(source).toContain("if (expected.editionId && notice.editionId !== expected.editionId)");
  });
});
