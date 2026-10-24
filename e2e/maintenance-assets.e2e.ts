import { expect, test } from "@playwright/test";

const ARTWORK = [
  "/terraos-maintenance/blue-motion.svg",
  "/terraos-maintenance/live-stage.svg",
  "/terraos-maintenance/purple-tunnel.svg",
] as const;

test("TerraOS editorial artwork remains available while the app is maintenance-gated", async ({
  request,
}) => {
  for (const asset of ARTWORK) {
    const response = await request.get(asset);
    expect(response.status(), `${asset} should bypass the maintenance 503 page`).toBe(200);
    expect(response.headers()["content-type"] ?? "").toContain("image/svg+xml");
    expect((await response.text()).startsWith("<svg")).toBe(true);
  }
});
