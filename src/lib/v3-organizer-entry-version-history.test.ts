import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  appendOrganizerEntryRevisionPage,
  compareOrganizerEntryRevisions,
  hasEarlierOrganizerEntryVersions,
  parseOrganizerEntryRevisions,
} from "./v3-organizer-entry-version-history";

const payload = {
  entry_id: "entry-1",
  submission_id: "submission-1",
  versions: [
    {
      id: "v2", revision: 2, source: "canonical_write",
      recorded_at: "2026-11-06T09:00:00Z",
      content: {
        artist: "New Artist", song_title: "Song",
        song_url: "https://private.example.test/song.mp3?token=secret",
        preview_start: "00:11", preview_end: "00:36",
        credits: [{ role: "composer", name: "Example" }],
      },
      reviews: [{ id: "decision-2", decision: "accepted", reason: null, reviewed_at: "2026-11-06T09:05:00Z" }],
    },
    {
      id: "v1", revision: 1, source: "organizer_restore",
      restored_from_submission_version_id: "snapshot-id",
      content: {
        artist: "Old Artist", song_title: "Song",
        song_url: "https://private.example.test/song.mp3?token=old",
        preview_start: "00:11", preview_end: "00:36",
      },
      reviews: [{ id: "decision-1", decision: "declined", reason: "Fix metadata", reviewed_at: "2026-11-05T09:05:00Z" }],
    },
  ],
};

