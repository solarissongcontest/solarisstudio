import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflows = [
  "v3-s14-stateful-rehearsal.yml",
  "v3-release-candidate-preflight.yml",
] as const;

describe("manual exact-SHA release workflow trust boundary", () => {
  for (const workflow of workflows) {
    it(`${workflow} checks out the selected dispatch SHA, not untrusted input`, () => {
      const content = readFileSync(
        new URL(`../../.github/workflows/${workflow}`, import.meta.url),
        "utf8",
      );
      expect(content).toContain("ref: ${{ github.sha }}");
      expect(content).toContain("candidate_sha must match");
      expect(content).toContain("DISPATCH_SHA");
      expect(content).not.toContain("ref: ${{ inputs.candidate_sha }}");
      expect(content).not.toContain("ref: ${{ steps.identity.outputs.sha }}");
      expect(content).toContain("bun install --frozen-lockfile");
    });
  }
});
