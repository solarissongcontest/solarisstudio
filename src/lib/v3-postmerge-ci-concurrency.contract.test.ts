import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("post-merge exact-SHA CI reliability", () => {
  for (const path of [".github/workflows/ci.yml", ".github/workflows/browser-audit.yml"]) {
    it(`${path} preserves running main checks without retaining stale PR runs`, () => {
      const workflow = readFileSync(path, "utf8");
      expect(workflow).toContain("cancel-in-progress: ${{ github.event_name == 'pull_request' }}");
      expect(workflow).toContain("group: ");
      expect(workflow).toContain("github.ref");
      expect(workflow).toContain("github.event.pull_request.head.sha || github.sha");
      expect(workflow).not.toContain("cancel-in-progress: true");
    });
  }
});
