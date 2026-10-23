import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const server = readFileSync("src/server.ts", "utf8");
const freshness = readFileSync("src/lib/maintenance-freshness.ts", "utf8");
const wrangler = readFileSync("wrangler.jsonc", "utf8");

describe("maintenance access live freshness integration", () => {
  it("binds Cloudflare deployment version metadata instead of polling Solaris data", () => {
    expect(wrangler).toContain('"version_metadata"');
    expect(wrangler).toContain('"binding": "CF_VERSION_METADATA"');
    expect(server).toContain("CF_VERSION_METADATA");
    expect(server).toContain("function maintenanceDeploymentVersion(env: unknown)");
    expect(freshness).not.toContain("SUPABASE_URL");
    expect(freshness).not.toContain("/rest/v1/");
  });

  it("keeps the version endpoint behind the signed maintenance bypass", () => {
    const endpointBranch = server.indexOf("if (url.pathname === MAINTENANCE_FRESHNESS_PATH)");
    const bypassCheck = server.indexOf(
      "GLOBAL_MAINTENANCE_MODE && (await hasValidMaintenanceBypass(request, secret))",
      endpointBranch,
    );
    const response = server.indexOf("return maintenanceFreshnessResponse(", bypassCheck);
    const appHandler = server.indexOf("const handler = await getServerEntry();");

    expect(endpointBranch).toBeGreaterThanOrEqual(0);
    expect(bypassCheck).toBeGreaterThan(endpointBranch);
    expect(response).toBeGreaterThan(bypassCheck);
    expect(response).toBeLessThan(appHandler);
    expect(server).toContain("status: 404");
  });

  it("injects freshness only for the real production maintenance bypass", () => {
    const injection = server.indexOf("return await attachMaintenanceFreshness(");
    expect(injection).toBeGreaterThanOrEqual(0);
    expect(server.slice(Math.max(0, injection - 220), injection)).toContain(
      "maintenanceAdminBypass",
    );
    expect(server.slice(Math.max(0, injection - 220), injection)).toContain(
      'request.method === "GET"',
    );
    expect(freshness).toContain('headers.set("cache-control", "no-store, max-age=0")');
    expect(freshness).toContain("payload.version !== currentVersion");
    expect(freshness).toContain("window.location.reload()");
  });
});
