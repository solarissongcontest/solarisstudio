import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertOrganizerResponsePageContinuity,
  safeOrganizerResponseSongUrl,
  assertOrganizerNextInLineRowsInScope,
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
    expect(code).not.toContain('setError((current) => current ?? result.error.message)');
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
