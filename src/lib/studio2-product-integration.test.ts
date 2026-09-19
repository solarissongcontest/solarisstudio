import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  STUDIO2_PRODUCT_SURFACES,
  studio2SurfaceRolloutEligible,
} from "./studio2-product-surfaces";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const adminNav = source("src/components/admin/admin-navigation.ts");
const controlRoom = source("src/routes/_authenticated/admin/control-room.tsx");
const controlRoomAlias = source("src/routes/_authenticated/admin/control-room-v2.tsx");
const rollout = source("src/routes/_authenticated/admin/feature-rollout.tsx");
const operationsPanel = source("src/components/MySolarisOperationsPanel.tsx");

describe("Studio 2 product integration", () => {
  it("keeps the Live Control Room discoverable from Organizer navigation", () => {
    expect(adminNav).toContain('"Control Room",');
    expect(adminNav).toContain('"/admin/control-room"');
    expect(controlRoom).toContain("Control Room — Solaris Organizer");
    expect(controlRoomAlias).toContain('to: "/admin/control-room"');
    expect(controlRoomAlias).not.toContain('to: "/admin/operations"');
  });

  it("keeps rollout controls discoverable while preserving Rules as a separate workstream", () => {
    expect(adminNav).toContain('"Feature rollout",');
    expect(adminNav).toContain('"/admin/feature-rollout"');
    expect(rollout).toContain("studio2_set_feature_flag");

    const rules = STUDIO2_PRODUCT_SURFACES.rules_engine;
    expect(rules.state).toBe("external_workstream");
    expect(rules.route).toBeUndefined();
    expect(studio2SurfaceRolloutEligible(rules)).toBe(false);
  });

  it("keeps delegation operations discoverable from native MySolaris content", () => {
    expect(operationsPanel).toContain("NAV_TARGETS.mySolarisTasks");
    expect(operationsPanel).toContain("NAV_TARGETS.mySolarisEntry");
    expect(operationsPanel).toContain("NAV_TARGETS.mySolarisNotices");
    expect(operationsPanel).toContain("Entry readiness");
  });
});
