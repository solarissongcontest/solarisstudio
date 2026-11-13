import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("../components/v3/V3HomeScreen.tsx", import.meta.url),
  "utf8",
);

describe("V3 Home screen attention budget", () => {
  it("keeps one canonical primary action and routes excess attention to Participate", () => {
    expect(source).toContain("const primary = bootstrap.attention.primary");
    expect(source).toContain("const remainingCount = Math.max(0, count - (primary ? 1 : 0))");
    expect(source).toContain("title={primary.title}");
    expect(source).toContain("to={primary.route}");
    expect(source).toContain("remainingCount > 0");
    expect(source).toContain("View ${remainingCount} more in Participate");
    expect(source).toContain('to="/participate"');
  });

  it("shows the projected requirement class rather than treating every low-urgency action as required", () => {
    expect(source).toContain("homeActionRequirementLabel(action.deliveryClass)");
    expect(source).toContain("homeActionTone(primary)");
    expect(source).not.toContain("urgencyTone(primary)");
  });

  it("uses canonical identity to distinguish anonymous browsing from completed personal work", () => {
    expect(source).toContain("homeCalmPresentation(bootstrap.identity.userId)");
    expect(source).toContain("calm.showSignIn ? undefined");
    expect(source).toContain('to="/auth"');
    expect(source).toContain("Sign in to see your tasks");
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
