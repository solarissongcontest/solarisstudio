import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { renderMaintenancePage } from "./maintenance-page";

const source = (path: string) => readFileSync(path, "utf8");
const route = source("src/routes/terraos-teaser-preview.tsx");
const shell = source("src/components/v3/TerraOSLiveMaintenancePreview.tsx");
const fixture = source("src/components/v3/TerraOSTeaserPreview.tsx");
const navCss = source("src/styles/terraos-live-maintenance-preview.css");
const layoutCss = source("src/styles/terraos-live-maintenance-preview-layout.css");
const maintenance = renderMaintenancePage(new Date("2026-10-30T18:00:00Z"));

describe("TerraOS live maintenance preview", () => {
  it("is entered explicitly from maintenance without implying a V3 launch", () => {
    expect(maintenance).toContain('href="/terraos-teaser-preview?screen=home">Preview</a>');
    expect(maintenance).toContain('href="/terraos-teaser-preview?screen=home">Preview TerraOS&nbsp;3</a>');
    expect(maintenance).toContain("Estimated arrival");
    expect(maintenance).toContain("Based on tracked release criteria, not time elapsed.");
  });

  it("remains maintenance-only and noindex", () => {
    expect(route).toContain("if (!GLOBAL_MAINTENANCE_MODE) throw notFound()");
    expect(route).toContain('{ name: "robots", content: "noindex,nofollow" }');
    expect(route).toContain("Fixture-only TerraOS 3 visual preview");
  });

  it("keeps embedded maintenance cards static while direct preview gets its isolated shell", () => {
    expect(route).toContain('if (chrome === "content")');
    expect(route).toContain("<TerraOSTeaserPreview screen={screen} showNavigation={false} />");
    expect(route).toContain("<TerraOSLiveMaintenancePreview screen={screen} />");
    expect(route).toContain('if (chrome !== "content") return;');
  });

  it("exposes exactly the canonical five preview destinations without linking to live product routes", () => {
    for (const [id, label] of [
      ["home", "Home"],
      ["explore", "Explore"],
      ["participate", "Participate"],
      ["results", "Results"],
      ["me", "Me"],
    ] as const) {
      expect(shell).toContain(`{ id: "${id}", label: "${label}"`);
    }
    expect(shell).toContain('href={`/terraos-teaser-preview?screen=${id}`}');
    expect(shell).toContain("Fixture data · read-only");
    expect(shell).not.toContain('href="/participate"');
    expect(shell).not.toContain('href="/results"');
    expect(shell).not.toContain('href="/my-solaris"');
  });

  it("leaves the production fixture renderer read-only and free of live Supabase clients", () => {
    expect(shell).toContain("<TerraOSTeaserPreview screen={screen} showNavigation={false} />");
    expect(fixture).toContain("PREVIEW_NOW");
    expect(fixture).toContain("pointer-events-none");
    expect(fixture).toContain("event.preventDefault()");
    expect(fixture).not.toContain("createClient(");
    expect(fixture).not.toContain("supabase.from(");
    expect(fixture).not.toContain("mutateAsync(");
  });

  it("keeps Results representative only and never invokes result calculation authority", () => {
    expect(fixture).toContain("const RESULTS_INPUT: V3ResultProjectionInput");
    expect(fixture).toContain('publication: "published"');
    expect(fixture).toContain("<V3ResultsScreen");
    expect(fixture).not.toContain("calculateOfficial");
    expect(fixture).not.toContain("publishResult");
    expect(fixture).not.toContain("recalculate");
  });

  it("uses safe-area-aware Liquid navigation with accessible fallbacks", () => {
    expect(layoutCss).toContain("env(safe-area-inset-top, 0px)");
    expect(layoutCss).toContain("env(safe-area-inset-bottom, 0px)");
    expect(navCss).toContain("backdrop-filter: blur(24px) saturate(156%)");
    expect(navCss).toContain(".terraos-live-preview-nav__item:focus-visible");
    expect(navCss).toContain("@media (prefers-reduced-motion: reduce)");
    expect(navCss).toContain("@media (prefers-reduced-transparency: reduce)");
    expect(shell).toContain('aria-current={active ? "page" : undefined}');
  });

  it("lets the direct preview expand for desktop inspection without changing embedded teaser cards", () => {
    expect(layoutCss).toContain('data-terraos-live-preview-shell="true"');
    expect(layoutCss).toContain("height: auto !important");
    expect(layoutCss).toContain("@media (min-width: 760px)");
    expect(layoutCss).toContain("width: min(100%, 72rem)");
  });
});
