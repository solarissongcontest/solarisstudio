import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("../components/v3/V3ExploreScreen.tsx", import.meta.url),
  "utf8",
);

describe("V3 Explore screen architecture boundary", () => {
  it("renders the canonical Explore projection instead of owning data access", () => {
    expect(source).toContain("V3ExploreRootProjection");
    expect(source).toContain("projection.currentEdition");
    expect(source).toContain("projection.discover.map");
    expect(source).toContain("projection.archive.links.map");

    for (const forbidden of [
      "@supabase",
      "supabase.",
      "fetch(",
      "useQuery",
      "useMutation",
      "useEffect",
      "localStorage",
      "sessionStorage",
      "indexedDB",
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });

  it("hands Search back to the existing global Search owner", () => {
    expect(source).toContain("onOpenSearch: () => void");
    expect(source).toContain("onClick={onOpenSearch}");
    expect(source).not.toMatch(/SearchOverlay|SolarisSearchField|searchParams|searchQuery/);
  });

  it("surfaces Live from the projected current-edition state without inferring show authority", () => {
    expect(source).toContain('edition.experience === "live" && edition.liveHref');
    expect(source).toContain('title="Open Live Mode"');
    expect(source).toContain("to={edition.liveHref}");
    expect(source).not.toContain('to="/show-mode"');
    expect(source).not.toMatch(/Date\.now|new Date|scheduledStart|liveStartedAt|show\.status/);
  });

  it("does not acquire Results data or analysis ownership", () => {
    expect(source).not.toMatch(/V3Results|scorechart|juryPoints|televotePoints|totalPoints|points:/);
    expect(source).not.toMatch(/resultRows|leaderboard|placement:/);
  });

  it("uses the shared V3 foundation rather than creating another shell", () => {
    expect(source).toContain('from "./V3Foundation"');
    expect(source).toContain("<V3Screen>");
    expect(source).toContain('data-v3-explore-header=""');
    expect(source).toContain("<V3Section");
    expect(source).not.toContain("V3ScreenHeader");
    expect(source).not.toContain("V3FoundationShell");
    expect(source).not.toContain("V3BottomNav");
  });

  it("keeps the archive bounded on the mobile root surface", () => {
    expect(source).toContain("projection.archive.editions.slice(0, 4)");
    expect(source).toContain("projection.archive.links.map");
  });
});