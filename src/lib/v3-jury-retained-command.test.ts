import { describe, expect, it, vi } from "vitest";
import {
  juryRetryKey,
  readRetainedJuryCommand,
  recoverRetainedJuryCommand,
  runRetainedJuryCommand,
  type RetainedJuryCommand,
} from "./v3-jury-retained-command";
const id = (last: string) => `29234500-0000-4000-8000-${last.padStart(12, "0")}`;
const request: RetainedJuryCommand = {
  kind: "score",
  editionId: id("21"),
  showId: id("31"),
  voterId: null,
  voterCountryId: id("41"),
  voterEntityId: null,
  receivingCountryId: id("42"),
  receivingEntityId: null,
  action: "assign",
  points: 12,
  expectedVersion: 7,
  operationId: id("101"),
  idempotencyKey: "reviewed:score",
};
function store() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: vi.fn((key: string, value: string) => {
      values.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      values.delete(key);
    }),
  };
}
describe("actor-scoped retained Jury commands", () => {
  it("persists before transmission and reuses the original request after response loss/refresh", async () => {
    const storage = store();
    const prepare = vi.fn(async () => request);
    const lost = vi.fn(async () => {
      expect(readRetainedJuryCommand("A", storage)).toEqual(request);
      throw new Error("offline");
    });
    await expect(runRetainedJuryCommand("A", request, storage, prepare, lost)).rejects.toThrow(
      "offline",
    );
    const restored = vi.fn(async () => ({ ok: true }));
    const refreshed: RetainedJuryCommand = {
      ...request,
      expectedVersion: 999,
      operationId: id("999"),
    };
    await runRetainedJuryCommand("A", refreshed, storage, prepare, restored);
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(restored).toHaveBeenCalledWith(request);
    expect(readRetainedJuryCommand("A", storage)).toBeNull();
  });
  it("blocks changed recipient/action/reason while an uncertain operation exists", async () => {
    const storage = store();
    storage.setItem(juryRetryKey("A"), JSON.stringify(request));
    const execute = vi.fn();
    const prepare = vi.fn();
    await expect(
      runRetainedJuryCommand(
        "A",
        { ...request, receivingCountryId: id("43") },
        storage,
        prepare,
        execute,
      ),
    ).rejects.toThrow("Recover the previous");
    expect(prepare).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
    const review: RetainedJuryCommand = {
      kind: "review",
      editionId: id("21"),
      showId: id("31"),
      ballotId: id("61"),
      targetStatus: "needs_review",
      reason: "Identity evidence",
      expectedVersion: 1,
      operationId: id("102"),
      idempotencyKey: "review",
    };
    storage.setItem(juryRetryKey("A"), JSON.stringify(review));
    await expect(
      runRetainedJuryCommand(
        "A",
        { ...review, reason: "Changed evidence" },
        storage,
        prepare,
        execute,
      ),
    ).rejects.toThrow("Recover the previous");
    expect(readRetainedJuryCommand("A", storage)).toEqual(review);
  });
  it("recovers without a new mutable preview even after the show/ballot disappears", async () => {
    const storage = store();
    storage.setItem(juryRetryKey("A"), JSON.stringify(request));
    const execute = vi.fn(async () => ({ ok: true }));
    await recoverRetainedJuryCommand("A", storage, execute);
    expect(execute).toHaveBeenCalledWith(request);
    expect(storage.getItem(juryRetryKey("A"))).toBeNull();
  });
  it("does not expose or replay another account's retained operation", async () => {
    const storage = store();
    storage.setItem(juryRetryKey("A"), JSON.stringify(request));
    const execute = vi.fn(async () => ({ ok: true }));
    expect(readRetainedJuryCommand("B", storage)).toBeNull();
    await recoverRetainedJuryCommand("B", storage, execute);
    expect(execute).not.toHaveBeenCalled();
    expect(readRetainedJuryCommand("A", storage)).toEqual(request);
  });
  for (const error of [
    { code: "42501", message: "Revoked session" },
    { code: "P0001", message: "IDEMPOTENCY_CONFLICT" },
    new Error("malformed response"),
  ]) {
    it(`retains identity after ${error.message}`, async () => {
      const storage = store();
      storage.setItem(juryRetryKey("A"), JSON.stringify(request));
      await expect(
        recoverRetainedJuryCommand("A", storage, async () => {
          throw error;
        }),
      ).rejects.toBe(error);
      expect(readRetainedJuryCommand("A", storage)).toEqual(request);
    });
  }
  it("permits a fresh preview after a proven stale-CAS rejection", async () => {
    const storage = store();
    storage.setItem(juryRetryKey("A"), JSON.stringify(request));
    const error = { code: "PT409", message: "VERSION_CONFLICT" };
    await expect(
      recoverRetainedJuryCommand("A", storage, async () => {
        throw error;
      }),
    ).rejects.toBe(error);
    expect(readRetainedJuryCommand("A", storage)).toBeNull();
  });
  it("fails closed before mutation if storage is unavailable or corrupted", async () => {
    const storage = store();
    storage.setItem.mockImplementation(() => {
      throw new Error("Storage unavailable");
    });
    const execute = vi.fn();
    await expect(
      runRetainedJuryCommand("A", request, storage, async () => request, execute),
    ).rejects.toThrow("Storage unavailable");
    expect(execute).not.toHaveBeenCalled();
    const corrupted = store();
    corrupted.setItem(juryRetryKey("A"), '{"kind":"score"}');
    await expect(
      runRetainedJuryCommand("A", request, corrupted, async () => request, execute),
    ).rejects.toThrow("invalid");
    expect(execute).not.toHaveBeenCalled();
  });
});
