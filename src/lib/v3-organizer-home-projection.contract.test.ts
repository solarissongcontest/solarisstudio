import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync("src/routes/_authenticated/admin/operations.tsx", "utf8");

describe("V3 Organizer Home projection", () => {
  it("uses the canonical Organizer projection for Do now and live risk", () => {
    expect(route).toContain("useV3OrganizerProjection(activeEdition?.id)");
    expect(route).toContain("projection.tasks.total");
    expect(route).toContain("projection.live.editionState");
    expect(route).toContain("projection.live.overallHealth");
    expect(route).toContain("projection.risk");
  });

  it("does not silently restore the legacy parallel readiness heuristic", () => {
    expect(route).not.toContain("buildEditionReadiness");
    expect(route).not.toContain("useAdminReadinessData");
    expect(route).not.toContain("useAllShows");
    expect(route).not.toContain("readiness?.progress");
  });

  it("fails closed when projection truth is unavailable instead of displaying a false green state", () => {
    expect(route).toContain("Organizer state unavailable");
    expect(route).toContain("Solaris could not verify Organizer state");
    expect(route).toContain("projectionQuery.error");
  });
});
