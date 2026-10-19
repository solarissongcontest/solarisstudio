import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = () =>
  readFileSync(resolve(process.cwd(), "src/lib/terraos-teaser-mobile-reference-hero.ts"), "utf8");
const routeSource = () =>
  readFileSync(resolve(process.cwd(), "src/routes/terraos-teaser-preview.tsx"), "utf8");

describe("TerraOS approved mobile hero geometry", () => {
  it("anchors the launch copy and phone stage to the supplied reference composition", () => {
    const implementation = source();

    expect(implementation).toContain("top: max(8.75rem, 18svh) !important");
    expect(implementation).toContain("top: 52svh !important");
    expect(implementation).toContain("position: absolute !important");
    expect(implementation).toContain("position: sticky !important");
    expect(implementation).toContain("margin-top: 0 !important");
  });

  it("changes geometry only and leaves the three phone transforms to the existing host", () => {
    const implementation = source();

    expect(implementation).not.toContain(".phone.center");
    expect(implementation).not.toContain(".phone.left");
    expect(implementation).not.toContain(".phone.right");
    expect(implementation).not.toContain("opacity:");
    expect(implementation).not.toContain("addEventListener(\"scroll\"");
    expect(implementation).not.toContain("preventDefault");
  });

  it("does not override the structural Reduce Motion layout", () => {
    const implementation = source();
    expect(implementation).toContain(':not([data-terraos-reduced-motion="true"])');
  });

  it("installs after the host macro choreography and before the Home handoff", () => {
    const route = routeSource();
    expect(route).toContain("installTerraOsTeaserMobileReferenceHero");

    const micro = route.indexOf("installTerraOsTeaserHostMicroMotion(frame)");
    const reference = route.indexOf("installTerraOsTeaserMobileReferenceHero(frame)");
    const handoff = route.indexOf("installTerraOsTeaserHeroHandoff(frame)");

    expect(micro).toBeGreaterThan(-1);
    expect(reference).toBeGreaterThan(micro);
    expect(handoff).toBeGreaterThan(reference);
  });
});
