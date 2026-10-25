import { describe, expect, it } from "vitest";

import { SOLARIS_CAPABILITIES } from "./permissions-v2";
import { V3_AUTHORIZATION_REQUIREMENT_REGISTRY } from "./v3-authorization-requirement-registry";

const typedCapabilities = new Set<string>(SOLARIS_CAPABILITIES);

describe("V3 authorization capability parity", () => {
  it("uses only capabilities represented by the canonical TypeScript registry", () => {
    const unknown = V3_AUTHORIZATION_REQUIREMENT_REGISTRY
      .flatMap((requirement) =>
        requirement.requiredCapability && !typedCapabilities.has(requirement.requiredCapability)
          ? [`${requirement.command}:${requirement.requiredCapability}`]
          : [],
      )
      .sort();

    expect(unknown).toEqual([]);
  });

  it("keeps Next in Line and Maintenance authority representable end to end", () => {
    expect(typedCapabilities.has("next_in_line.manage")).toBe(true);
    expect(typedCapabilities.has("maintenance.manage")).toBe(true);

    for (const command of ["next_in_line.open", "next_in_line.close"]) {
      const requirement = V3_AUTHORIZATION_REQUIREMENT_REGISTRY.find(
        (candidate) => candidate.command === command,
      );
      expect(requirement?.requiredCapability).toBe("next_in_line.manage");
    }
  });
});
