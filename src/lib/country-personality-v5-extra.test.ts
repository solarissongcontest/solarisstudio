import { describe, expect, it } from "vitest";

import {
  canonicalCountryPersonalityId,
  countryPersonality,
} from "./country-personality-system";

describe("country personality legacy compatibility", () => {
  it("keeps persisted values stable while exposing the V8 human-readable identities", () => {
    expect(countryPersonality("monument").name).toBe("Luxury");
    expect(countryPersonality("heritage").name).toBe("Heritage");
    expect(canonicalCountryPersonalityId("split")).toBe("classic");
    expect(countryPersonality("split").name).toBe("Diplomatic");
    expect(canonicalCountryPersonalityId("water-drop")).toBe("glass-card");
    expect(countryPersonality("water-drop").name).toBe("Glass");
  });
});
