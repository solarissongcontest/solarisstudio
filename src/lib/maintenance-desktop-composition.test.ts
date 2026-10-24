import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { renderMaintenanceHodPortal } from "./maintenance-hod-portal";
import { renderMaintenancePage } from "./maintenance-page";

const css = readFileSync("public/assets/terraos-maintenance.css", "utf8");

describe("maintenance responsive composition", () => {
  const page = renderMaintenancePage(new Date("2026-10-24T20:00:00Z"));
  const portal = renderMaintenanceHodPortal({
    supabaseUrl: "http://127.0.0.1:54321",
    publishableKey: "test-publishable-key",
  });

  it("uses a dedicated wide-screen TerraOS product composition", () => {
    expect(page).toContain("hero-device-main");
    expect(page).toContain("hero-device-left");
    expect(page).toContain("hero-device-right");
    expect(page).toContain('class="feature-inner"');
    expect(css).toContain("grid-template-columns:minmax(340px,.72fr) minmax(560px,1.28fr)");
    expect(css).toContain("grid-template-columns:minmax(300px,.72fr) minmax(540px,1.28fr)");
  });

  it("gives Home, Participate, Explore, Results and Me standalone editorial chapters", () => {
    expect(page).toContain('id="solaris-now"');
    expect(page).toContain('id="participate-feature"');
    expect(page).toContain('id="explore-feature"');
    expect(page).toContain('id="results-feature"');
    expect(page).toContain('id="me-feature"');
    expect(page).toContain("What matters,<br />now.");
    expect(page).toContain("Know exactly<br />what needs you.");
    expect(page).toContain("More Solaris.<br />Less searching.");
    expect(page).toContain("See what<br />happened.");
    expect(page).toContain("Your<br />Solaris.");
  });

  it("keeps Confirmation as a desktop workspace with separate context and action columns", () => {
    expect(portal).toContain("grid-template-columns: minmax(0, .72fr) minmax(0, 1.28fr)");
    expect(portal).toContain(".hod-portal > .hod-state {");
    expect(portal).toContain("border-left: 1px solid rgba(157,223,242,.10)");
    expect(portal).toContain("width: min(calc(100% - 8rem), 1180px)");
  });

  it("uses explicit phone composition rather than shrinking desktop overlays", () => {
    expect(css).toContain("@media(max-width:680px)");
    expect(css).toContain(".hero-device-left,.hero-device-right{display:none}");
    expect(css).toContain(".immersive-status,.immersive-liquid{position:static!important;transform:none!important");
    expect(css).toContain(".live-copy{position:static}");
    expect(css).toContain("grid-auto-columns:84vw");
    expect(portal).toContain("@media (max-width: 640px)");
  });
});
