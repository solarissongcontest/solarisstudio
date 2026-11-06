import { describe, expect, it } from "vitest";

import { renderMaintenancePage } from "./maintenance-page";

describe("TerraOS maintenance hero composition", () => {
  it("server-renders the three preview roles used by the responsive composition", () => {
    const html = renderMaintenancePage(new Date("2026-11-02T00:00:00+02:00"));

    expect(html).toContain('class="hero-device hero-device-left"');
    expect(html).toContain('class="hero-device hero-device-main"');
    expect(html).toContain('class="hero-device hero-device-right"');
    expect(html).toContain('/terraos-teaser-preview?screen=participate&chrome=content');
    expect(html).toContain('/terraos-teaser-preview?screen=home&chrome=content');
    expect(html).toContain('/terraos-teaser-preview?screen=explore&chrome=content');
  });

  it("does not encode viewport visibility as a source-text contract", () => {
    const html = renderMaintenancePage(new Date("2026-11-02T00:00:00+02:00"));

    // Visibility, containment and overflow are deliberately owned by Playwright at
    // rendered phone sizes. This unit contract only protects the semantic inputs
    // to that responsive composition.
    expect(html.match(/hero-device-left/g)?.length).toBe(1);
    expect(html.match(/hero-device-main/g)?.length).toBe(1);
    expect(html.match(/hero-device-right/g)?.length).toBe(1);
  });
});
