import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const page = readFileSync("src/lib/maintenance-page.ts", "utf8");
const server = readFileSync("src/server.ts", "utf8");

describe("TerraOS maintenance artwork routing", () => {
  it("keeps only the shipped editorial artwork reachable through the maintenance asset allowlist", () => {
    for (const asset of [
      "/terraos-maintenance/blue-motion.svg",
      "/terraos-maintenance/live-stage.svg",
      "/terraos-maintenance/purple-tunnel.svg",
    ]) {
      expect(page).toContain(asset);
      expect(server).toContain(`"${asset}"`);
    }

    expect(server).not.toContain('"/terraos-maintenance/",');
  });

  it("does not hotlink third-party photography from the maintenance renderer", () => {
    expect(page).not.toContain("images.unsplash.com");
    expect(page).not.toContain("images.pexels.com");
  });
});
