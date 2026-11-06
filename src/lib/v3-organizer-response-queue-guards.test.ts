import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertOrganizerResponsePageContinuity,
  assertOrganizerResponsePageDisjoint,
  assertOrganizerResponsePageCoverage,
  safeOrganizerResponseSongUrl,
  assertOrganizerNextInLineRowsInScope,
  assertOrganizerResponseRowsInEdition,
} from "./v3-organizer-response-queue-guards";

describe("Organizer Confirmation response queue page guards", () => {
  const base = { stateVersion: "canonical-v1", totalCount: 64 };
  it("accepts a second page from the identical canonical version and total", () => {
    expect(() => assertOrganizerResponsePageContinuity(base, { ...base })).not.toThrow();
  });
  it("rejects a response page from a new canonical version", () => {
    expect(() => assertOrganizerResponsePageContinuity(base, {
      ...base, stateVersion: "canonical-v2",
    })).toThrow(/changed during pagination/);
  });
  it("fails closed if either page lacks a canonical version", () => {
    expect(() => assertOrganizerResponsePageContinuity({ ...base, stateVersion: null }, base)).toThrow();
    expect(() => assertOrganizerResponsePageContinuity(base, { ...base, stateVersion: null })).toThrow();
  });
  it("rejects changed total counts even if the version string is unchanged", () => {
    expect(() => assertOrganizerResponsePageContinuity(base, {
      ...base, totalCount: 65,
    })).toThrow(/count changed/);
  });
  it("marks page conflicts with HTTP 409 semantics", () => {
    try {
      assertOrganizerResponsePageContinuity(base, { ...base, stateVersion: "other" });
      throw new Error("expected conflict");
    } catch (error) {
      expect(error).toMatchObject({ status: 409 });
    }
  });
  it("rejects repeated response IDs across pages without replacing old review evidence", () => {
    const oldPage = [{ id: "response-1" }, { id: "response-2" }];
    expect(() => assertOrganizerResponsePageDisjoint(oldPage, [
      { id: "response-2" },
    ])).toThrow(/repeated an earlier response/);
    expect(() => assertOrganizerResponsePageDisjoint(oldPage, [
      { id: "response-3" }, { id: "response-3" },
    ])).toThrow(/repeated an earlier response/);
    try {
      assertOrganizerResponsePageDisjoint(oldPage, [{ id: "response-1" }]);
      throw new Error("expected conflict");
    } catch (error) {
      expect(error).toMatchObject({ status: 409 });
    }
  });
  it("allows only unique new response IDs and does not mutate incoming records", () => {
    const previous = [{ id: "response-1" }];
    const incoming = [{ id: "response-2" }, { id: "response-3" }];
    expect(() => assertOrganizerResponsePageDisjoint(previous, incoming)).not.toThrow();
    expect(incoming).toEqual([{ id: "response-2" }, { id: "response-3" }]);
  });
  it("rejects empty continuing pages and never silently overwrites older entries", () => {
    const route = readFileSync(resolve(process.cwd(),
      "src/routes/confirmations/admin/responses.tsx"), "utf8");
    expect(route).toContain("assertOrganizerResponsePageDisjoint(rows, newRows)");
    expect(route).toContain("if (page.page.hasMore && newRows.length === 0)");
    expect(route).toContain("setRows((current) => [...current, ...newRows]);");
    expect(route).not.toContain("newRows.forEach((row) => byId.set(row.id, row));");
  });
  it("requires final pagination to cover the full canonical response count", () => {
    expect(() => assertOrganizerResponsePageCoverage(0, 10, 10, false)).not.toThrow();
    expect(() => assertOrganizerResponsePageCoverage(20, 10, 30, false)).not.toThrow();
    expect(() => assertOrganizerResponsePageCoverage(0, 0, 0, false)).not.toThrow();
    expect(() => assertOrganizerResponsePageCoverage(20, 9, 30, false)).toThrow(/does not match/);
    expect(() => assertOrganizerResponsePageCoverage(20, 11, 30, false)).toThrow(/does not match/);
  });
  it("rejects overfilled, prematurely final, and malformed intermediate pages", () => {
    expect(() => assertOrganizerResponsePageCoverage(20, 9, 30, true)).not.toThrow();
    expect(() => assertOrganizerResponsePageCoverage(20, 10, 30, true)).toThrow(/does not match/);
    expect(() => assertOrganizerResponsePageCoverage(20, 11, 30, true)).toThrow(/does not match/);
    expect(() => assertOrganizerResponsePageCoverage(-1, 2, 5, true)).toThrow(/invalid response counts/);
    expect(() => assertOrganizerResponsePageCoverage(0, 1, 1.5, false)).toThrow(/invalid response counts/);
  });
  it("validates both the initial and next page before rendering or appending", () => {
    const route = readFileSync(resolve(process.cwd(),
      "src/routes/confirmations/admin/responses.tsx"), "utf8");
    expect(route).toContain("assertOrganizerResponsePageCoverage(0, initialRows.length, page.totalCount, page.page.hasMore)");
    expect(route).toContain("assertOrganizerResponsePageCoverage(rows.length, newRows.length, page.totalCount, page.page.hasMore)");
  });
  it("allows ordinary and signed HTTP(S) source links", () => {
    expect(safeOrganizerResponseSongUrl("https://song.example.test/entry.mp3?token=opaque")).toBe(
      "https://song.example.test/entry.mp3?token=opaque",
    );
    expect(safeOrganizerResponseSongUrl("http://song.example.test/file")).toBe(
      "http://song.example.test/file",
    );
  });
  it("rejects unsafe Next-in-Line URLs, relative links and credentials", () => {
    for (const value of [
      "javascript:alert(1)", "data:text/html,hi", "blob:https://example.test/key",
      "file:///etc/passwd", "/song.mp3", "//example.test/song.mp3",
      "https://name:secret@media.example.test/x", "bad link",
      "https://media.example.test/\r\n@attacker.test/song",
    ]) expect(safeOrganizerResponseSongUrl(value)).toBeNull();
  });
  it("protects the queue from a stale page after another load or edition switch", () => {
    const route = readFileSync(resolve(process.cwd(),
      "src/routes/confirmations/admin/responses.tsx"), "utf8");
    expect(route).toContain("responseLoadGenerationRef");
    expect(route).toContain("requestedGeneration !== responseLoadGenerationRef.current");
    expect(route).toContain("assertOrganizerResponsePageContinuity");
    expect(route).toContain("setResponseReloadKey((current) => current + 1)");
    expect(route).toContain("responseReloadKey]");
    expect(route).not.toContain("href={row.song_url}");
  });
  it("rejects leading or trailing control characters before trimming untrusted links", () => {
    expect(safeOrganizerResponseSongUrl("\nhttps://cdn.example.test/song.mp3")).toBeNull();
    expect(safeOrganizerResponseSongUrl("https://cdn.example.test/song.mp3\t")).toBeNull();
  });

  const nextRow = {
    id: "line-1",
    edition_id: "edition-A",
    country: "Aotea",
    participating: true,
    entry_unknown: false,
    selection_type: "internal",
    edition: { id: "edition-A" },
  };

  it("accepts exact-edition Next in Line projections without altering the rows", () => {
    expect(assertOrganizerNextInLineRowsInScope([nextRow], "edition-A")).toEqual([nextRow]);
    expect(assertOrganizerNextInLineRowsInScope([], "edition-A")).toEqual([]);
  });

  it("fails closed on unrelated or nested foreign edition data", () => {
    expect(() => assertOrganizerNextInLineRowsInScope(
      [{ ...nextRow, edition_id: "edition-B" }], "edition-A",
    )).toThrow(/outside the selected/);
    expect(() => assertOrganizerNextInLineRowsInScope(
      [{ ...nextRow, edition: { id: "edition-B" } }], "edition-A",
    )).toThrow(/outside the selected/);
    expect(() => assertOrganizerNextInLineRowsInScope(
      [nextRow], "",
    )).toThrow(/Select the exact/);
  });

  it("rejects malformed and duplicate Next in Line response identities", () => {
    expect(() => assertOrganizerNextInLineRowsInScope(
      [nextRow, { ...nextRow }], "edition-A",
    )).toThrow(/duplicate/);
    expect(() => assertOrganizerNextInLineRowsInScope(
      [{ ...nextRow, country: "" }], "edition-A",
    )).toThrow(/malformed/);
    expect(() => assertOrganizerNextInLineRowsInScope(
      [{ ...nextRow, participating: null }], "edition-A",
    )).toThrow(/malformed/);
  });

  it("fetches Next in Line only on demand with independently scoped errors", () => {
    const code = readFileSync(resolve(process.cwd(),
      "src/routes/confirmations/admin/responses.tsx"), "utf8");
    expect(code).toContain('if (!editionId || mode !== "next_in_line")');
    expect(code).toContain("nextLoadGenerationRef");
    expect(code).toContain("assertOrganizerNextInLineRowsInScope(");
    expect(code).toContain("setNextError(");
    expect(code).toContain('mode === "next_in_line" && editionId ? nextError : error');
    expect(code).toContain("setLoadingNextRows(true)");
    expect(code).toContain("setNextRows([])");
    expect(code).toContain("[editionId, mode, nextReloadKey]");
    expect(code).toContain("function retryVisibleQueue()");
    expect(code).toContain("setNextReloadKey((current) => current + 1)");
    expect(code).toContain("Retry Next in Line");
    expect(code).toContain("throw new Error(result.error.message)");
    expect(code).toContain("Loading Next in Line for the selected edition");
    expect(code).toContain("Next in Line could not be loaded safely");
    expect(code).not.toContain('setError((current) => current ?? result.error.message)');
  });

  it("accepts only same-edition Confirmation response rows", () => {
    const rows=[{id:"response-1",editions:{id:"edition-A"},
      submission_rounds:{edition_id:"edition-A"}}];
    expect(assertOrganizerResponseRowsInEdition(rows,"edition-A")).toEqual(rows);
    expect(assertOrganizerResponseRowsInEdition([],"edition-A")).toEqual([]);
  });
  it("rejects cross-edition rows even when a round happens to match", () => {
    expect(() => assertOrganizerResponseRowsInEdition([
      {id:"response-1",editions:{id:"edition-B"},
       submission_rounds:{edition_id:"edition-A"}},
    ],"edition-A")).toThrow(/outside the selected edition/);
    expect(() => assertOrganizerResponseRowsInEdition([
      {id:"response-1",editions:{id:"edition-A"},
       submission_rounds:{edition_id:"edition-B"}},
    ],"edition-A")).toThrow(/outside the selected edition/);
  });
  it("rejects absent edition, duplicate IDs or malformed identities", () => {
    const good={id:"response-1",editions:{id:"edition-A"}};
    expect(() => assertOrganizerResponseRowsInEdition([good,good],"edition-A"))
      .toThrow(/duplicate/);
    expect(() => assertOrganizerResponseRowsInEdition([
      {id:"",editions:{id:"edition-A"}},
    ],"edition-A")).toThrow(/invalid response identity/);
    expect(() => assertOrganizerResponseRowsInEdition([
      {id:"response-1",editions:null},
    ],"edition-A")).toThrow(/outside the selected edition/);
    expect(() => assertOrganizerResponseRowsInEdition([good],""))
      .toThrow(/Select an Organizer edition/);
  });
  it("guards every page before it is shown or appended", () => {
    const route=readFileSync(resolve(process.cwd(),
      "src/routes/confirmations/admin/responses.tsx"),"utf8");
    expect(route).toContain("assertOrganizerResponseRowsInEdition(page.rows, editionId)");
    expect(route).toContain("assertOrganizerResponseRowsInEdition(page.rows, requestedEditionId)");
    expect(route).toContain("const scopedRows = useMemo");
    expect(route).toContain("const reviewCount = scopedRows.filter");
    expect(route).toContain("buildOrganizerEntryReviewWorklist(rows, editionId)");
  });

  it("makes unsafe external Next-in-Line links visibly unavailable", () => {
    const route = readFileSync(resolve(process.cwd(),
      "src/routes/confirmations/admin/responses.tsx"), "utf8");
    expect(route).toContain("function OrganizerNextInLineSongLink");
    expect(route).toContain("safeOrganizerResponseSongUrl(sourceUrl)");
    expect(route).toContain('rel="noopener noreferrer"');
    expect(route).toContain("Song link needs inspection");
  });
});
