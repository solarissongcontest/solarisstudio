import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const participate = readFileSync("src/lib/v3-participate.ts", "utf8");
const gate = readFileSync("src/components/v3/V3PrimaryRouteGate.tsx", "utf8");

describe("Session 2 Public lane safety", () => {
  it("keeps Participate projection read-only over canonical bootstrap state", () => {
    expect(participate).not.toContain("supabase");
    expect(participate).not.toContain("useMutation");
    expect(participate).not.toContain("Date.now()");
  });

  it("does not introduce a second workflow source in the route gate", () => {
    expect(gate).toContain("useV3PrimarySurfaceBundle");
    expect(gate).not.toContain("integrations/supabase/client");
  });
});
