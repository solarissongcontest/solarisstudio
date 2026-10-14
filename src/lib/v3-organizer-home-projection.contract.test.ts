import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync("src/routes/_authenticated/admin/operations.tsx", "utf8");

describe("V3 Organizer Overview projection", () => {
  it("uses one canonical Organizer projection for operational Overview state", () => {
    expect(route).toContain("useV3OrganizerProjection(editionId || null)");
    expect(route).toContain("projection.attention");
    expect(route).toContain("projection.readiness.overall");
    expect(route).toContain("projection.upcoming[0]");
    expect(route).toContain("projection.recentChanges");
    expect(route).toContain("projection.domains");
    expect(route).toContain("projection.stateVersion");
  });

  it("does not restore page-local parallel edition, schedule, notification or readiness truth", () => {
    expect(route).not.toContain("useEditions");
    expect(route).not.toContain("useAllShows");
    expect(route).not.toContain("useAdminOperationalSchedule");
    expect(route).not.toContain("useAdminNotifications");
    expect(route).not.toContain("useAdminReadinessData");
    expect(route).not.toContain("buildEditionReadiness");
  });

  it("shows explicit scope and fails closed when projection truth is unavailable", () => {
    expect(route).toContain('data-organizer-context-lock=""');
    expect(route).toContain("projection.context.editionLabel");
    expect(route).toContain("projection.context.showLabel");
    expect(route).toContain("Organizer state unavailable");
    expect(route).toContain("projectionQuery.error");
  });

  it("keeps readiness explainable rather than displaying an unexplained percentage", () => {
    expect(route).toContain("projection.readiness.blocking");
    expect(route).toContain("projection.readiness.incomplete");
    expect(route).toContain("projection.readiness.ready");
    expect(route).toContain("Deterministic edition health");
  });
});
