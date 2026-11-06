import { afterEach, describe, expect, it, vi } from "vitest";

import {
  clearV3JuryOperation,
  prepareV3JuryOperation,
  readV3JuryOperation,
  updateV3JuryOperation,
  writeV3JuryOperation,
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

function prepare(changes: Record<string, unknown> = {}) {
  return prepareV3JuryOperation({
    existing: uncertain,
    ...scope,
    ballotFingerprint: "ballot-a",
    newOperationId: "operation-2",
    now: "2026-10-14T12:02:00.000Z",
    ...changes,
  });
}

function fakeStorage() {
  const values = new Map<string, string>();
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
      removeItem: (key: string) => { values.delete(key); },
    },
  });
  return values;
}

afterEach(() => vi.unstubAllGlobals());

describe("V3 Jury actor-scoped operation state", () => {
  it("reuses an uncertain operation only for the exact actor, country, show and ballot", () => {
    const same = prepare();
    expect(same.reused).toBe(true);
    expect(same.operation.operationId).toBe("operation-1");
    for (const key of ["actorId", "countryId", "showId", "ballotFingerprint"] as const) {
      const changed = prepare({ [key]: "other" });
      expect(changed.reused).toBe(false);
      expect(changed.operation.operationId).toBe("operation-2");
    }
  });

  it("rejects anonymous or incomplete command scope", () => {
    for (const actorId of ["anonymous", "", " "]) {
      expect(() => prepare({ actorId })).toThrow(/signed-in actor/);
    }
    expect(() => prepare({ countryId: "" })).toThrow(/country/);
    expect(() => prepare({ showId: "" })).toThrow(/show/);
  });

  it("partitions local uncertain operations across account, delegation and round", () => {
    fakeStorage();
    writeV3JuryOperation(uncertain);
    expect(readV3JuryOperation(scope)?.operationId).toBe("operation-1");
    for (const field of ["actorId", "countryId", "showId"] as const) {
      expect(readV3JuryOperation({ ...scope, [field]: "other" })).toBeNull();
    }
  });

  it("does not migrate another actor's unscoped V1 operation without server proof", () => {
    const values = fakeStorage();
    const oldKey = "ssc.v3.jury.operation.show-1";
    values.set(oldKey, JSON.stringify({ ...uncertain, version: 1 }));
    expect(readV3JuryOperation(scope)).toBeNull();
    clearV3JuryOperation(scope);
    expect(values.has(oldKey)).toBe(true);
  });

  it("fails closed on tampered or malformed cached owner state", () => {
    const values = fakeStorage();
    writeV3JuryOperation(uncertain);
    const key = [...values.keys()][0]!;
    values.set(key, JSON.stringify({ ...uncertain, countryId: "another-country" }));
    expect(readV3JuryOperation(scope)).toBeNull();
    values.set(key, "{invalid");
    expect(readV3JuryOperation(scope)).toBeNull();
  });

  it("clears only the current actor/country/show operation", () => {
    fakeStorage();
    writeV3JuryOperation(uncertain);
    const second = { ...uncertain, actorId: "actor-2" };
    writeV3JuryOperation(second);
    clearV3JuryOperation(scope);
    expect(readV3JuryOperation(scope)).toBeNull();
    expect(readV3JuryOperation(second)?.operationId).toBe("operation-1");
  });

  it("only allows approved dispatch and uncertainty transitions", () => {
    const ready = { ...uncertain, status: "ready" as const };
    const sent = updateV3JuryOperation(ready, "dispatched", "2026-10-14T12:03:00.000Z");
    expect(sent.status).toBe("dispatched");
    expect(updateV3JuryOperation(sent, "uncertain", "2026-10-14T12:04:00.000Z").status).toBe("uncertain");
    expect(() => updateV3JuryOperation(ready, "uncertain", "2026-10-14T12:05:00.000Z")).toThrow(/transition/);
  });
});
