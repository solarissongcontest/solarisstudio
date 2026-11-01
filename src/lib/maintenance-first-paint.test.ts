import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { renderMaintenancePage } from "./maintenance-page";

const css = readFileSync("public/assets/terraos-maintenance.css", "utf8");

describe("TerraOS 3 mature maintenance first paint", () => {
  it("server-renders the complete mature story even for dates from the retired reveal campaign", () => {
    for (const now of [
      new Date("2026-10-18T13:00:00+03:00"),
      new Date("2026-10-19T00:01:00+03:00"),
      new Date("2026-10-20T00:01:00+03:00"),
      new Date("2026-10-21T00:01:00+03:00"),
    ]) {
      const teaser = renderMaintenancePage(now);

      for (const fragment of [
        "A new generation of Solaris.",
        "Everything<br />in its place.",
        "What matters,<br />now.",
        "Know exactly<br />what needs you.",
        "More Solaris.<br />Less searching.",
        "See what<br />happened.",
        "Your<br />Solaris.",
        "Take a closer look.",
      ]) {
        expect(teaser).toContain(fragment);
      }

      expect(teaser).not.toContain("data-terraos-teaser-phase");
      expect(teaser).not.toContain("data-next-reveal");
      expect(teaser).not.toContain("More on 19.10");
      expect(teaser).not.toContain("More on 20.10");
      expect(teaser).not.toContain("More on 21.10");
    }
  });

  it("keeps the product hero fully present in the initial HTML while presentation lives in the static stylesheet", () => {
    const teaser = renderMaintenancePage(new Date("2026-10-18T13:00:00+03:00"));

    expect(teaser).toContain('class="hero" id="overview"');
    expect(teaser).toContain('class="hero-grid"');
    expect(teaser).toContain('class="hero-copy"');
    expect(teaser).toContain('class="hero-product"');
    expect(teaser).toContain('class="hero-device hero-device-main"');
    expect(teaser).toContain('data-hero');
    expect(css).toContain(".hero-grid{");
    expect(css).toContain(".hero-product{");
    expect(css).toContain(".hero-device-main{");
    expect(css).toContain("prefers-reduced-motion:reduce");
  });

  it("ships all five fixture-safe product previews without waiting for client-side reveal logic", () => {
    const teaser = renderMaintenancePage(new Date("2026-10-18T13:00:00+03:00"));

    for (const screen of ["home", "explore", "participate", "results", "me"]) {
      expect(teaser).toContain(`/terraos-teaser-preview?screen=${screen}&chrome=content`);
    }
    expect(teaser).toContain('id="confirmation-access"');
    expect(teaser).toContain('data-confirmation-host');
  });
});
