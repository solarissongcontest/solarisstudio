import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  ".github/workflows/v3-s14-full-contest-rehearsal.yml",
  "utf8",
);

describe("S14 exact-SHA workflow identity", () => {
  it("checks out the same PR head SHA used to label and validate rehearsal evidence", () => {
    const exactSource = "${{ github.event.pull_request.head.sha || github.sha }}";
    expect(workflow).toContain(`ref: ${exactSource}`);
    expect(workflow).toContain(`name: v3-s14-stateful-${exactSource}`);
    expect(workflow).toContain('export V3_CANDIDATE_SHA="$(git rev-parse HEAD');
    expect(workflow).toContain("candidate SHA mismatch");
  });
});
