import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const routeSource = () =>
  readFileSync(resolve(process.cwd(), "src/routes/terraos-teaser-preview.tsx"), "utf8");
const maintenanceSource = () =>
  readFileSync(resolve(process.cwd(), "src/lib/maintenance-page.ts"), "utf8");

describe("TerraOS mobile three-phone hero composition", () => {
  it("does not install the superseded phased mobile hero or peek overrides", () => {
    const route = routeSource();
    expect(route).not.toContain("installTerraOsTeaserMobileHeroSequencing");
    expect(route).not.toContain("installTerraOsTeaserMobileHeroPeek");
    expect(route).toContain("installTerraOsTeaserHostMicroMotion(frame)");
    expect(route).toContain("installTerraOsTeaserHeroHandoff(frame)");
  });

  it("keeps all three devices in the responsive hero composition", () => {
    const css = readFileSync(resolve(process.cwd(), "public/assets/terraos-maintenance.css"), "utf8");
    for (const device of ["main", "left", "right"]) {
      expect(css).toContain(`.hero-device-${device}`);
    }
    expect(css).toContain("overflow:clip");
    expect(css).toContain("aspect-ratio:390/844");
  });

  it("keeps all three real preview frames in the hero markup", () => {
    const maintenance = maintenanceSource();
    for (const [device, screen] of [["left", "participate"], ["main", "home"], ["right", "explore"]]) {
      expect(maintenance).toContain(`class="hero-device hero-device-${device}"`);
      expect(maintenance).toContain(`previewFrame("${screen}"`);
    }
    expect(maintenance).toContain('previewFrame("home", "TerraOS Home preview", "eager")');
  });
});
