import { expect, test } from "@playwright/test";

const VECTOR_ARTWORK = [
  "/terraos-maintenance/blue-motion.svg",
  "/terraos-maintenance/live-stage.svg",
  "/terraos-maintenance/purple-tunnel.svg",
] as const;

const RASTER_ARTWORK = [
  ["/solaris-background.webp", "image/webp"],
  ["/solaris-studio-social.jpg", "image/jpeg"],
] as const;

test("TerraOS editorial artwork remains available while the app is maintenance-gated", async ({ request }) => {
  for (const asset of VECTOR_ARTWORK) {
    const response = await request.get(asset);
    expect(response.status(), `${asset} should bypass the maintenance 503 page`).toBe(200);
    expect(response.headers()["content-type"] ?? "").toContain("image/svg+xml");
    expect((await response.text()).startsWith("<svg")).toBe(true);
  }

  for (const [asset, contentType] of RASTER_ARTWORK) {
    const response = await request.get(asset);
    expect(response.status(), `${asset} should bypass the maintenance 503 page`).toBe(200);
    expect(response.headers()["content-type"] ?? "").toContain(contentType);
    expect((await response.body()).byteLength).toBeGreaterThan(1_000);
  }
});
