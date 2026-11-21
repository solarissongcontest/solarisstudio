import { describe, expect, it } from "vitest";
import { MAX_REFERENCE_QUERY_LENGTH, parseReferenceUrlSearch, referenceQueryFromUrl } from "./v3-reference-url-search";

describe("Reference URL navigation state", () => {
  it("restores supported topic and a bounded public search", () => {
    const state = parseReferenceUrlSearch({ q: "  SSC 19  ", kind: "edition" });
    expect(state).toEqual({ q: "SSC 19", kind: "edition", artist: undefined });
    expect(referenceQueryFromUrl(state)).toBe("SSC 19");
  });

  it("keeps historical artist search links working without making artist identity", () => {
    expect(referenceQueryFromUrl(parseReferenceUrlSearch({ artist: "Reya" }))).toBe("Reya");
    expect(referenceQueryFromUrl(parseReferenceUrlSearch({ q: "Current", artist: "Older" }))).toBe("Current");
  });

  it("rejects unsupported topics, removes controls, and caps untrusted URLs", () => {
    const parsed = parseReferenceUrlSearch({ kind: "private-jury", q: "a\nb", artist: "x".repeat(500) });
    expect(parsed.kind).toBeUndefined();
    expect(parsed.q).toBe("a b");
    expect(parsed.artist?.length).toBe(MAX_REFERENCE_QUERY_LENGTH);
    expect(parseReferenceUrlSearch({ q: ["not a search"], kind: 42 })).toEqual({
      q: undefined, kind: undefined, artist: undefined,
    });
  });

  it("represents empty terms as absent rather than submitting empty searches", () => {
    expect(parseReferenceUrlSearch({ q: "   ", kind: "all" })).toEqual({
      q: undefined, kind: "all", artist: undefined,
    });
    expect(referenceQueryFromUrl(parseReferenceUrlSearch({ q: " " }))).toBe("");
  });
});
