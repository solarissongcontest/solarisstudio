import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { renderMaintenanceDesktopV2Style } from "./maintenance-desktop-v2";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("maintenance desktop v2 composition", () => {
  const style = renderMaintenanceDesktopV2Style();

  it("owns wide-screen first-paint geometry without waiting for choreography", () => {
    expect(style).toContain("@media (min-width: 1100px)");
    expect(style).toContain("grid-template-columns: minmax(400px, 480px) minmax(520px, 650px)");
    expect(style).toContain("width: min(640px, 43vw)");
    expect(style).toContain("html[data-terraos-release-choreography=\"v2\"] .hero");
  });

  it("keeps editorial desktop sections bounded instead of stretching mobile storytelling indefinitely", () => {
    expect(style).toContain("width: min(calc(100% - 6rem), 1240px)");
    expect(style).toContain("grid-template-columns: minmax(290px, .68fr) minmax(560px, 1.32fr)");
    expect(style).toContain("max-height: min(600px, 78svh)");
    expect(style).toContain("min-height: 155svh");
    expect(style).toContain("min-height: 150svh");
    expect(style).toContain("min-height: 165svh");
  });

  it("keeps desktop sticky storytelling deliberate and provides a Reduced Motion flattening path", () => {
    expect(style).toContain(".story-touch .story-heading");
    expect(style).toContain(".participation-story .sticky-heading");
    expect(style).toContain("position: sticky !important");
    expect(style).toContain('data-terraos-reduced-motion="true"');
    expect(style).toContain("position: static !important");
    expect(style).toContain("min-height: auto !important");
  });

  it("does not alter phone/tablet maintenance geometry", () => {
    expect(style).not.toContain("@media (max-width:");
    expect(style).not.toContain("@media (min-width: 0px)");
  });

  it("is injected server-side on maintenance GET responses independent of HOD portal availability", () => {
    const server = source("src/server.ts");
    const importIndex = server.indexOf('import { renderMaintenanceDesktopV2Style } from "./lib/maintenance-desktop-v2";');
    const portalBlock = server.indexOf("if (request.method === \"GET\" && includeHodPortal)");
    const desktopBlock = server.indexOf("if (request.method === \"GET\")", portalBlock + 1);
    const responseIndex = server.indexOf("return new Response(request.method === \"HEAD\" ? null : html", desktopBlock);

    expect(importIndex).toBeGreaterThan(-1);
    expect(portalBlock).toBeGreaterThan(-1);
    expect(desktopBlock).toBeGreaterThan(portalBlock);
    expect(responseIndex).toBeGreaterThan(desktopBlock);
    expect(server.slice(desktopBlock, responseIndex)).toContain("renderMaintenanceDesktopV2Style()");
  });
});
