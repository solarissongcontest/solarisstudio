import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/routes/encyclopedia/index.tsx", "utf8");

describe("Reference category browsing", () => {
  it("filters real idle topic destinations as well as typed search results", () => {
    expect(source).toContain('kind: "edition", label: "Editions"');
    expect(source).toContain('kind: "country", label: "Countries"');
    expect(source).toContain('kind: "show", label: "Shows"');
    expect(source).toContain('kind: "story", label: "Stories"');
    expect(source).toContain('kind === "all" || destination.kind === kind');
    expect(source).toContain("browseDestinations.map(({ label, description, href }) =>");
    expect(source).not.toContain("BROWSE_DESTINATIONS.map(");
    expect(source).toContain('aria-live="polite"');
    expect(source).toContain('kind === "all" ? "Browse published Solaris"');
  });

  it("does not invent an unpublished entry index when a category is empty", () => {
    expect(source).toContain("browseDestinations.length === 0");
    expect(source).toContain("No standalone index exists for this topic.");
    expect(source).toContain("Search above to find published entries");
    expect(source).not.toContain('href: "/entries"');
  });

  it("preserves server-owned publication and feature gates", () => {
    expect(source).toContain('isStudio2FeatureEnabled("public_encyclopedia")');
    expect(source).toContain('rpc(\n        "solaris_public_search"');
    expect(source).toContain("parseSearchRows");
    expect(source).not.toContain('select("*")');
  });
});
