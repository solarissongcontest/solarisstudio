import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "src/components/RouteVisualTheme.tsx"),
  "utf8",
);

describe("V3 route result refresh scope", () => {
  it("refreshes the canonical Edition result projection by id", () => {
    expect(source).toContain("editionId: edition?.id");
    expect(source).toContain('queryKey: ["results", "edition", editionId]');
    expect(source).not.toContain('queryKey: ["results", "all"]');
    expect(source).not.toContain("editionSlug: slug");
  });

  it("preserves exact Show result refresh", () => {
    expect(source).toContain("showId,");
    expect(source).toContain('queryKey: ["results", "show", showId]');
  });

  it("preserves focus, visibility and bounded live refresh cadence", () => {
    expect(source).toContain("window.setInterval(refresh, 30_000)");
    expect(source).toContain('window.addEventListener("focus", refresh)');
    expect(source).toContain('document.addEventListener("visibilitychange", refresh)');
    expect(source).toContain("[editionId, live, queryClient, showId]");
  });
});
