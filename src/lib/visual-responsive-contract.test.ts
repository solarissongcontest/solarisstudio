import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const root = source("src/routes/__root.tsx");
const motion = source("src/solaris-motion.css");
const entityTheme = source("src/entity-theme.css");
const themeEditor = source("src/routes/_authenticated/country-hub/theme.tsx");
const adminDesktop = source("src/admin-desktop.css");
const analysis = source("src/routes/analysis/index.tsx");
const records = source("src/routes/records/index.tsx");
const appShell = source("src/components/AppShell.tsx");

describe("ambient Solaris visual system", () => {
  it("actually mounts the ambient motion layer and respects reduced motion", () => {
    expect(root).toContain('import solarisMotionCss from "../solaris-motion.css?url"');
    expect(root).toContain("SolarisAmbientBackground");
    expect(motion).toContain("@keyframes solaris-glow-a");
    expect(motion).toContain("@keyframes solaris-star-drift");
    expect(motion).toContain("@media (prefers-reduced-motion: reduce)");
  });

  it("keeps phone motion lighter than desktop motion", () => {
    expect(motion).toContain("@media (max-width: 767px)");
    expect(motion).toContain(".solaris-star-layer-far");
    expect(motion).toContain("transform: none;");
  });
});

describe("country page personalities", () => {
  const layouts = ["editorial", "minimal", "flag-focus", "poster", "split", "spotlight", "broadcast"];

  it("renders materially different public hero CSS for every non-default personality", () => {
    layouts.forEach((layout) => {
      expect(entityTheme).toContain(`data-country-hero-layout=\"${layout}\"`);
    });
    expect(entityTheme).toContain("min-height: clamp(31rem, 64vw, 47rem)");
    expect(entityTheme).toContain("border-left: .35rem solid");
    expect(entityTheme).toContain("padding-right: clamp(38%, 42vw, 48%)");
  });

  it("keeps unsaved preview reachable on mobile and persistent on desktop", () => {
    expect(themeEditor).toContain("mobilePreviewOpen");
    expect(themeEditor).toContain("Preview country →");
    expect(themeEditor).toContain("Preview Wiki →");
    expect(themeEditor).toContain("sticky bottom-20");
    expect(themeEditor).toContain("xl:sticky xl:top-24");
  });
});

describe("responsive public/admin guardrails", () => {
  it("keeps mobile navigation from covering desktop organizer controls", () => {
    expect(adminDesktop).toContain(".admin-mobile-nav {\n    display: none !important;");
    expect(adminDesktop).not.toContain("grid-template-columns: minmax(14rem, .72fr) minmax(0, 2.28fr)");
  });

  it("keeps public analysis and records layouts responsive instead of fixed-width", () => {
    expect(analysis).toContain("md:grid-cols-2 xl:grid-cols-3");
    expect(analysis).toContain("ResponsiveTabs");
    expect(records).toContain("lg:grid-cols-2 2xl:grid-cols-3");
    expect(records).toContain("remainingHolders");
  });

  it("retains a mobile-safe public shell", () => {
    expect(appShell).toContain("lg:hidden");
    expect(appShell).toContain("app-main");
  });
});
