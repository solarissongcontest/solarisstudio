import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { resolveWikiArticleAnchor } from "./wiki-article-anchor";

const ids = ["introduction", "former-identities", "solaris-song-contest"];

describe("published Wiki article anchors", () => {
  it("supports direct links, canonical percent escapes and ordinary section changes", () => {
    expect(resolveWikiArticleAnchor("#introduction", ids)).toBe("introduction");
    expect(resolveWikiArticleAnchor("#former%2Didentities", ids)).toBe("former-identities");
    expect(resolveWikiArticleAnchor("#solaris-song-contest", ids)).toBe("solaris-song-contest");
  });

  it("ignores invalid, malformed and nonpublished section hashes without throwing", () => {
    for (const hash of ["", "#", "#%", "#%E0%A4%A", "#%ZZ", "#not-published", "#%2Fadmin"]) {
      expect(() => resolveWikiArticleAnchor(hash, ids)).not.toThrow();
      expect(resolveWikiArticleAnchor(hash, ids)).toBeNull();
    }
  });

  it("routes both initial links and hashchange through guarded decoding and clears delayed navigation", () => {
    const wiki = readFileSync("src/components/wiki/CountryWikiExperience.tsx", "utf8");
    expect(wiki).toContain('resolveWikiArticleAnchor(window.location.hash, sectionIds)');
    expect(wiki).not.toContain('decodeURIComponent(window.location.hash.slice(1))');
    expect(wiki).toContain("window.clearTimeout(initialTimer)");
  });
});
