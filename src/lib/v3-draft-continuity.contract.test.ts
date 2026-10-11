import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("V3 draft continuity architecture contract", () => {
  it("stays a pure revision resolver with no database or browser-storage dependency", () => {
    const source = readFileSync("src/lib/v3-draft-continuity.ts", "utf8");

    expect(source).not.toContain("supabase");
    expect(source).not.toContain("localStorage");
    expect(source).not.toContain("sessionStorage");
    expect(source).not.toContain("window.");
    expect(source).not.toContain("Date.now(");
  });

  it("keeps uncertain submits fail-closed and never enables automatic retry", () => {
    const source = readFileSync("src/lib/v3-draft-continuity.ts", "utf8");

    expect(source).toContain('status: "unknown"');
    expect(source).toContain('allowAutomaticRetry: false');
    expect(source).toContain('reason: "server-state-unknown"');
    expect(source).toContain('retry: false');
  });
});
