import { describe, expect, it } from "vitest";

import { isSupabaseServiceRestrictionError } from "./supabase-service-restriction";

describe("Supabase service restriction detection", () => {
  it("recognises HTTP 402 errors", () => {
    expect(isSupabaseServiceRestrictionError({ status: 402, message: "Payment Required" })).toBe(true);
  });

  it("recognises a textual 402 restriction", () => {\n    expect(isSupabaseServiceRestrictionError({ message: "HTTP 402 service restriction" })).toBe(true);\n  });\n\n  it("recognises fair-use and egress restriction messages", () => {
    expect(
      isSupabaseServiceRestrictionError({
        message: "Project service restriction: exceeded_egress_quota",
      }),
    ).toBe(true);
  });

  it("does not misclassify ordinary query failures", () => {
    expect(isSupabaseServiceRestrictionError({ status: 400, message: "invalid input" })).toBe(false);
  });
});
