import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  PUBLIC_TOOL_GROUPS,
  countPublicTools,
  filterPublicToolGroups,
} from "./v3-tool-directory";

describe("V3 Tools directory: Countries-derived three-experience pattern", () => {
  it("retains every existing tool link exactly once", () => {
    const all = PUBLIC_TOOL_GROUPS.flatMap((group) => group.tools.map((tool) => tool.to));
    expect(all).toHaveLength(12);
    expect(new Set(all).size).toBe(all.length);
    expect(all).toContain("/result-lab");
    expect(all).toContain("/broadcast-intelligence/jury");
    expect(all).toContain("/archive-games");
  });

  it("filters case-insensitively and keeps scope counts consistent", () => {
    const all = filterPublicToolGroups(PUBLIC_TOOL_GROUPS, "");
    expect(countPublicTools(all)).toBe(12);
    expect(countPublicTools(filterPublicToolGroups(PUBLIC_TOOL_GROUPS, "votING"))).toBeGreaterThan(0);
    expect(countPublicTools(filterPublicToolGroups(PUBLIC_TOOL_GROUPS, "votING", "follow"))).toBeLessThanOrEqual(
      countPublicTools(filterPublicToolGroups(PUBLIC_TOOL_GROUPS, "votING")),
    );
    expect(filterPublicToolGroups(PUBLIC_TOOL_GROUPS, "unfindable-solaris-tool")).toEqual([]);
  });

  it("keeps all three presentations, deep links and mobile filtering in one source", () => {
    const source = readFileSync("src/routes/tools/index.tsx", "utf8");
    const family = readFileSync("src/components/v3/V3DirectoryFamilyIndex.tsx", "utf8");
    expect(source).toContain("V3DirectoryFamilyIndex");
    expect(source).toContain("PUBLIC_TOOL_GROUPS");
    expect(source).toContain("group.tools.map");
    expect(family).toContain('data-directory-experience={presentation}');
    expect(family).toContain('data-directory-mobile-header=""');
    expect(family).toContain("v3-directory-desktop-rail");
    expect(family).toContain("v3-directory-mobile-list");
    expect(family).toContain("<AppGroupedList>");
    expect(family).toContain("platformResolved");
    expect(family).toContain("to={item.to as any}");
    expect(source).not.toContain("supabase");
  });
});
