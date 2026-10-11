import { describe, expect, it } from "vitest";

import {
  evaluateV3CapabilityRequirement,
  projectV3SurfaceAccess,
} from "./v3-capabilities";

describe("V3 capability projection", () => {
  it("requires every allOf capability", () => {
    expect(
      evaluateV3CapabilityRequirement(["edition.read"], {
        allOf: ["edition.read", "results.preview"],
      }),
    ).toMatchObject({
      visible: false,
      enabled: false,
      reason: "missing_all",
      missing: ["results.preview"],
    });
  });

  it("accepts any one capability from an anyOf requirement", () => {
    expect(
      evaluateV3CapabilityRequirement(["publishing.publish"], {
        anyOf: ["results.publish", "publishing.publish"],
      }),
    ).toMatchObject({ visible: true, enabled: true, reason: "allowed" });
  });

  it("does not infer authority from display-role strings", () => {
    expect(projectV3SurfaceAccess("organizer_mode", ["organizer", "hod", "superadmin"])).toMatchObject({
      visible: false,
      enabled: false,
    });
  });

  it("shows organizer mode when a real operational capability is present", () => {
    expect(projectV3SurfaceAccess("organizer_mode", ["voting.manage"])).toMatchObject({
      visible: true,
      enabled: true,
    });
  });

  it("maps confirmation management to the existing Permission Engine key", () => {
    expect(projectV3SurfaceAccess("confirmation_manage", ["confirmation.manage"]).visible).toBe(true);
    expect(projectV3SurfaceAccess("confirmation_manage", ["confirmation.read"]).visible).toBe(false);
  });

  it("maps entry editing to entry.edit instead of inventing a V3 capability", () => {
    expect(projectV3SurfaceAccess("entry_edit", ["entry.edit"]).visible).toBe(true);
    expect(projectV3SurfaceAccess("entry_edit", ["entry.read_private"]).visible).toBe(false);
  });

  it("permits jury management through either the specific or broader voting capability", () => {
    expect(projectV3SurfaceAccess("jury_manage", ["jury.ballots.manage"]).visible).toBe(true);
    expect(projectV3SurfaceAccess("jury_manage", ["voting.manage"]).visible).toBe(true);
  });

  it("keeps result publication separate from read/preview capability", () => {
    expect(projectV3SurfaceAccess("results_publish", ["results.preview"]).visible).toBe(false);
    expect(projectV3SurfaceAccess("results_publish", ["results.publish"]).visible).toBe(true);
  });

  it("restricts role-management UI to permissions.manage", () => {
    expect(projectV3SurfaceAccess("roles_manage", ["permissions.read"]).visible).toBe(false);
    expect(projectV3SurfaceAccess("roles_manage", ["permissions.manage"]).visible).toBe(true);
  });
});
