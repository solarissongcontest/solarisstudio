import { expect, test } from "@playwright/test";

const VECTOR_ARTWORK = [
  "/terraos-maintenance/blue-motion.svg",
  "/terraos-maintenance/live-stage.svg",
  "/terraos-maintenance/purple-tunnel.svg",
  "/assets/terraos-maintenance/moment-a.svg?v=e2e-contract",
  "/assets/terraos-maintenance/moment-b.svg?v=e2e-contract",
] as const;

const RASTER_ARTWORK = [
  ["/solaris-background.webp", "image/webp"],
  ["/solaris-studio-social.jpg", "image/jpeg"],
  ["/assets/terraos-maintenance/atmosphere.jpeg", "image/jpeg"],
] as const;

const PRESENTATION_ASSETS = [
  ["/assets/terraos-maintenance.css", "text/css"],
  ["/assets/terraos-maintenance.js?v=e2e-contract", "javascript"],
  ["/assets/terraos-maintenance-story.css", "text/css"],
  ["/assets/terraos-maintenance-story.js", "javascript"],
  ["/assets/terraos-maintenance-story-polish.js", "javascript"],
] as const;

test("TerraOS editorial assets remain available while the app is maintenance-gated", async ({ request }) => {
  for (const asset of VECTOR_ARTWORK) {
    const response = await request.get(asset);
    expect(response.status(), `${asset} should bypass the maintenance 503 page`).toBe(200);
    expect(response.headers()["content-type"] ?? "").toContain("image/svg+xml");
    const body = await response.text();
    expect(body).toContain("<svg");
    expect(body.length).toBeGreaterThan(120);
  }

  for (const [asset, contentType] of RASTER_ARTWORK) {
    const response = await request.get(asset);
    expect(response.status(), `${asset} should bypass the maintenance 503 page`).toBe(200);
    expect(response.headers()["content-type"] ?? "").toContain(contentType);
    expect((await response.body()).byteLength).toBeGreaterThan(1_000);
  }

  for (const [asset, contentType] of PRESENTATION_ASSETS) {
    const response = await request.get(asset);
    expect(response.status(), `${asset} should bypass the maintenance 503 page`).toBe(200);
    expect(response.headers()["content-type"] ?? "").toContain(contentType);
    expect((await response.text()).length).toBeGreaterThan(500);
  }
});
