import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("organizer release surface", () => {
  it("keeps retired studio language and routes out of everyday admin workflows", () => {
    const files = [
      "src/components/admin/AdminCommandPalette.tsx",
      "src/routes/_authenticated/admin/jury/$slug.tsx",
      "src/routes/_authenticated/admin/entries/$slug.tsx",
      "src/routes/confirmations/admin/editions.tsx",
    ];

    const combined = files.map(source).join("\n");

    expect(combined).not.toMatch(/advanced=true/i);
    expect(combined).not.toMatch(/advanced studio/i);
    expect(combined).not.toMatch(/legacy edition studio/i);
    expect(combined).not.toMatch(/legacy studio/i);
    expect(combined).not.toMatch(/Advanced Setup/i);
    expect(combined).not.toMatch(/window\.location\.href/);
  });

  it("keeps the edition switcher edition-aware across specialist workspaces", () => {
    const selectors = source("src/components/admin/AdminSelectors.tsx");
    const editionScopedRoutes = [
      "/admin/design/",
      "/admin/edition-theme/",
      "/admin/shows/",
      "/admin/entries/",
      "/admin/jury/",
      "/admin/televote/",
      "/admin/voting-system/",
      "/admin/publication/",
    ];

    for (const route of editionScopedRoutes) {
      expect(selectors, `edition selector should recognize ${route}`).toContain(route);
    }
  });

  it("offers direct current-edition specialist commands", () => {
    const palette = source("src/components/admin/AdminCommandPalette.tsx");
    const specialistRoutes = [
      "/admin/shows/",
      "/admin/entries/",
      "/admin/jury/",
      "/admin/voting-system/",
      "/admin/televote/",
      "/admin/publication/",
      "/admin/design/",
    ];

    for (const route of specialistRoutes) {
      expect(palette, `command palette should offer ${route}`).toContain(route);
    }
  });
});
