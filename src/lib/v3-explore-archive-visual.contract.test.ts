import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const archive = readFileSync("src/routes/archive/index.tsx", "utf8");
const family = readFileSync("src/components/v3/V3DirectoryFamilyIndex.tsx", "utf8");
const css = readFileSync("src/styles/v3-directory-family.css", "utf8");

describe("Explore Archive's three-experience historical layout", () => {
  it("uses a dedicated archive presentation rather than a site map", () => {
    expect(archive).toContain('variant="archive"');
    expect(archive).toContain('id: "contests"');
    expect(archive).toContain('id: "countries-stories"');
    expect(archive).toContain('id: "reference-results"');
    expect(archive).toContain("description,");
    expect(family).toContain('variant?: "tools" | "sitemap" | "archive"');
    expect(family).toContain("group.description ? <p");
    expect(family).toContain("data-directory-experience={presentation}");
  });

  it("keeps historical browsing readable in the PWA, web phone and desktop", () => {
    expect(css).toContain('.v3-directory-family[data-directory-kind="archive"] .v3-directory-group-description');
    expect(css).toContain('.v3-directory-family[data-directory-kind="archive"] .v3-directory-desktop-card');
    expect(css).toContain('.v3-directory-family[data-directory-kind="archive"] .v3-directory-mobile-row');
    expect(css).toContain("@media (max-width: 70rem)");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain("@media (forced-colors: active)");
  });

  it("does not duplicate the publication authority or reveal unavailable routes", () => {
    expect(family).toContain("group.items.filter(item => allows(item.to))");
    expect(archive).not.toContain('from "@/integrations/supabase/client"');
    expect(archive).not.toContain("useAllJuryVotes(");
    expect(archive).not.toContain("useAllResults(");
    expect(archive).toContain('to: "/wiki", group: "reference-results"');
    expect(archive).toContain('title: "Songs & artists"');
    expect(archive).toContain('to: "/music", group: "countries-stories"');
  });
});
