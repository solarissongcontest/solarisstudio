import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("V3 warm-start background refresh feedback", () => {
  const coordinator = source("src/components/app/AppDataFreshnessCoordinator.tsx");

  it("keeps refresh work bounded to active freshness-class queries", () => {
    expect(coordinator).toContain("freshnessLevelsForResume");
    expect(coordinator).toContain("query.meta?.solarisFreshness");
    expect(coordinator).toContain('refetchType: "active"');
    expect(coordinator).toContain('return freshness !== "cold"');
    expect(coordinator).not.toContain("refetchQueries({");
  });

  it("delays visual feedback so fast background reconciliation does not flash", () => {
    expect(coordinator).toContain("BACKGROUND_REFRESH_FEEDBACK_DELAY_MS = 240");
    expect(coordinator).toContain("window.setTimeout");
    expect(coordinator).toContain("activeRefreshes.current > 0");
    expect(coordinator).toContain("setShowRefreshFeedback(true)");
    expect(coordinator).toContain("clearFeedbackTimer()");
  });

  it("keeps overlapping resume and reconnect refreshes visible until all settle", () => {
    expect(coordinator).toContain("activeRefreshes.current += 1");
    expect(coordinator).toContain(
      "activeRefreshes.current = Math.max(0, activeRefreshes.current - 1)",
    );
    expect(coordinator).toContain("if (activeRefreshes.current === 0)");
    expect(coordinator).toContain("setShowRefreshFeedback(false)");
  });

  it("renders a non-blocking polite shell status instead of a fullscreen loader", () => {
    expect(coordinator).toContain('role="status"');
    expect(coordinator).toContain('aria-live="polite"');
    expect(coordinator).toContain('aria-atomic="true"');
    expect(coordinator).toContain('data-solaris-background-refresh="true"');
    expect(coordinator).toContain("pointer-events-none");
    expect(coordinator).toContain("Updating…");
    expect(coordinator).not.toContain("fixed inset-0");
    expect(coordinator).not.toContain("animate-spin");
  });
});
