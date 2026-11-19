import { describe, expect, it } from "vitest";

import {
  prepareV3JuryOperation,
  sameV3JuryOperationScope,
  updateV3JuryOperation,
  type V3JuryOperation,
} from "@/lib/v3-jury-operation";

const scope = { actorId: "actor-1", countryId: "country-1", showId: "show-1" };

const uncertain: V3JuryOperation = {
  version: 2,
  ...scope,
  operationId: "operation-1",
  ballotFingerprint: "ballot-a",
  status: "uncertain",
  createdAt: "2026-10-14T12:00:00.000Z",
  updatedAt: "2026-10-14T12:01:00.000Z",
};

const submitInput = {
  ...scope,
  newOperationId: "operation-2",
  now: "2026-10-14T12:02:00.000Z",
};

describe("V3 Jury actor-scoped operation state", () => {
  it("reuses an uncertain operation only for the exact same account, country, show and ballot", () => {
    const same = prepareV3JuryOperation({
      existing: uncertain, ...submitInput, ballotFingerprint: "ballot-a",
    });
    expect(same.reused).toBe(true);
    expect(same.operation.operationId).toBe("operation-1");

    const changed = prepareV3JuryOperation({
      existing: uncertain, ...submitInput, ballotFingerprint: "ballot-b",
    });
    expect(changed.reused).toBe(false);
    expect(changed.operation.operationId).toBe("operation-2");
  });

  it("does not reuse a failed operation across delegations or accounts sharing a browser", () => {
    const switchedAccount = prepareV3JuryOperation({
      existing: uncertain, ...submitInput, actorId: "actor-2", ballotFingerprint: "ballot-a",
    });
    const switchedCountry = prepareV3JuryOperation({
      existing: uncertain, ...submitInput, countryId: "country-2", ballotFingerprint: "ballot-a",
    });
    const switchedShow = prepareV3JuryOperation({
      existing: uncertain, ...submitInput, showId: "show-2", ballotFingerprint: "ballot-a",
    });
    for (const result of [switchedAccount, switchedCountry, switchedShow]) {
      expect(result.reused).toBe(false);
      expect(result.operation.operationId).toBe("operation-2");
    }
    expect(sameV3JuryOperationScope(uncertain, scope)).toBe(true);
    expect(sameV3JuryOperationScope(uncertain, { ...scope, actorId: "actor-2" })).toBe(false);
  });

  it("rejects unscoped legacy v1 operation data instead of silently upgrading it", () => {
    const legacy = { ...uncertain, version: 1 } as unknown as V3JuryOperation;
    expect(() => prepareV3JuryOperation({
      existing: legacy, ...submitInput, ballotFingerprint: "ballot-a",
    })).toThrow("Invalid Jury operation state");
  });

  it("allows only dispatch and uncertainty transitions", () => {
    const ready = { ...uncertain, status: "ready" as const };
    const dispatched = updateV3JuryOperation(ready, "dispatched", "2026-10-14T12:03:00.000Z");
    expect(dispatched.status).toBe("dispatched");
    expect(updateV3JuryOperation(dispatched, "uncertain", "2026-10-14T12:04:00.000Z").status).toBe("uncertain");
    expect(() => updateV3JuryOperation(ready, "uncertain", "2026-10-14T12:04:00.000Z")).toThrow(/transition/);
  });
});
