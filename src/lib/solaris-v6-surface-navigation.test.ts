import { describe, expect, it } from "vitest";

import { countrySurfaceLinks } from "@/components/surfaces/SolarisSurfaceSwitch";
import {
  resolveSolarisV6SurfacePath,
  solarisV6Feature,
} from "@/lib/solaris-v6-surface-registry";

describe("Solaris V6 cross-surface navigation", () => {
  it("resolves route templates from the Surface Registry", () => {
    expect(
      resolveSolarisV6SurfacePath("country-profile", "public", {
        country: "oland",
      }),
    ).toBe("/countries/oland");
    expect(
      resolveSolarisV6SurfacePath("participant-view", "organizer", {
        countryId: "country-22",
      }),
    ).toBe("/admin/countries/country-22?tab=participant-view");
  });

  it("fails closed when a required route parameter is missing", () => {
    expect(
      resolveSolarisV6SurfacePath("country-profile", "public"),
    ).toBeNull();
  });

  it("builds country perspective links from registry-owned paths", () => {
    const links = countrySurfaceLinks({
      countryId: "country-22",
      countryCode: "OL",
      current: "organizer",
      includeOrganizer: true,
      includeDiagnostics: true,
    });
    expect(links.map((item) => item.label)).toEqual([
      "Participant view",
      "Public page",
      "Manage",
      "Diagnostics",
    ]);
    expect(links.find((item) => item.label === "Manage")?.current).toBe(true);
    expect(links.find((item) => item.label === "Participant view")?.href).toBe(
      "/my-solaris/tasks?country=country-22",
    );
  });

  it("does not expose Organizer or diagnostic surfaces to ordinary participants", () => {
    const links = countrySurfaceLinks({
      countryId: "country-22",
      countryCode: "OL",
      current: "participant",
      includeOrganizer: false,
      includeDiagnostics: false,
    });
    expect(links.map((item) => item.label)).toEqual([
      "Participant view",
      "Public page",
    ]);
    expect(links.some((item) => item.perspective === "organizer")).toBe(false);
    expect(links.some((item) => item.perspective === "diagnostic")).toBe(false);
  });

  it("keeps the switch tied to canonical domain definitions", () => {
    expect(solarisV6Feature("participant-view")?.canonicalDomain).toBe(
      "participation",
    );
    expect(solarisV6Feature("country-profile")?.canonicalDomain).toBe(
      "country-profile",
    );
  });
});
