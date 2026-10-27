import { describe, expect, it } from "vitest";
import { loadPublicResultSnapshots, loadPublicResultSnapshotHeaders, parsePublicResultSnapshot } from "./v3-public-result-snapshots";

export function publicSnapshot(showId = "show", editionId = "edition") {
  return {
    schemaVersion: 1, publicationState: "public", resultVersion: 2, publicationVersion: 4,
    show: { id: showId, editionId }, edition: { id: editionId },
    availability: { results: true, jury: true, televote: true, detailedVoting: false },
    rowCount: 1, rows: [{ countryId: "country", contestEntityId: null, totalPoints: 22, finalRank: 1, juryPoints: 12, televotePoints: 10 }],
  };
}

describe("shared Public immutable result snapshot boundary", () => {
  it("preserves exact selected versions and never exposes injected unpublished layers", () => {
    const input = publicSnapshot();
    input.availability.jury = false;
    input.availability.televote = false;
    const parsed = parsePublicResultSnapshot(input);
    expect(parsed).toMatchObject({ showId: "show", editionId: "edition", resultVersion: 2, publicationVersion: 4 });
    expect(parsed.rows[0]).toMatchObject({ total_points: 22, jury_points: 0, televote_points: 0 });
    expect(parsed.availability).toMatchObject({ jury: false, televote: false });
  });
  it("rejects invalid state/version, wrong edition, duplicates and malformed row cardinality", () => {
    for (const change of [
      { publicationState: "hidden" }, { schemaVersion: 2 }, { resultVersion: 0 }, { publicationVersion: null },
      { edition: { id: "other" } }, { rowCount: 2 }, { rows: [{ ...publicSnapshot().rows[0], finalRank: -1 }] },
      { rowCount: 2, rows: [publicSnapshot().rows[0], publicSnapshot().rows[0]] },
    ]) expect(() => parsePublicResultSnapshot({ ...publicSnapshot(), ...change })).toThrow("Invalid canonical public result snapshot");
  });
  it("deduplicates and transports large archives in sequential batches of at most100", async () => {
    const calls: string[][] = [];
    const client = { async rpc(name: string, args: Record<string, unknown>) {
      expect(name).toBe("v3_public_published_result_snapshots");
      const ids = args.p_show_ids as string[]; calls.push(ids);
      return { data: ids.map((id) => publicSnapshot(id)), error: null };
    } };
    const ids = Array.from({ length: 205 }, (_, i) => `show-${i}`);
    const result = await loadPublicResultSnapshots(client, [...ids, ...ids]);
    expect(calls.map((call) => call.length)).toEqual([100, 100, 5]);
    expect([...result.keys()]).toEqual(ids);
  });
  it("discovery requests bounded headers and tied winners without downloading historical rows", async () => {
    const { rows, ...metadata } = publicSnapshot();
    const client = { async rpc(name: string, args: Record<string, unknown>) {
      expect(name).toBe("v3_public_published_result_snapshots");
      expect(args).toEqual({ p_show_ids: ["show"], p_include_rows: false });
      return { data: [{ ...metadata, winners: rows }], error: null };
    } };
    const result = await loadPublicResultSnapshotHeaders(client,["show"]);
    expect(result.get("show")?.winners).toHaveLength(1);
    expect(result.get("show")).not.toHaveProperty("rows");
  });
  it("keeps missing/unversioned snapshots absent and never falls back on RPC errors", async () => {
    let calls = 0;
    expect((await loadPublicResultSnapshots({ async rpc() { calls++; return { data: [], error: null }; } }, [])).size).toBe(0);
    expect(calls).toBe(0);
    expect((await loadPublicResultSnapshots({ async rpc() { return { data: [], error: null }; } }, ["hidden"])).size).toBe(0);
    await expect(loadPublicResultSnapshots({ async rpc() { return { data: null, error: { code: "42501" } }; } }, ["show"])).rejects.toThrow("Canonical published Results are unavailable");
    await expect(loadPublicResultSnapshots({ async rpc() { return { data: [publicSnapshot("foreign")], error: null }; } }, ["show"])).rejects.toThrow("Invalid canonical public result snapshot");
  });
});
