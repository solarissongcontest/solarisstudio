import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { V3_ORGANIZER_CAPABILITY_REGISTRY } from "./v3-organizer-capability-registry";

const route = readFileSync(
  resolve(process.cwd(), "src/routes/_authenticated/admin/flag-audit.tsx"),
  "utf8",
);

const capability = V3_ORGANIZER_CAPABILITY_REGISTRY.find(
  (item) => item.legacyId === "workspace-flag-qa",
);

describe("V3 Organizer Flag QA building evidence", () => {
  it("marks the shipped Flag QA work as building without claiming parity", () => {
    expect(capability).toBeDefined();
    expect(capability?.migrationStatus).toBe("building");
    expect(capability?.migrationStatus).not.toBe("parity");
    expect(capability?.classification).toBe("restrict");
    expect(capability?.targetDomain).toBe("product-qa");
    expect(capability?.legacyRoutes).toContain("/admin/flag-audit");
  });

  it("ties building status to the merged frozen-review and stale-state boundary", () => {
    expect(route).toContain("type PendingCropReview");
    expect(route).toContain("function requestSave()");
    expect(route).toContain("<AdminConfirmSheet");
    expect(route).toContain('.select("id,name,flag_image,flag_crop_x,flag_crop_y,flag_crop_zoom")');
    expect(route).toContain("liveCountry.flag_image !== pendingReview.sourceImage");
    expect(route).toContain("!sameCrop(liveCrop, pendingReview.before)");
    expect(route).toContain("existing legacy country metadata write");
    expect(route).toContain("does not claim a versioned, idempotent or receipted System operation");
  });
});