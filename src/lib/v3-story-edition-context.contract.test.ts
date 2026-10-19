import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("../components/v3/V3StoryDetailScreen.tsx", import.meta.url),
  "utf8",
);

describe("V3 Story edition entity continuity", () => {
  it("links a published story back to its canonical Edition entity", () => {
    expect(source).toContain('to="/editions/$slug"');
    expect(source).toContain("params={{ slug: editionSlug }}");
    expect(source).toContain("Open edition →");
  });

  it("keeps the Edition bridge available while story content is spoiler-protected", () => {
    const calls = source.match(/<StoryContextLinks editionSlug=\{story\.editionSlug\} \/>/g) ?? [];
    expect(calls).toHaveLength(2);
    expect(source).toContain('data-v3-story-spoiler-protected=""');
  });
});
