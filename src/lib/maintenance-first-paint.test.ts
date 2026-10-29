import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { renderMaintenancePage } from "./maintenance-page";

// #1699 replaced the dated progressive teaser with the complete maintenance
// story. First paint must expose real content before its optional motion boots.
describe("TerraOS maintenance first paint", () => {
  it.each(["2026-10-18", "2026-10-19", "2026-10-20", "2026-10-21"])("renders the complete story on %s", (date) => {
    const html = renderMaintenancePage(new Date(`${date}T12:00:00Z`));
    for (const id of ["overview", "solaris-now", "results-feature", "me-feature", "preview"]) {
      expect(html).toContain(`id="${id}"`);
    }
    for (const screen of ["home", "explore", "participate", "results", "me"]) {
      expect(html).toContain(`screen=${screen}&chrome=content`);
    }
    expect(html).not.toContain("data-next-reveal=");
    expect(html).not.toContain("data-locked-copy");
  });

  it("ships the stylesheet at first paint and loads motion after the story", () => {
    const html = renderMaintenancePage();
    expect(html.indexOf('/assets/terraos-maintenance.css')).toBeLessThan(html.indexOf("</head>"));
    const motionScript = html.match(/<script src="\/assets\/terraos-maintenance\.js\?v=[^"\s]+"><\/script>/);
    expect(motionScript).not.toBeNull();
    expect(html.indexOf(motionScript![0])).toBeGreaterThan(html.indexOf("</main>"));
    const css = readFileSync("public/assets/terraos-maintenance.css", "utf8");
    expect(css).toContain("@media(prefers-reduced-motion:reduce)");
    expect(css).toContain(".scroll-in{opacity:1!important;transform:none!important}");
  });

  it("stops presenting an expired arrival estimate as a future promise", () => {
    expect(renderMaintenancePage(new Date("2000-01-01"))).toContain("Estimated arrival");
    const expired = renderMaintenancePage(new Date("2100-01-01"));
    expect(expired).toContain("TerraOS 3 is being prepared.");
    expect(expired).not.toContain('<span class="arrival-label">Estimated arrival</span>');
  });
});
