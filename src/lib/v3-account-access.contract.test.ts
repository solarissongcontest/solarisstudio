import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = () => readFileSync(resolve(process.cwd(), "src/components/v3/V3AccountSections.tsx"), "utf8");

describe("V3 Account access", () => {
  it("presents connected delegation state from the existing MySolaris authority", () => {
    const code = source();
    expect(code).toContain("useMySolaris()");
    expect(code).toContain("workspace.permissions.countryStatus");
    expect(code).toContain("workspace.countryAccount?.country");
    expect(code).toContain("server-authoritative delegation access");
    expect(code).not.toContain("localStorage");
  });
});
