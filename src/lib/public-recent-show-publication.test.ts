import { describe, expect, it } from "vitest";
import { DEFAULT_PUBLICATION_CONFIG } from "./publication";
import { isRecentShowPublic } from "./public-recent-show-publication";

describe("stored Show publication JSON boundary", () => {
  it("rejects malformed database JSON rather than exposing a stored label", () => {
    for (const publication_config of [undefined, true, 1, "public", [], ["results"]]) {
      expect(isRecentShowPublic({ published: true, publication_config })).toBe(false);
    }
  });

  it("preserves the canonical published legacy null-config policy", () => {
    expect(isRecentShowPublic({ published: true, publication_config: null })).toBe(true);
  });

  it("never exposes unpublished Shows", () => {
    expect(isRecentShowPublic({ published: false, publication_config: { results: true } })).toBe(false);
  });

  it("uses canonical publication flags for valid objects", () => {
    const hidden = Object.fromEntries(Object.keys(DEFAULT_PUBLICATION_CONFIG).map((key) => [key, false]));
    expect(isRecentShowPublic({ published: true, publication_config: hidden })).toBe(false);
    expect(isRecentShowPublic({ published: true, publication_config: { ...hidden, results: true } })).toBe(true);
  });
});
