import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { V3_PUBLIC_ROUTE_DISCOVERED_CAPABILITIES } from "./v3-public-capability-supplements";

const route = readFileSync("src/routes/sitemap[.]xml.ts", "utf8");
const audit = readFileSync("e2e/public-routes.e2e.ts", "utf8");
const helpers = readFileSync("e2e/audit-helpers.ts", "utf8");

describe("V3 Public sitemap cutover", () => {
  it("keeps one public server-owned sitemap surface with a static fail-safe inventory", () => {
    expect(route).toContain('createFileRoute("/sitemap.xml")');
    expect(route).toContain("GET: async ({ request }) =>");
    expect(route).toContain('{ path: "/participate"');
    expect(route).toContain('{ path: "/results"');
    expect(route).toContain('{ path: "/rules"');
    expect(route).toContain("Static routes are still returned if public data cannot be loaded.");
    expect(route).not.toContain("service_role");
  });

  it("expands only public edition/country discovery data and never publishes mutation authority", () => {
    expect(route).toContain('.from("editions").select("slug").eq("published", true)');
    expect(route).toContain('.from("countries").select("short_code")');
    expect(route).not.toContain(".insert(");
    expect(route).not.toContain(".update(");
    expect(route).not.toContain(".delete(");
    expect(route).not.toContain("rpc(");
  });

  it("is consumed by browser certification for real representative dynamic routes", () => {
    expect(audit).toContain("sitemapRoutes(baseURL!)");
    expect(audit).toContain("Sitemap should expose representative Country and Wiki routes");
    expect(helpers).toContain("sitemap.xml");
  });

  it("is registered as the accepted Public discovery owner", () => {
    const capability = V3_PUBLIC_ROUTE_DISCOVERED_CAPABILITIES.find((row) => row.id === "sitemap");
    expect(capability?.specificationStatus).toBe("cutover");
    expect(capability?.migrationEvidence).toContain("v3-public-sitemap-cutover.contract.test.ts");
  });
});
