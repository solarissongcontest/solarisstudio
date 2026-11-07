import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("Published Editions directory follows the Countries design language", () => {
  it("preserves publication and results truth in one shared model", () => {
    const editions = source("src/routes/editions/index.tsx");
    expect(editions).toContain("filter((edition) => edition.published)");
    expect(editions).toContain("isShowPublic(show)");
    expect(editions).toContain("resolveShowPublication(grandFinal)");
    expect(editions).toContain("publication?.results");
    expect(editions).toContain("final_rank === 1");
    expect(editions).toContain('to="/editions/$slug"');
    expect(editions).not.toContain("supabase");
  });

  it("renders installed PWA, phone browser and laptop browser separately", () => {
    const editions = source("src/routes/editions/index.tsx");
    expect(editions).toContain("useV3DirectoryPresentation()");
    expect(editions).toContain("platformResolved");
    expect(editions).toContain('data-directory-experience={presentation}');
    expect(editions).toContain('data-directory-mobile-header=""');
    expect(editions).toContain("v3-directory-desktop-rail");
    expect(editions).toContain("v3-directory-mobile-list");
    expect(editions).toContain("v3-directory-desktop-grid");
    expect(editions).toContain("solaris-app-edition-row group");
    expect(editions).toContain("AppGroupedList");
    expect(editions).toContain("SheetClose");
  });

  it("retains published winner and host context while filtering the archive", () => {
    const editions = source("src/routes/editions/index.tsx");
    expect(editions).toContain("normalizedSearch");
    expect(editions).toContain("searched.filter");
    expect(editions).toContain("visibleLatest");
    expect(editions).toContain("visiblePast");
    expect(editions).toContain("EditionMobileRow");
    expect(editions).toContain("EditionDesktopCard");
    expect(editions).toContain("HostLine");
    expect(editions).toContain("WinnerLine");
    expect(editions).toContain("No matching editions");
    expect(editions).toContain("setScope");
  });
});
