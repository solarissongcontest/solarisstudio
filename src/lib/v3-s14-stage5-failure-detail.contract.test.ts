import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const stage5 = readFileSync(
  ".github/scripts/v3-s14-stage-5-running-orders.sh",
  "utf8",
);

describe("S14 Stage 5 failure detail evidence", () => {
  it("persists each Running Orders boundary into CURRENT_STAGE before it can fail", () => {
    for (const boundary of [
      "sign-in",
      "reset:$show_id",
      "allocation:$show_id",
      "running-order:$show_id",
      "invariants:$show_id",
      "publication:$show_id",
      "publication-evidence:$show_id",
      "anonymous-show:$show_id",
      "anonymous-participants:$show_id",
      "final-invariant",
    ]) {
      expect(stage5).toContain(`CURRENT_STAGE="stage-5-running-orders:${boundary}"`);
    }
  });

  it("restores the canonical stage id after successful completion", () => {
    expect(stage5).toContain('CURRENT_STAGE="stage-5-running-orders"');
    expect(stage5).toContain("S14_STAGE_5_RUNNING_ORDERS_COMPLETE");
  });
});
