import { describe, expect, it } from "vitest";
import { v3AuthorizationRequirement } from "./v3-authorization-requirement-registry";
import { assessV3S16AuthorizationReadiness } from "./v3-s16-authorization-readiness";

describe("S16 authorization model readiness", () => {
  it("accepts a verified participant boundary without inventing an Organizer capability", () => {
    expect(v3AuthorizationRequirement("confirmation.submit")).toMatchObject({
      state: "verified",
      authorizationModel: "participant-boundary",
      requiredCapability: null,
      scope: "object",
      serverBoundary: "public.v3_submit_confirmation",
    });

    const readiness = assessV3S16AuthorizationReadiness();
    expect(readiness.registryErrors).not.toContain(
      "confirmation.submit participant authorization must not impersonate an Organizer capability",
    );
    expect(readiness.incompleteVerifiedCommands).not.toContain("confirmation.submit");
  });

  it("still requires capability-backed commands to declare their exact capability", () => {
    expect(v3AuthorizationRequirement("confirmation.open")).toMatchObject({
      state: "verified",
      authorizationModel: "capability",
      requiredCapability: "confirmation.manage",
      scope: "object",
      serverBoundary: "public.studio2_apply_confirmation_round_change",
    });

    expect(assessV3S16AuthorizationReadiness().incompleteVerifiedCommands).not.toContain(
      "confirmation.open",
    );
  });
});
