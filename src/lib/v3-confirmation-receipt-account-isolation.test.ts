import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  confirmationReceiptActorScope,
  readStoredV3ConfirmationReceipt,
  writeStoredV3ConfirmationReceipt,
} from "./v3-confirmation-receipt-store";

const roundId = "round-privacy";
const key = `ssc.v3.confirmation.receipt.${roundId}`;

const receipt = {
  authority: "authoritative_server" as const,
  roundId,
  receiptId: "receipt-private",
  idempotencyKey: "operation-private",
  requestHash: "sha-private",
  serverAcceptedAt: "2026-11-07T00:00:00.000Z",
  replayed: false,
};

let values: Map<string, string>;

beforeEach(() => {
  values = new Map<string, string>();
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (name: string) => values.get(name) ?? null,
      setItem: (name: string, value: string) => { values.set(name, value); },
      removeItem: (name: string) => { values.delete(name); },
    },
  });
});

afterEach(() => vi.unstubAllGlobals());

describe("V3 Confirmation receipt actor and session isolation", () => {
  it("resolves unique account and anonymous scopes, refusing missing browser identity", () => {
    expect(confirmationReceiptActorScope("actor-a", "browser-a")).toBe("user:actor-a:session:browser-a");
    expect(confirmationReceiptActorScope("actor-b", "browser-a")).not.toBe(
      confirmationReceiptActorScope("actor-a", "browser-a"),
    );
    expect(confirmationReceiptActorScope(null, "browser-a")).toBe("anonymous:session:browser-a");
    expect(confirmationReceiptActorScope(null, "browser-b")).not.toBe(
      confirmationReceiptActorScope(null, "browser-a"),
    );
    expect(confirmationReceiptActorScope("actor-a", "")).toBeNull();
  });

  it("restores the same validated actor and browser session", () => {
    const scope = confirmationReceiptActorScope("actor-a", "browser-a");
    writeStoredV3ConfirmationReceipt({ roundId, actorScope: scope, submissionId: "private-a", receipt });
    expect(readStoredV3ConfirmationReceipt(roundId, scope)?.submissionId).toBe("private-a");
    expect(JSON.parse(values.get(key) ?? "{}").version).toBe(2);
  });

  it("evicts the previous actor receipt without exposing it on account switch", () => {
    const actorA = confirmationReceiptActorScope("actor-a", "browser-a");
    const actorB = confirmationReceiptActorScope("actor-b", "browser-a");
    writeStoredV3ConfirmationReceipt({ roundId, actorScope: actorA, submissionId: "private-a", receipt });
    expect(readStoredV3ConfirmationReceipt(roundId, actorB)).toBeNull();
    expect(values.has(key)).toBe(false);
    writeStoredV3ConfirmationReceipt({ roundId, actorScope: actorB, submissionId: "private-b", receipt });
    expect(readStoredV3ConfirmationReceipt(roundId, actorB)?.submissionId).toBe("private-b");
  });

  it("does not reuse authenticated data when the browser signs out", () => {
    const signedIn = confirmationReceiptActorScope("actor-a", "browser-a");
    const anonymous = confirmationReceiptActorScope(null, "browser-a");
    writeStoredV3ConfirmationReceipt({ roundId, actorScope: signedIn, submissionId: "private-a", receipt });
    expect(readStoredV3ConfirmationReceipt(roundId, anonymous)).toBeNull();
    expect(values.has(key)).toBe(false);
  });

  it("refuses and clears legacy version-one round-only receipts", () => {
    values.set(key, JSON.stringify({
      version: 1, roundId, submissionId: "legacy-other-actor",
      receipt, storedAt: "2026-11-07T00:00:00.000Z",
    }));
    expect(readStoredV3ConfirmationReceipt(roundId, confirmationReceiptActorScope("actor-a", "browser-a"))).toBeNull();
    expect(values.has(key)).toBe(false);
  });

  it("never persists or restores a receipt when actor identity remains unresolved", () => {
    writeStoredV3ConfirmationReceipt({ roundId, actorScope: null, submissionId: "private-a", receipt });
    expect(values.has(key)).toBe(false);
    const scope = confirmationReceiptActorScope("actor-a", "browser-a");
    writeStoredV3ConfirmationReceipt({ roundId, actorScope: scope, submissionId: "private-a", receipt });
    expect(readStoredV3ConfirmationReceipt(roundId, null)).toBeNull();
    expect(values.has(key)).toBe(false);
  });

  it("does not restore malformed or round-mismatched local data", () => {
    const scope = confirmationReceiptActorScope("actor-a", "browser-a");
    values.set(key, "{bad-json");
    expect(readStoredV3ConfirmationReceipt(roundId, scope)).toBeNull();
    writeStoredV3ConfirmationReceipt({ roundId, actorScope: scope, submissionId: "private-a", receipt });
    const wrong = { ...JSON.parse(values.get(key)!), receipt: { ...receipt, roundId: "other" } };
    values.set(key, JSON.stringify(wrong));
    expect(readStoredV3ConfirmationReceipt(roundId, scope)).toBeNull();
  });
});

describe("V3 Confirmation account transition source contract", () => {
  it("cancels stale receipt responses and clears in-memory state on actor switch", () => {
    const source = readFileSync(resolve(process.cwd(), "src/components/ConfirmationFormWithReceipt.tsx"), "utf8");
    expect(source).toContain("supabase.auth.onAuthStateChange");
    expect(source).toContain("setReceipt(null)");
    expect(source).toContain("setAuthoritativeReceipt(null)");
    expect(source).toContain("setUncertainOperationId(null)");
    expect(source).toContain("activeReceiptScope.current !== receiptScope");
    expect(source).toContain("actorScope: receiptScope");
    expect(source).toContain("readStoredV3ConfirmationReceipt(roundId, receiptScope)");
    expect(source).not.toContain("readStoredV3ConfirmationReceipt(roundId)");
  });
});
