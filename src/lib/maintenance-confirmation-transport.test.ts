import { describe, expect, it } from "vitest";

import {
  MAINTENANCE_CONFIRMATION_API_PATH,
  isMaintenanceHodAppRouteAllowed,
} from "./maintenance";

describe("maintenance Confirmation transport isolation", () => {
  it("allows only the exact maintenance Confirmation POST transport", () => {
    expect(MAINTENANCE_CONFIRMATION_API_PATH).toBe("/api/maintenance-confirmation");
    expect(
      isMaintenanceHodAppRouteAllowed(
        MAINTENANCE_CONFIRMATION_API_PATH,
        "POST",
        true,
      ),
    ).toBe(true);

    for (const method of ["GET", "HEAD", "PUT", "PATCH", "DELETE", "OPTIONS", "post"]) {
      expect(
        isMaintenanceHodAppRouteAllowed(
          MAINTENANCE_CONFIRMATION_API_PATH,
          method,
          true,
        ),
      ).toBe(false);
    }

    expect(
      isMaintenanceHodAppRouteAllowed(
        `${MAINTENANCE_CONFIRMATION_API_PATH}/`,
        "POST",
        true,
      ),
    ).toBe(false);
    expect(
      isMaintenanceHodAppRouteAllowed(
        MAINTENANCE_CONFIRMATION_API_PATH,
        "POST",
        false,
      ),
    ).toBe(false);
  });

  it("keeps generic TanStack server functions and unrelated writes fail-closed", () => {
    for (const pathname of [
      "/_serverFn",
      "/_serverFn/",
      "/_serverFn/fake-id",
      "/api/anything",
      "/api/maintenance-confirmation/other",
    ]) {
      expect(isMaintenanceHodAppRouteAllowed(pathname, "POST", true)).toBe(false);
    }
  });
});
