import { describe, expect, it } from "vitest";

import {
  prepareV3JuryOperation,
  updateV3JuryOperation,
  type V3JuryOperation,
} from "@/lib/v3-jury-operation";

const uncertain: V3JuryOperation = {
  version: 1,
  showId: "show-1",
  operationId: "operation-1",
  ballotFingerprint: "ballot-a",
  status: "uncertain",
  createdAt: "2026-10-14T12:00:00.000Z",
  updatedAt: "2026-10-14T12:01:00.000Z",
};

describe("V3 Jury operation state", () => {
  it("reuses an uncertain operation only for the exact same ballot", () => {
    const same = prepareV3JuryOperation({
      existing: uncertain,
      showId: "show-1",
      ballotFingerprint: "ballot-a",
      newOperationId: "operation-2",
      now: "2026-10-14T12:02:00.000Z",
    });
    expect(same.reused).toBe(true);
    expect(same.operation.operationId).toBe("operation-1");

    const changed = prepareV3JuryOperation({
      existing: uncertain,
      showId: "show-1",
      ballotFingerprint: "ballot-b",
      newOperationId: "operation-2",
      now: "2026-10-14T12:02:00.000Z",
    });
    expect(changed.reused).toBe(false);
    expect(changed.operation.operationId).toBe("operation-2");
  });

  it("allows only dispatch and uncertainty transitions", () => {
    const ready = { ...uncertain, status: "ready" as const };
    const dispatched = updateV3JuryOperation(
      ready,
      "dispatched",
      "2026-10-14T12:03:00.000Z",
    );
    expect(dispatched.status).toBe("dispatched");
    expect(
      updateV3JuryOperation(
        dispatched,
        "uncertain",
        "2026-10-14T12:04:00.000Z",
      ).status,
    ).toBe("uncertain");
    expect(() =>
      updateV3JuryOperation(ready, "uncertain", "2026-10-14T12:04:00.000Z"),
    ).toThrow(/transition/);
  });
});
