import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const start = readFileSync("src/start.ts", "utf8");
const page = readFileSync("src/lib/maintenance-page.ts", "utf8");
const config = readFileSync("src/lib/maintenance.ts", "utf8");

describe("emergency global maintenance mode", () => {
  it("is explicitly enabled and runs before normal request middleware", () => {
    expect(config).toContain("GLOBAL_MAINTENANCE_MODE = true");
    expect(start).toContain(
      "requestMiddleware: [maintenanceMiddleware, errorMiddleware, csrfMiddleware]",
    );
    expect(start).toContain('status: 503');
  });

  it("uses the canonical Solaris visual system and reduced-motion-safe animation", () => {
    expect(page).toContain('font-family: "Classica Crastao"');
    expect(page).toContain('font-family: "Gotham"');
    expect(page).toContain('url("/solaris-background.webp")');
    expect(page).toContain("@media (prefers-reduced-motion: no-preference)");
    expect(page).toContain("@keyframes reveal-panel");
    expect(page).toContain("@keyframes aurora-one");
    expect(page).toContain('class="recovery-visual"');
    expect(page).toContain('class="recovery-stage"');
    expect(page).toContain('class="tsbc-core"');
    expect(page).toContain("<span>TSBC</span>");
    expect(page).toContain("@keyframes orbit-one-motion");
    expect(page).toContain("@keyframes recovery-scan");
    expect(page).toContain("@keyframes recovery-ping");
    expect(page).toContain("@keyframes core-breathe");
    expect(page).toContain("@keyframes spark-float-a");
    expect(page).not.toContain('class="core-star"');
    expect(page).not.toContain('class="grid-plane"');
    expect(page).toContain("@media (prefers-reduced-motion: reduce)");
  });

  it("publishes the return date and deadline postponement", () => {
    expect(config).toContain('"10 October 2026"');
    expect(page).toContain(
      "All deadlines scheduled during this outage will be postponed.",
    );
    expect(page).toContain("Terra Solaris Broadcasting Coalition");
    expect(page).not.toContain('<img class="tsbc-mark"');
  });

  it("blocks writes while still allowing the maintenance branding assets", () => {
    expect(start).toContain('request.method === "GET" || request.method === "HEAD"');
    expect(start).toContain('"solaris_studio_maintenance"');
    expect(start).toContain('"/tsbc-maintenance-mark.svg"');
    expect(start).toContain('"/solaris-studio-mark.png"');
    expect(start).toContain('"retry-after": "Sat, 10 Oct 2026 00:00:00 GMT"');
    expect(start).toContain('"x-robots-tag": "noindex, nofollow"');
    expect(page).toContain('<meta name="robots" content="noindex, nofollow" />');
  });
});
