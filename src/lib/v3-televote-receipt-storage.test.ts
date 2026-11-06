import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  readTelevoteReceipt,
  scrubTelevoteReceipts,
  televoteReceiptStorageKey,
  writeTelevoteReceipt,
} from "@/lib/v3-televote-receipt-storage";

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  const storage: Pick<Storage, "length" | "key" | "getItem" | "setItem" | "removeItem"> = {
    get length() { return data.size; },
    key(index) { return [...data.keys()][index] ?? null; },
    getItem(key) { return data.get(key) ?? null; },
    setItem(key, value) { data.set(key, value); },
    removeItem(key) { data.delete(key); },
  };
  return { storage, data };
}

const governance = {
  action: "televote.vote" as const,
  rulebookVersion: "v5",
  ruleIds: ["vote-one", "vote-two"],
  capturedAt: "2026-11-07T01:00:00.000Z",
};

describe("anonymous Televote local receipt privacy", () => {
  it("writes only the canonical governance snapshot after server acceptance", () => {
    const { storage, data } = memoryStorage();
    writeTelevoteReceipt(storage, "round-1", governance);
    const value = data.get(televoteReceiptStorageKey("round-1"));
    expect(JSON.parse(value!)).toEqual({ governance });
    expect(value).not.toMatch(/username|home|countryCode|breakdown|points|recoveryCode|submissionId/);
  });

  it("scrubs every legacy round's name, home country and unpublished ballot", () => {
    const old = {
      username: "private voter",
      home: "OL",
      breakdown: [{ target_country_code: "AA", points: 12 }],
      governance,
    };
    const { storage, data } = memoryStorage({
      [televoteReceiptStorageKey("round-1")]: JSON.stringify(old),
      [televoteReceiptStorageKey("round-2")]: JSON.stringify({ ...old, recovered: true, submissionId: "private-id" }),
      "solaris:other-state": JSON.stringify(old),
    });
    scrubTelevoteReceipts(storage);
    for (const round of ["round-1", "round-2"]) {
      expect(JSON.parse(data.get(televoteReceiptStorageKey(round))!)).toEqual({ governance });
    }
    expect(JSON.parse(data.get("solaris:other-state")!)).toEqual(old);
  });

  it("removes corrupt markers rather than interpreting arbitrary storage as success", () => {
    const { storage, data } = memoryStorage({
      [televoteReceiptStorageKey("broken")]: "not-json",
      [televoteReceiptStorageKey("unknown")]: JSON.stringify({ username: "someone", breakdown: [1, 2] }),
      [televoteReceiptStorageKey("valid")]: JSON.stringify({ governance: null }),
    });
    expect(readTelevoteReceipt(storage, "broken")).toBeNull();
    scrubTelevoteReceipts(storage);
    expect(data.has(televoteReceiptStorageKey("broken"))).toBe(false);
    expect(data.has(televoteReceiptStorageKey("unknown"))).toBe(false);
    expect(readTelevoteReceipt(storage, "valid")).toEqual({ governance: null });
  });

  it("drops attacker-controlled extra governance fields and wrong action types", () => {
    const { storage, data } = memoryStorage({
      [televoteReceiptStorageKey("round-1")]: JSON.stringify({
        governance: { ...governance, ballot: "secret" },
        breakdown: ["secret vote"],
      }),
      [televoteReceiptStorageKey("round-2")]: JSON.stringify({
        governance: { ...governance, action: "result.publish" },
      }),
    });
    scrubTelevoteReceipts(storage);
    expect(JSON.parse(data.get(televoteReceiptStorageKey("round-1"))!)).toEqual({ governance });
    expect(JSON.parse(data.get(televoteReceiptStorageKey("round-2"))!)).toEqual({ governance: null });
  });

  it("removes a sensitive legacy marker if storage refuses the sanitizing write", () => {
    const { storage, data } = memoryStorage({
      [televoteReceiptStorageKey("round")]: JSON.stringify({ governance, username: "private", breakdown: [1] }),
    });
    storage.setItem = () => { throw new Error("storage quota"); };
    expect(readTelevoteReceipt(storage, "round")).toBeNull();
    expect(data.has(televoteReceiptStorageKey("round"))).toBe(false);
  });

  it("wires both booth and receipt recovery to the minimal helper, never direct persistent ballot writes", () => {
    const booth = readFileSync(resolve(process.cwd(), "src/components/televoting/TelevotingBooth.tsx"), "utf8");
    const recovery = readFileSync(resolve(process.cwd(), "src/components/televoting/TelevotingBoothWithReceipt.tsx"), "utf8");
    expect(booth).toContain("writeTelevoteReceipt(window.localStorage, roundId, governance)");
    expect(booth).toContain("readTelevoteReceipt(window.localStorage, roundId)");
    expect(recovery).toContain("scrubTelevoteReceipts(window.localStorage)");
    expect(recovery).toContain("writeTelevoteReceipt(window.localStorage, roundId, governance)");
    expect(booth).not.toMatch(/localStorage\.setItem\(\s*receiptKey/);
    expect(recovery).not.toMatch(/localStorage\.setItem\(\s*receiptKey/);
  });
});
