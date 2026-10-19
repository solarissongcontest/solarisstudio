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

  it("keeps the compact base mobile tableau with all three phones available immediately", () => {
    const maintenance = maintenanceSource();
    expect(maintenance).toContain(".hero-stage { width:126vw; height:320px; margin-top:1.7rem; }");
    expect(maintenance).toContain(".phone { width:178px; height:385px; border-radius:30px; }");
    expect(maintenance).toContain(".phone.center { z-index:3; transform:translate(-50%,-46%); }");
    expect(maintenance).toContain(".phone.left { transform:translate(calc(-135% - var(--hero-side-spread)),-32%) rotateY(15deg) rotateZ(-5deg) scale(.78); }");
    expect(maintenance).toContain(".phone.right { transform:translate(calc(35% + var(--hero-side-spread)),-32%) rotateY(-15deg) rotateZ(5deg) scale(.78); }");
  });

  it("keeps all three real preview frames in the hero markup", () => {
    const maintenance = maintenanceSource();
    expect(maintenance).toContain('class="phone left"');
    expect(maintenance).toContain('screen=participate');
    expect(maintenance).toContain('class="phone center"');
    expect(maintenance).toContain('screen=home');
    expect(maintenance).toContain('class="phone right"');
    expect(maintenance).toContain('screen=explore');
  });
});
