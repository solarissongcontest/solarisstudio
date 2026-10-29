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
    expect(participate).toContain('import {\n  projectV3Participate,');
    expect(participate).toContain("projectV3Participate(bootstrap)");
    expect(participate).not.toContain("supabase");
    expect(participate).not.toContain("useQuery(");
    expect(participate).not.toContain("useMutation(");
  });

  it("gives one official responsibility visual priority before secondary lanes", () => {
    expect(participate).toContain('title="Current responsibility"');
    expect(participate).toContain('data-v3-participate-focus={focus.state}');
    expect(participate).toContain("Next meaningful responsibility");
    expect(participate).toContain('title="Other responsibilities"');
    expect(participate.indexOf('title="Current responsibility"')).toBeLessThan(
      participate.indexOf('title="Other responsibilities"'),
    );
    expect(projection).toContain("const focus = projectFocus({ needsAttention, blocked, waiting, next });");
    expect(projection).toContain('return { state: "actionable", action: actionable }');
    expect(projection).toContain('return { state: "blocked", action: blocked }');
    expect(projection).toContain('return { state: "waiting", action: waiting }');
    expect(projection).toContain('return { state: "upcoming", action: upcoming }');
    expect(projection).toContain('return { state: "clear", action: null }');
  });

  it("keeps required, blocked, upcoming and waiting secondary lanes distinct without equal top-level card sections", () => {
    expect(participate).toContain('data-v3-participate-lane={state}');
    expect(participate).toContain('label="Also needs attention"');
    expect(participate).toContain('label="Blocked"');
    expect(participate).toContain('label="Waiting"');
    expect(participate).toContain('label="Upcoming"');
    expect(participate).toContain("remainingAttention");
    expect(participate).toContain("remainingBlocked");
    expect(participate).toContain("remainingWaiting");
    expect(participate).toContain("remainingNext");
    expect(projection).toContain('action.sourceState === "problem" && !action.actionRequired');
    expect(projection).toContain('action.sourceState === "waiting"');
    expect(projection.indexOf('action.sourceState === "problem" && !action.actionRequired')).toBeLessThan(
      projection.indexOf("if (isOptional(action))"),
    );
    expect(projection.indexOf('action.sourceState === "waiting"')).toBeLessThan(
      projection.indexOf("if (isOptional(action))"),
    );
  });

  it("never promotes optional fan participation into the official focus", () => {
    expect(projection).toContain("function firstOfficial(actions: readonly V3ActionProjection[])");
    expect(projection).toContain("actions.find((action) => !isOptional(action)) ?? null");
    expect(participate).toContain('title="Optional participation"');
    expect(participate.indexOf('title="Current responsibility"')).toBeLessThan(
      participate.indexOf('title="Optional participation"'),
    );
  });

  it("explains blocked, waiting, upcoming and calm states without inventing an action", () => {
    expect(participate).toContain("the official workflow does not currently give you an action");
    expect(participate).toContain("waiting on the official workflow or review state");
    expect(participate).toContain("No action is required yet");
    expect(participate).toContain("You're caught up");
    expect(participate).toContain("No official responsibility right now");
  });

  it("keeps journey, voting, optional participation and completion subordinate to current responsibility", () => {
    for (const title of [
      'title="Responsibility journey"',
      'title="Voting overview"',
      'title="Optional participation"',
      'title="Completed"',
    ]) {
      expect(participate).toContain(title);
      expect(participate.indexOf('title="Current responsibility"')).toBeLessThan(
        participate.indexOf(title),
      );
    }
    expect(participate).toContain('data-v3-voting-overview="canonical-actions"');
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
