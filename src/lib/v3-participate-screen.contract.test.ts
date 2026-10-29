import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("V3 Participate screen contract", () => {
  const participate = source("src/components/v3/V3ParticipateScreen.tsx");
  const projection = source("src/lib/v3-participate.ts");

  it("renders from the shared Participate projection instead of re-querying workflow state", () => {
    expect(participate).toContain('import { projectV3Participate } from "@/lib/v3-participate"');
    expect(participate).toContain("projectV3Participate(bootstrap)");
    expect(participate).not.toContain("supabase");
    expect(participate).not.toContain("useQuery(");
    expect(participate).not.toContain("useMutation(");
  });

  it("keeps required, blocked, upcoming, waiting, optional and completed presentation lanes distinct", () => {
    expect(participate).toContain('title="Needs attention"');
    expect(participate).toContain('title="Blocked"');
    expect(participate).toContain('title="Next"');
    expect(participate).toContain('title="Waiting"');
    expect(participate).toContain('title="Optional now"');
    expect(participate).toContain('title="Completed"');
    expect(participate).toContain("participate.needsAttention");
    expect(participate).toContain("participate.blocked");
    expect(participate).toContain("participate.waiting");
    expect(participate).toContain("participate.optionalNow");
    expect(projection).toContain('action.sourceState === "problem" && !action.actionRequired');
    expect(projection).toContain('action.sourceState === "waiting"');
    expect(projection.indexOf('action.sourceState === "problem" && !action.actionRequired')).toBeLessThan(
      projection.indexOf("if (isOptional(action))"),
    );
    expect(projection.indexOf('action.sourceState === "waiting"')).toBeLessThan(
      projection.indexOf("if (isOptional(action))"),
    );
  });

  it("explains that blocked problems are not currently actionable", () => {
    expect(participate).toContain("No action available");
    expect(participate).toContain("you cannot act yet");
    expect(participate).toContain("reopened Entry editing");
    expect(projection).toContain('const blocked: V3ActionProjection[] = []');
    expect(projection).toContain("blocked.push(action)");
  });

  it("shows exact projected open/close timing without inventing browser-owned workflow state", () => {
    expect(participate).toContain('import { formatEventDateTime } from "@/lib/public-time"');
    expect(participate).toContain('formatEventDateTime(parsed, { locale: "en-GB" })');
    expect(participate).toContain('deadline ? `Closes ${deadline}`');
    expect(participate).toContain('opensAt ? `Opens ${opensAt}`');
    expect(participate).not.toContain('"Deadline set"');
    expect(participate).not.toContain('"Scheduled"');
    expect(participate).not.toContain("Intl.DateTimeFormat(undefined");
    expect(participate).not.toContain("Date.now(");
  });
});
