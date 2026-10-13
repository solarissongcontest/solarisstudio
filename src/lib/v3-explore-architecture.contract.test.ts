import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./v3-explore.ts", import.meta.url), "utf8");

describe("V3 Explore architecture contract", () => {
  it("remains a pure projection with no database, network, browser-storage or React ownership", () => {
    expect(source).not.toMatch(/supabase/i);
    expect(source).not.toMatch(/\bfetch\s*\(/);
    expect(source).not.toMatch(/useQuery|useMutation|useEffect|useState|useMemo/);
    expect(source).not.toMatch(/localStorage|sessionStorage|indexedDB/);
  });

  it("does not infer contest truth from device time or create background traffic", () => {
    expect(source).not.toMatch(/Date\.now\s*\(|new Date\s*\(/);
    expect(source).not.toMatch(/setInterval|setTimeout/);
    expect(source).not.toMatch(/WebSocket|EventSource/);
  });

  it("does not import or restyle the production Search implementation", () => {
    expect(source).not.toMatch(/SolarisSearchField|SearchOverlay|command Search/i);
    expect(source).not.toMatch(/components\/.*search|styles\/.*search/i);
  });
});
