import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("V3 Edition Story continuity", () => {
  it("derives the dedicated Story route from the canonical Edition slug", () => {
    const projection = source("src/lib/v3-edition.ts");

    expect(projection).toContain("export type V3EditionStoryProjection = V3EditionStory & {");
    expect(projection).toContain('href: `/stories/${encodeURIComponent(input.edition.slug)}`');
    expect(projection).not.toMatch(/story\.(title|subtitle).*\/stories|encodeURIComponent\(input\.story/i);
  });

  it("keeps the embedded preview and exposes the full published timeline without a second Story read", () => {
    const screen = source("src/components/v3/V3EditionHubScreen.tsx");

    expect(screen).toContain('title="Open full story"');
    expect(screen).toContain('to={projection.story.href}');
    expect(screen).toContain("projection.story.items.slice(0, 5)");
    expect(screen).not.toMatch(/useQuery|fetch\(|supabase/i);
  });
});
