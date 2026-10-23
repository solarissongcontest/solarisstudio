import { describe, expect, it } from "vitest";

import { renderMaintenanceHodPortal } from "./maintenance-hod-portal";

describe("maintenance desktop composition", () => {
  const portal = renderMaintenanceHodPortal({
    supabaseUrl: "http://127.0.0.1:54321",
    publishableKey: "test-publishable-key",
  });

  it("uses a dedicated wide-screen hero composition instead of scaling the mobile stack", () => {
    expect(portal).toContain("@media (min-width: 1100px)");
    expect(portal).toContain("grid-template-columns: minmax(420px, 520px) minmax(560px, 700px)");
    expect(portal).toContain(".hero-copy {");
    expect(portal).toContain("text-align: left");
    expect(portal).toContain(".hero-stage {");
    expect(portal).toContain("width: min(700px, 46vw)");
  });

  it("turns Confirmation access into a desktop workspace with separate context and action columns", () => {
    expect(portal).toContain("grid-template-columns: minmax(0, .72fr) minmax(0, 1.28fr)");
    expect(portal).toContain(".hod-portal > .hod-state {");
    expect(portal).toContain("border-left: 1px solid rgba(157,223,242,.10)");
    expect(portal).toContain("width: min(calc(100% - 8rem), 1180px)");
  });

  it("gives the first product story an intentional desktop editorial layout", () => {
    expect(portal).toContain(".product-story > .story:first-child {");
    expect(portal).toContain("width: min(calc(100% - 8rem), 1280px)");
    expect(portal).toContain("grid-template-columns: minmax(300px, .68fr) minmax(0, 1.32fr)");
    expect(portal).toContain(".story-touch {");
  });

  it("keeps tablet and phone fallbacks explicit", () => {
    expect(portal).toContain("@media (min-width: 641px) and (max-width: 1099px)");
    expect(portal).toContain("@media (max-width: 640px)");
  });
});
