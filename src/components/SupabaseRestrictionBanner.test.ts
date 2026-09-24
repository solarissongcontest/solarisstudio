import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const banner = readFileSync("src/components/SupabaseRestrictionBanner.tsx", "utf8");

describe("Supabase restriction banner hydration", () => {
  it("does not read session storage during the first render", () => {
    expect(banner).toContain(
      "useState<SupabaseServiceRestriction | null>(null)",
    );
    expect(banner).toContain("setRestriction(readSupabaseServiceRestriction())");
    expect(banner).not.toContain(
      "useState<SupabaseServiceRestriction | null>(() =>",
    );
  });
});
