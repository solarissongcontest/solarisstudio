import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/** No-network guarantee that legal comparison cannot bypass World rollout. */
describe("Public legal comparison World rollout gate", () => {
  it("does not mount the document comparison reader before rollout authorization", () => {
    const source = readFileSync(resolve(process.cwd(), "src/routes/world/legal-compare/index.tsx"), "utf8");
    expect(source).toContain('import { WorldPublicGate } from "@/components/world/WorldPublic"');
    expect(source).toMatch(/<WorldPublicGate>\s*<WorldLegalComparisonScreen/);
    expect(source).toContain("</WorldPublicGate>");
  });
});
