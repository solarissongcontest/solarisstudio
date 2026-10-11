import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./v3-results.ts", import.meta.url), "utf8");

describe("V3 Results architecture contract", () => {
  it("remains a pure display projection", () => {
    expect(source).not.toMatch(/supabase/i);
    expect(source).not.toMatch(/\bfetch\s*\(/);
    expect(source).not.toMatch(/useQuery|useMutation|useEffect|useState|useMemo/);
    expect(source).not.toMatch(/localStorage|sessionStorage|indexedDB/);
    expect(source).not.toMatch(/WebSocket|EventSource|setInterval|setTimeout/);
  });

  it("does not calculate its own spoiler preference or publication state", () => {
    expect(source).not.toMatch(/spoiler.*localStorage|spoiler.*cookie/i);
    expect(source).not.toMatch(/Date\.now\s*\(|new Date\s*\(/);
  });
});
