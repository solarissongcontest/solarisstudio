import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./v3-me.ts", import.meta.url), "utf8");

describe("V3 Me architecture contract", () => {
  it("remains presentation-only and does not own data access", () => {
    expect(source).not.toMatch(/supabase/i);
    expect(source).not.toMatch(/\bfetch\s*\(/);
    expect(source).not.toMatch(/useQuery|useMutation|useEffect|useState|useMemo/);
    expect(source).not.toMatch(/localStorage|sessionStorage|indexedDB/);
  });

  it("does not recreate MySolaris task/action ownership", () => {
    expect(source).not.toMatch(/AppTaskCenter|ParticipationTask|JourneyProjection/);
    expect(source).not.toMatch(/my-solaris/i);
  });

  it("does not infer access from display roles", () => {
    expect(source).not.toMatch(/displayRole\s*===|displayRole\s*!==/);
    expect(source).toMatch(/canEnterOrganizer/);
  });
});
