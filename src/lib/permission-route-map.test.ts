import { describe, expect, it } from "vitest";

import { capabilityForOrganizerPath } from "./permission-route-map";

describe("Organizer permission shadow routing", () => {
  it.each([
    ["/admin/access-permissions", "permissions.read"],
    ["/admin/feature-rollout", "rollout.read"],
    ["/admin/communications", "communications.read"],
    ["/admin/rules-manager", "rules.read"],
    ["/admin/integrity-evidence", "integrity.read"],
    ["/admin/results-reveal", "results.preview"],
    ["/admin/jury/ssc-21", "voting.read"],
    ["/admin/broadcast-rundown", "broadcast.read"],
    ["/admin/storytelling", "story.read"],
    ["/admin/media-assets", "publishing.read"],
    ["/admin/hosts", "host.read"],
    ["/admin/entries/ssc-21", "entry.read_private"],
    ["/admin/countries", "delegation.read"],
    ["/admin/operations", "edition.read"],
  ])("maps %s to %s", (pathname, capability) => {
    expect(capabilityForOrganizerPath(pathname)).toBe(capability);
  });

  it("does not classify non-Organizer routes", () => {
    expect(capabilityForOrganizerPath("/my-solaris")).toBeNull();
    expect(capabilityForOrganizerPath("/rules")).toBeNull();
  });
});
