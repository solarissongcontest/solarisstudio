import { describe, expect, it } from "vitest";

import { assertVerifiedAccountAccessChecks } from "./country-account";

describe("strict account-access verification", () => {
  it("accepts both successful checks, including a valid signed-in user without a country account", () => {
    expect(() => assertVerifiedAccountAccessChecks(null, null)).not.toThrow();
  });

  it("rejects errors in either access source rather than manufacturing a verified shell", () => {
    const organizerError = new Error("Organizer access unavailable");
    const countryError = new Error("Country account unavailable");
    expect(() => assertVerifiedAccountAccessChecks(organizerError, null)).toThrow(organizerError);
    expect(() => assertVerifiedAccountAccessChecks(null, countryError)).toThrow(countryError);
    expect(() => assertVerifiedAccountAccessChecks(organizerError, countryError)).toThrow(organizerError);
  });
});
