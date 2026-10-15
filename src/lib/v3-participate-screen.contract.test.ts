import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("V3 Participate screen contract", () => {
  const participate = source("src/components/v3/V3ParticipateScreen.tsx");

  it("renders from the shared Participate projection instead of re-querying workflow state", () => {
    expect(participate).toContain('import { projectV3Participate } from "@/lib/v3-participate"');
    expect(participate).toContain("projectV3Participate(bootstrap)");
    expect(participate).not.toContain("supabase");
    expect(participate).not.toContain("useQuery(");
    expect(participate).not.toContain("useMutation(");
  });

  it("keeps required, upcoming, optional and completed presentation lanes distinct", () => {
    expect(participate).toContain('title="Needs attention"');
    expect(participate).toContain('title="Next"');
    expect(participate).toContain('title="Optional now"');
    expect(participate).toContain('title="Completed"');
    expect(participate).toContain("participate.needsAttention");
    expect(participate).toContain("participate.optionalNow");
  });

  it("shows canonical action timing instead of a generic local deadline badge", () => {
    expect(participate).toContain("action.deadline ? formatActionTime(action.deadline) : null");
    expect(participate).toContain("action.opensAt ? formatActionTime(action.opensAt) : null");
    expect(participate).toContain("`Closes ${deadline}`");
    expect(participate).toContain("`Opens ${opensAt}`");
    expect(participate).not.toContain('action.deadline ? "Deadline set"');
  });
});
