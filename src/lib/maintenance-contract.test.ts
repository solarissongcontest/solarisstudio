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

  it("publishes the return date and deadline postponement", () => {
    expect(config).toContain('"10 October 2026"');
    expect(page).toContain(
      "All deadlines scheduled during this outage will be postponed.",
    );
    expect(page).toContain("Terra Solaris Broadcasting Coalition");
    expect(page).toContain("/tsbc-maintenance-mark.svg");
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
