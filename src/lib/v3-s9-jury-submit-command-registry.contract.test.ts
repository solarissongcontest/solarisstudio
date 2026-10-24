import { describe, expect, it } from "vitest";
import { solarisV6Domain } from "./solaris-v6-domain-registry";
import {
  v3AuthorizationRequirement,
  validateV3AuthorizationRequirementRegistry,
} from "./v3-authorization-requirement-registry";

describe("System V3 participant Jury command ownership", () => {
  it("registers jury.submit under the one canonical Jury domain", () => {
    const jury = solarisV6Domain("jury");
    expect(jury).not.toBeNull();
    expect(jury?.commands).toContain("jury.submit");
    expect(jury?.events).toContain("jury.ballot_changed");
  });

  it("documents Jury submission as participant-boundary authorization", () => {
    expect(v3AuthorizationRequirement("jury.submit")).toMatchObject({
      ownerDomain: "jury",
      state: "verified",
      authorizationModel: "participant-boundary",
      requiredCapability: null,
      scope: "show",
      serverBoundary: "public.v3_submit_jury_ballot",
      serviceRoleAllowed: false,
    });
  });

  it("keeps the generated authorization inventory closed after adding the command", () => {
    expect(validateV3AuthorizationRequirementRegistry()).toEqual([]);
  });
});
