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
  it("keeps Flag QA at building while the governed command cutover is integrated", () => {
    expect(capability).toBeDefined();
    expect(capability?.migrationStatus).toBe("building");
    expect(capability?.migrationStatus).not.toBe("parity");
    expect(capability?.classification).toBe("restrict");
    expect(capability?.targetDomain).toBe("product-qa");
    expect(capability?.legacyRoutes).toContain("/admin/flag-audit");
  });

  it("ties building status to canonical preflight, state version and stable operation identity", () => {
    expect(route).toContain("type PendingCropReview");
    expect(route).toContain("preflightCountryFlagCropV3(country.id)");
    expect(route).toContain("expectedStateVersion: preflight.stateVersion");
    expect(route).toContain("updateCountryFlagCropV3({");
    expect(route).toContain("operationId: review.operationId");
    expect(route).toContain("idempotencyKey: review.idempotencyKey");
    expect(route).toContain("reconciles this same operation ID");
    expect(route).not.toContain('.from("countries")');
    expect(route).not.toContain("existing legacy country metadata write");
  });
});