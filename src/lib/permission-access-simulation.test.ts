import { describe, expect, it } from "vitest";

import {
  ORGANIZER_ACCESS_SURFACES,
  buildOrganizerAccessSimulation,
} from "./permission-access-simulation";
import { SOLARIS_CAPABILITIES } from "./permissions-v2";

describe("read-only Organizer access simulation", () => {
  it("models the seven canonical Organizer domains", () => {
    expect(ORGANIZER_ACCESS_SURFACES.map((surface) => surface.id)).toEqual([
      "overview",
      "contest",
      "operations",
      "voting-results",
      "rules-integrity",
      "publishing",
      "administration",
    ]);
  });

  it("derives visible routes and enabled actions from capabilities", () => {
    const simulation = buildOrganizerAccessSimulation([
      "delegation.read",
      "entry.approve",
      "communications.read",
      "communications.send",
    ]);

    expect(simulation.visibleSurfaceCount).toBe(2);
    expect(simulation.allowedRouteCount).toBe(2);
    expect(simulation.enabledActionCount).toBe(2);
    expect(simulation.surfaces.find((surface) => surface.id === "contest")?.visible).toBe(true);
    expect(simulation.surfaces.find((surface) => surface.id === "administration")?.visible).toBe(
      false,
    );
  });

  it("uses only capabilities in the canonical taxonomy", () => {
    const known = new Set<string>(SOLARIS_CAPABILITIES);
    for (const surface of ORGANIZER_ACCESS_SURFACES) {
      for (const item of [...surface.routes, ...surface.actions]) {
        expect(known.has(item.capability)).toBe(true);
      }
    }
  });
});
