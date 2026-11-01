import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const routeSource = () =>
  readFileSync(resolve(process.cwd(), "src/routes/terraos-teaser-preview.tsx"), "utf8");
const maintenanceSource = () =>
  readFileSync(resolve(process.cwd(), "src/lib/maintenance-page.ts"), "utf8");
const maintenanceCss = () =>
  readFileSync(resolve(process.cwd(), "public/assets/terraos-maintenance.css"), "utf8");

describe("TerraOS responsive hero preview composition", () => {
  it("does not reinstall the superseded phased mobile hero sequencing", () => {
    const route = routeSource();
    expect(route).not.toContain("installTerraOsTeaserMobileHeroSequencing");
    expect(route).not.toContain("installTerraOsTeaserMobileHeroPeek");
    expect(route).toContain("installTerraOsTeaserHostMicroMotion(frame)");
    expect(route).toContain("installTerraOsTeaserHeroHandoff(frame)");
  });

  it("keeps the three-preview desktop composition but deliberately reduces it to one primary device on narrow phones", () => {
    const css = maintenanceCss();
    expect(css).toContain(".hero-device-main{");
    expect(css).toContain(".hero-device-left,.hero-device-right{");
    expect(css).toContain("@media(max-width:680px)");
    expect(css).toContain(".hero-device-left,.hero-device-right{display:none}");
  });

  it("keeps all three real fixture-safe preview frames in server-rendered hero markup", () => {
    const maintenance = maintenanceSource();
    expect(maintenance).toContain('class="hero-device hero-device-left"');
    expect(maintenance).toContain('previewFrame("participate"');
    expect(maintenance).toContain('class="hero-device hero-device-main"');
    expect(maintenance).toContain('previewFrame("home"');
    expect(maintenance).toContain('class="hero-device hero-device-right"');
    expect(maintenance).toContain('previewFrame("explore"');
  });
});
