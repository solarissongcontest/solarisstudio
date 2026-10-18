import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const root = readFileSync(
  new URL("../components/v3/V3MeRoot.tsx", import.meta.url),
  "utf8",
);

describe("V3 Me Following ownership", () => {
  it("routes Following to the canonical Following & Saved surface", () => {
    expect(root).toContain('href: "/my-solaris/saved"');
    expect(root).not.toMatch(/following:\s*\{[\s\S]*?href:\s*"\/my-solaris\/activity"/);
  });
});
