import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("TerraOS teaser preview isolation", () => {
  const route = source("src/routes/terraos-teaser-preview.tsx");
  const root = source("src/routes/__root.tsx");
  const overlays = source("src/components/app/AppOverlayManager.tsx");
  const vitals = source("src/lib/public-web-vitals.ts");

  it("exists only while global maintenance is active", () => {
    expect(route).toContain("GLOBAL_MAINTENANCE_MODE");
    expect(route).toContain("requireTerraOsTeaserMaintenance(GLOBAL_MAINTENANCE_MODE)");
    expect(route).toContain('from "@/lib/terraos-teaser-preview-access"');
  });

  it("does not mount account-aware root services in fixture preview frames", () => {
    expect(root).toContain('pathname === TERRAOS_TEASER_PREVIEW_PATH');
    expect(root).toContain("!teaserPreview ? (");
    expect(root).toContain("<AccountCacheIsolation />");
    expect(root).toContain("<RulesGovernanceContext />");
  });

  it("does not mount overlays or record iframe web-vitals telemetry", () => {
    expect(overlays).toContain("if (teaserPreview) return null");
    expect(vitals).toContain("window.location.pathname === TERRAOS_TEASER_PREVIEW_PATH");
  });
});
