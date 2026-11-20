import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  SITE_DIRECTORY_AREA_DESCRIPTIONS,
  SITE_DIRECTORY_AREA_ORDER,
} from "./v3-site-directory";
import { PUBLIC_TOOL_GROUPS } from "./v3-tool-directory";

const family = readFileSync("src/components/v3/V3DirectoryFamilyIndex.tsx", "utf8");
const tools = readFileSync("src/routes/tools/index.tsx", "utf8");
const site = readFileSync("src/routes/site-directory/index.tsx", "utf8");

describe("Explore directory release-aware content and navigation", () => {
  it("provides meaningful category guidance to app, mobile web and desktop", () => {
    expect(SITE_DIRECTORY_AREA_ORDER.length).toBeGreaterThan(0);
    expect(SITE_DIRECTORY_AREA_ORDER.every((key) =>
      SITE_DIRECTORY_AREA_DESCRIPTIONS[key].trim().length > 20,
    )).toBe(true);
    expect(PUBLIC_TOOL_GROUPS.every((group) =>
      group.description.trim().length > 10,
    )).toBe(true);
    expect(site).toContain("description: SITE_DIRECTORY_AREA_DESCRIPTIONS[area]");
    expect(tools).toContain("description: group.description");
    expect(family).toContain("group.description ? <p");
  });

  it("does not confuse unreleased content with a failed search", () => {
    expect(family).toContain("total === 0");
    expect(family).toContain("No destinations in this collection are currently available in the public release.");
    expect(family).toContain("No matching ${itemNoun}");
    expect(family).toContain("Clear filters");
    expect(family).toContain("group.items.filter(item => allows(item.to))");
  });

  it("keeps both indexes as lightweight navigation rather than new data readers", () => {
    expect(site).toContain("V3DirectoryFamilyIndex");
    expect(tools).toContain("V3DirectoryFamilyIndex");
    expect(site).not.toContain("supabase");
    expect(tools).not.toContain("supabase");
    expect(family).not.toContain("useAllJuryVotes");
    expect(family).toContain("resolveDirectoryScope(area, groups)");
  });
});
