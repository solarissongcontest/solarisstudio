import { afterEach, describe, expect, it, vi } from "vitest";

import {
  clearLegacyV3JuryOperation,
  clearV3JuryOperation,
  prepareV3JuryOperation,
  readLegacyV3JuryOperation,
  readV3JuryOperation,
  updateV3JuryOperation,
  writeV3JuryOperation,
  type V3JuryOperation,
} from "@/lib/v3-jury-operation";

const uncertain: V3JuryOperation = {
  version: 2,
  actorId: "actor-a",
  countryId: "country-a",
  editionId: "edition-a",
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
      scope: { actorId: "actor-a", countryId: "country-a", editionId: "edition-a", showId: "show-1" },
      ballotFingerprint: "ballot-a",
      newOperationId: "operation-2",
      now: "2026-10-14T12:02:00.000Z",
    });
    expect(same.reused).toBe(true);
    expect(same.operation.operationId).toBe("operation-1");

    const changed = prepareV3JuryOperation({
      existing: uncertain,
      scope: { actorId: "actor-a", countryId: "country-a", editionId: "edition-a", showId: "show-1" },
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

const scope = {
  actorId: "actor-a",
  countryId: "country-a",
  editionId: "edition-a",
  showId: "show-1",
};

function mockBrowserStorage() {
  const items = new Map<string, string>();
  vi.stubGlobal("window", { localStorage: {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => { items.set(key, value); },
    removeItem: (key: string) => { items.delete(key); },
  } });
  return items;
}

afterEach(() => vi.unstubAllGlobals());

describe("Jury operation actor/edition/country isolation", () => {
  it("never reuses an uncertain ID belonging to another actor, country or edition", () => {
    for (const different of [
      { ...scope, actorId: "actor-b" },
      { ...scope, countryId: "country-b" },
      { ...scope, editionId: "edition-b" },
      { ...scope, showId: "show-2" },
    ]) {
      const result = prepareV3JuryOperation({
        existing: uncertain,
        scope: different,
        ballotFingerprint: uncertain.ballotFingerprint,
        newOperationId: "new-unique-id",
        now: "2026-10-14T12:04:00.000Z",
      });
      expect(result.reused).toBe(false);
      expect(result.operation.operationId).toBe("new-unique-id");
      expect(result.operation.actorId).toBe(different.actorId);
      expect(result.operation.countryId).toBe(different.countryId);
      expect(result.operation.editionId).toBe(different.editionId);
    }
  });

  it("stores each actor/country/edition/show in a distinct browser namespace", () => {
    const storage = mockBrowserStorage();
    writeV3JuryOperation(uncertain);
    expect(readV3JuryOperation(scope)?.operationId).toBe("operation-1");
    expect(readV3JuryOperation({ ...scope, actorId: "actor-b" })).toBeNull();
    expect(readV3JuryOperation({ ...scope, countryId: "country-b" })).toBeNull();
    expect(readV3JuryOperation({ ...scope, editionId: "edition-b" })).toBeNull();
    const other = { ...uncertain, actorId: "actor-b", operationId: "operation-b" };
    writeV3JuryOperation(other);
    expect(readV3JuryOperation(scope)?.operationId).toBe("operation-1");
    expect(readV3JuryOperation({ ...scope, actorId: "actor-b" })?.operationId).toBe("operation-b");
    clearV3JuryOperation(scope);
    expect(readV3JuryOperation(scope)).toBeNull();
    expect(readV3JuryOperation({ ...scope, actorId: "actor-b" })?.operationId).toBe("operation-b");
    expect(storage.size).toBe(1);
  });

  it("migrates legacy V1 to read-only reconciliation, never to a new submitted ID", () => {
    const storage = mockBrowserStorage();
    storage.set("ssc.v3.jury.operation.show-1", JSON.stringify({
      version: 1,
      showId: "show-1",
      operationId: "old-cross-actor-id",
      ballotFingerprint: "ballot-a",
      status: "uncertain",
      createdAt: uncertain.createdAt,
      updatedAt: uncertain.updatedAt,
    }));
    expect(readV3JuryOperation(scope)).toBeNull();
    expect(readLegacyV3JuryOperation("show-1")?.operationId).toBe("old-cross-actor-id");
    const newScoped = prepareV3JuryOperation({
      existing: readV3JuryOperation(scope),
      scope,
      ballotFingerprint: "ballot-a",
      newOperationId: "new-actor-id",
      now: "2026-10-14T12:05:00.000Z",
    });
    expect(newScoped.operation.operationId).toBe("new-actor-id");
    expect(newScoped.reused).toBe(false);
    clearLegacyV3JuryOperation("show-1");
    expect(readLegacyV3JuryOperation("show-1")).toBeNull();
  });

  it("preserves a dispatched ID across browser restarts as an uncertain retry", () => {
    const dispatched = { ...uncertain, status: "dispatched" as const };
    const again = prepareV3JuryOperation({
      existing: dispatched,
      scope,
      ballotFingerprint: "ballot-a",
      newOperationId: "new-id",
      now: "2026-10-14T12:07:00.000Z",
    });
    expect(again.reused).toBe(true);
    expect(again.operation.operationId).toBe("operation-1");
    expect(again.operation.status).toBe("uncertain");
    expect(updateV3JuryOperation(again.operation, "dispatched", "2026-10-14T12:08:00.000Z").operationId).toBe("operation-1");
  });
});
