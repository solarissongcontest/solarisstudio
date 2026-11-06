import { afterEach, describe, expect, it, vi } from "vitest";

import {
  clearV3ConfirmationOperation,
  createV3ConfirmationOperation,
  readV3ConfirmationOperation,
  markV3ConfirmationDispatched,
  markV3ConfirmationUncertain,
  prepareV3ConfirmationOperation,
  writeV3ConfirmationOperation,
} from "./v3-confirmation-operation";

const base = () =>
  createV3ConfirmationOperation({
    roundId: "round-1",
    browserSessionId: "browser-1",
    idempotencyKey: "key-1",
    clientPayloadFingerprint: "payload-a",
    now: "2026-10-12T12:00:00.000Z",
  });

describe("V3 Confirmation operation identity", () => {
  it("reuses the same key after an ambiguous dispatch of the same payload", () => {
    const uncertain = markV3ConfirmationUncertain(
      markV3ConfirmationDispatched(base(), "2026-10-12T12:00:01.000Z"),
      "2026-10-12T12:00:02.000Z",
    );

    const result = prepareV3ConfirmationOperation({
      existing: uncertain,
      roundId: "round-1",
      browserSessionId: "browser-1",
      clientPayloadFingerprint: "payload-a",
      newIdempotencyKey: "key-2",
      now: "2026-10-12T12:00:03.000Z",
    });

    expect(result.reused).toBe(true);
    expect(result.operation.idempotencyKey).toBe("key-1");
  });

  it("mints a new identity if the payload changed after ambiguity", () => {
    const uncertain = markV3ConfirmationUncertain(
      markV3ConfirmationDispatched(base(), "2026-10-12T12:00:01.000Z"),
      "2026-10-12T12:00:02.000Z",
    );

    const result = prepareV3ConfirmationOperation({
      existing: uncertain,
      roundId: "round-1",
      browserSessionId: "browser-1",
      clientPayloadFingerprint: "payload-b",
      newIdempotencyKey: "key-2",
      now: "2026-10-12T12:00:03.000Z",
    });

    expect(result.reused).toBe(false);
    expect(result.operation.idempotencyKey).toBe("key-2");
  });

  it("never reuses an ambiguous identity across browser-session scope", () => {
    const uncertain = markV3ConfirmationUncertain(
      markV3ConfirmationDispatched(base(), "2026-10-12T12:00:01.000Z"),
      "2026-10-12T12:00:02.000Z",
    );

    const result = prepareV3ConfirmationOperation({
      existing: uncertain,
      roundId: "round-1",
      browserSessionId: "browser-2",
      clientPayloadFingerprint: "payload-a",
      newIdempotencyKey: "key-2",
      now: "2026-10-12T12:00:03.000Z",
    });

    expect(result.reused).toBe(false);
    expect(result.operation.browserSessionId).toBe("browser-2");
  });

  it("does not reuse an already-ready identity as a generic duplicate-submit cache", () => {
    const result = prepareV3ConfirmationOperation({
      existing: base(),
      roundId: "round-1",
      browserSessionId: "browser-1",
      clientPayloadFingerprint: "payload-a",
      newIdempotencyKey: "key-2",
      now: "2026-10-12T12:00:03.000Z",
    });

    expect(result.reused).toBe(false);
    expect(result.operation.idempotencyKey).toBe("key-2");
  });
});

function installLocalStorage() {
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

describe("V3 Confirmation durable operation privacy boundary", () => {
  it("only restores an operation for the exact browser session and round", () => {
    const values = installLocalStorage();
    writeV3ConfirmationOperation(base());

    expect(readV3ConfirmationOperation("round-1", "browser-1")).toEqual(base());
    expect(readV3ConfirmationOperation("round-1", "browser-2")).toBeNull();
    expect(readV3ConfirmationOperation("round-2", "browser-1")).toBeNull();
    expect(readV3ConfirmationOperation("round-1", "")).toBeNull();
    expect([...values.keys()]).toEqual([
      "ssc.v3.confirmation.operation.v2.round-1.browser-1",
    ]);
  });

  it("never reads a legacy round-only operation that cannot prove session scope", () => {
    const values = installLocalStorage();
    values.set("ssc.v3.confirmation.operation.round-1", JSON.stringify(base()));

    expect(readV3ConfirmationOperation("round-1", "browser-1")).toBeNull();
    expect(readV3ConfirmationOperation("round-1", "browser-2")).toBeNull();
  });

  it("rejects malformed versions, statuses and spoofed browser identities from storage", () => {
    const values = installLocalStorage();
    writeV3ConfirmationOperation(base());
    const [key] = [...values.keys()];
    expect(key).toBeDefined();

    for (const changed of [
      { version: 2 },
      { status: "confirmed" },
      { browserSessionId: "browser-2" },
      { roundId: "round-2" },
    ]) {
      values.set(key!, JSON.stringify({ ...base(), ...changed }));
      expect(readV3ConfirmationOperation("round-1", "browser-1")).toBeNull();
    }
  });

  it("clears only the exact session operation, preserving other sessions", () => {
    installLocalStorage();
    writeV3ConfirmationOperation(base());
    writeV3ConfirmationOperation({ ...base(), browserSessionId: "browser-2" });

    clearV3ConfirmationOperation("round-1", "browser-1");
    expect(readV3ConfirmationOperation("round-1", "browser-1")).toBeNull();
    expect(readV3ConfirmationOperation("round-1", "browser-2")?.browserSessionId).toBe("browser-2");
  });
});
