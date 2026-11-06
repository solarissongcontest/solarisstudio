import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("../components/v3/V3HomeScreen.tsx", import.meta.url),
  "utf8",
);

describe("V3 Home screen attention budget", () => {
  it("keeps one canonical primary action and routes excess attention to Participate", () => {
    expect(source).toContain("const primary = bootstrap.attention.primary");
    expect(source).toContain("const remainingCount = Math.max(0, count - 1)");
    expect(source).toContain("title={primary.title}");
    expect(source).toContain("to={primary.route}");
    expect(source).toContain("remainingCount > 0");
    expect(source).toContain("View ${remainingCount} more in Participate");
    expect(source).toContain('to="/participate"');
  });

  it("does not duplicate the task list or re-rank secondary actions inside Home", () => {
    expect(source).not.toContain("bootstrap.attention.secondary.map");
    expect(source).not.toContain("bootstrap.attention.secondary.slice");
    expect(source).not.toContain("bootstrap.attention.secondary.sort");
    expect(source).not.toContain("bootstrap.actions.map");
  });

  it("keeps Coming up and Latest bounded to three items", () => {
    expect(source).toContain("upcoming.slice(0, 3)");
    expect(source).toContain("latest.slice(0, 3)");
  });
});
