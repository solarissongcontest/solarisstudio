import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const server = readFileSync("src/server.ts", "utf8");
const start = readFileSync("src/start.ts", "utf8");
const page = readFileSync("src/lib/maintenance-page.ts", "utf8");
const config = readFileSync("src/lib/maintenance.ts", "utf8");
const envExample = readFileSync(".env.example", "utf8");

describe("emergency global maintenance mode", () => {
  it("is explicitly enabled and runs at the Worker entry before normal request middleware", () => {
    expect(config).toContain("GLOBAL_MAINTENANCE_MODE = true");
    expect(server).toContain("return maintenanceResponse(request)");
    expect(server).toContain("status: 503");
    expect(start).toContain("requestMiddleware: [errorMiddleware, csrfMiddleware]");
    expect(start).not.toContain("maintenanceMiddleware");
  });

  it("keeps a Supabase-independent, server-only maintenance bypass for administrators", () => {
    expect(server).toContain('MAINTENANCE_ADMIN_SECRET');
    expect(server).toContain('const MAINTENANCE_ADMIN_PATH = "/__maintenance-admin"');
    expect(server).toContain('await hasValidMaintenanceBypass(request, secret)');
    expect(server).toContain('HttpOnly; Secure; SameSite=Strict');
    expect(server).toContain('It does not grant Solaris account or Organizer permissions.');
    expect(server).not.toContain('x-solaris-maintenance-bypass');
    expect(envExample).toContain('MAINTENANCE_ADMIN_SECRET=');
    expect(envExample).not.toContain('VITE_MAINTENANCE_ADMIN_SECRET');
  });

  it("allows browser CI to audit the hidden application only on localhost", () => {
    expect(server).toContain('SOLARIS_E2E_BYPASS_MAINTENANCE !== "1"');
    expect(server).toContain('url.hostname === "127.0.0.1" || url.hostname === "localhost"');
    expect(server).toContain('solaris_e2e_maintenance_bypass');
    expect(server).toContain('!hasLocalE2EMaintenanceBypass(request)');
    expect(server).not.toContain('VITE_SOLARIS_E2E_BYPASS_MAINTENANCE');
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
    expect(page).toContain('<div class="tsbc-core"><img src="/solaris-studio-mark.png"');
    expect(page.match(/src="\/solaris-studio-mark\.png"/g)?.length).toBe(2);
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
    expect(server).toContain('request.method === "GET" || request.method === "HEAD"');
    expect(server).toContain('"solaris_studio_maintenance"');
    expect(server).toContain('"/tsbc-maintenance-mark.svg"');
    expect(server).toContain('"/solaris-studio-mark.png"');
    expect(server).toContain('"/solaris-background.webp"');
    expect(server).toContain('"/sw.js"');
    expect(server).toContain('"/offline.html"');
    expect(server).toContain('"retry-after": "Sat, 10 Oct 2026 00:00:00 GMT"');
    expect(server).toContain('"x-robots-tag": "noindex, nofollow"');
    expect(page).toContain('<meta name="robots" content="noindex, nofollow" />');
  });
});