describe("Organizer immutable Entry version evidence", () => {
  it("parses a bounded, exact-submission revision page with review and restore evidence", () => {
    const rows = parseOrganizerEntryRevisions(payload, "entry-1", "submission-1");
    expect(rows.map((row) => row.revision)).toEqual([2, 1]);
    expect(rows[0].reviews[0].decision).toBe("accepted");
    expect(rows[1].restoredFromSubmissionVersionId).toBe("snapshot-id");
    expect(rows[0].credits).toEqual([{ role: "composer", name: "Example" }]);
  });

  it("fails closed on cross-entry or cross-submission responses", () => {
    expect(() => parseOrganizerEntryRevisions(payload, "entry-2", "submission-1")).toThrow(/match/);
    expect(() => parseOrganizerEntryRevisions(payload, "entry-1", "submission-2")).toThrow(/match/);
  });

  it("rejects malformed pages, missing content, bad sequence and duplicate version identifiers", () => {
    expect(() => parseOrganizerEntryRevisions({ ...payload, versions: {} }, "entry-1", "submission-1")).toThrow();
    expect(() => parseOrganizerEntryRevisions({ ...payload, versions: Array(21).fill(payload.versions[0]) }, "entry-1", "submission-1")).toThrow();
    expect(() => parseOrganizerEntryRevisions({ ...payload, versions: [{ id: "v2", revision: 2 }] }, "entry-1", "submission-1")).toThrow();
    expect(() => parseOrganizerEntryRevisions({ ...payload, versions: [payload.versions[1], payload.versions[0]] }, "entry-1", "submission-1")).toThrow();
    expect(() => parseOrganizerEntryRevisions({ ...payload, versions: [payload.versions[0], { ...payload.versions[1], id: "v2" }] }, "entry-1", "submission-1")).toThrow();
  });

  it("refuses truncation, malformed decisions and duplicate immutable review evidence", () => {
    const make = (reviews: unknown) => ({
      ...payload,
      versions: [{ ...payload.versions[0], reviews }],
    });
    expect(() => parseOrganizerEntryRevisions(make(Array.from({ length: 26 }, (_, i) => ({
      id: `review-${i}`, decision: "accepted",
    }))), "entry-1", "submission-1")).toThrow(/bounded review-evidence/);
    expect(() => parseOrganizerEntryRevisions(make({ decision: "accepted" }),
      "entry-1", "submission-1")).toThrow(/malformed review evidence/);
    expect(() => parseOrganizerEntryRevisions(make([{}]),
      "entry-1", "submission-1")).toThrow(/invalid review decision/);
    expect(() => parseOrganizerEntryRevisions(make([
      { id: "same", decision: "accepted" },
      { id: "same", decision: "declined" },
    ]), "entry-1", "submission-1")).toThrow(/duplicate review evidence/);
    const exact = parseOrganizerEntryRevisions(make(
      [{ id: "only", decision: "accepted" }],
    ), "entry-1", "submission-1");
    expect(exact[0].reviews).toHaveLength(1);
  });

  it("never silently hides an overlapping or incorrectly ordered revision page", () => {
    const [newer, older] = parseOrganizerEntryRevisions(payload, "entry-1", "submission-1");
    expect(appendOrganizerEntryRevisionPage([newer], [older], 2))
      .toEqual([newer, older]);
    expect(() => appendOrganizerEntryRevisionPage([newer], [
      { ...older, id: newer.id },
    ], 2)).toThrow(/repeated or reordered/);
    expect(() => appendOrganizerEntryRevisionPage([newer], [
      { ...older, revision: newer.revision },
    ], 2)).toThrow(/repeated or reordered/);
    expect(() => appendOrganizerEntryRevisionPage([newer], [older], 3))
      .toThrow(/continuation cursor/);
  });

  it("compares the full inspected field set without returning private source URLs", () => {
    const [newer, older] = parseOrganizerEntryRevisions(payload, "entry-1", "submission-1");
    const changes = compareOrganizerEntryRevisions(newer, older);
    expect(changes.filter((item) => item.changed).map((item) => item.label))
      .toEqual(["Artist name", "Song source", "Credits"]);
    expect(JSON.stringify(changes)).not.toContain("token=secret");
    expect(JSON.stringify(changes)).not.toContain("token=old");
    expect(changes).toHaveLength(8);
  });

  it("does not confuse a changed private URL with unchanged media", () => {
    const [newer, older] = parseOrganizerEntryRevisions(payload, "entry-1", "submission-1");
    expect(compareOrganizerEntryRevisions({ ...newer, songSource: older.songSource }, older)
      .find((field) => field.label === "Song source")?.changed).toBe(false);
  });

  it("offers manual pagination only for full 20-row pages with earlier revisions", () => {
    const [row] = parseOrganizerEntryRevisions(payload, "entry-1", "submission-1");
    expect(hasEarlierOrganizerEntryVersions([row])).toBe(false);
    expect(hasEarlierOrganizerEntryVersions(Array.from({ length: 20 }, (_, i) =>
      ({ ...row, id: String(i), revision: 21 - i })))).toBe(true);
    expect(hasEarlierOrganizerEntryVersions(Array.from({ length: 20 }, (_, i) =>
      ({ ...row, id: String(i), revision: 20 - i })))).toBe(false);
  });

  it("loads historical evidence only on explicit Organizer action and avoids full URL display", () => {
    const path = resolve(process.cwd(), "src/components/admin/OrganizerEntryVersionHistory.tsx");
    const code = readFileSync(path, "utf8");
    expect(code).toContain('"v3_confirmation_entry_versions"');
    expect(code).toContain("onClick={() => void loadPage(false)}");
    expect(code).toContain("p_before_revision: cursor");
    expect(code).toContain("parseOrganizerEntryRevisions(data, entryId, submissionId)");
    expect(code).toContain("appendOrganizerEntryRevisionPage(versions, page, cursor)");
    expect(code).not.toContain("page.filter((item) => !seen.has(item.id))");
    expect(code).toContain("generation === requestGeneration.current");
    expect(code).toContain("activeScope.current === requestedScope");
    expect(code).not.toContain("version.songSource}");
    expect(code).not.toContain("version.replacementVideoSource}");
  });

  it("does not start or display a history read after the Organizer response scope changes", () => {
    const component = readFileSync(resolve(process.cwd(),
      "src/components/admin/OrganizerEntryVersionHistory.tsx"), "utf8");
    const route = readFileSync(resolve(process.cwd(),
      "src/routes/confirmations/admin/responses/$id.tsx"), "utf8");
    expect(component).toContain("isScopeCurrent: () => boolean;");
    expect(component).toContain("if (!isScopeCurrent()) {");
    expect(component).toContain("generation === requestGeneration.current && activeScope.current === requestedScope &&");
    expect(component).toContain("isScopeCurrent();");
    const beforeRead = component.indexOf("if (!isScopeCurrent()) {");
    const rpc = component.indexOf('"v3_confirmation_entry_versions"');
    expect(beforeRead).toBeGreaterThan(-1);
    expect(rpc).toBeGreaterThan(beforeRead);
    expect(route).toContain("isScopeCurrent={isScopeCurrent}");
  });

  it("mounts scoped history only from an open Entry Review sheet", () => {
    const route = readFileSync(resolve(process.cwd(),
      "src/routes/confirmations/admin/responses/$id.tsx"), "utf8");
    expect(route).toContain("OrganizerEntryVersionHistory");
    expect(route).toContain("currentVersionId={entry.current_version_id ?? null}");
    expect(route).toContain("submissionId={submissionId}");
    expect(route).toContain("editionId={editionId}");
    expect(route).toContain("targetType={targetType}");
    expect(route).toContain("open && editionId");
  });
});
