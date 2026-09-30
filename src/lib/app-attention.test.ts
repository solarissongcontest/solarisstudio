import { describe, expect, it } from "vitest";

import {
  readAppAttentionSummary,
  writeAppAttentionSummary,
} from "@/lib/app-attention";

class MemoryStorage implements Storage {
  #values = new Map<string, string>();
  get length() { return this.#values.size; }
  clear() { this.#values.clear(); }
  getItem(key: string) { return this.#values.get(key) ?? null; }
  key(index: number) { return [...this.#values.keys()][index] ?? null; }
  removeItem(key: string) { this.#values.delete(key); }
  setItem(key: string, value: string) { this.#values.set(key, value); }
}

describe("installed app attention summary", () => {
  it("persists separate Participate, Me and OS badge counts", () => {
    const storage = new MemoryStorage();
    writeAppAttentionSummary(
      { participate: 3, me: 2, osBadge: 2 },
      storage,
    );
    expect(readAppAttentionSummary(storage)).toMatchObject({
      participate: 3,
      me: 2,
      osBadge: 2,
    });
  });

  it("clamps invalid counts instead of trusting stored data", () => {
    const storage = new MemoryStorage();
    storage.setItem(
      "solaris:app-attention:v1",
      JSON.stringify({
        participate: -8,
        me: 999,
        osBadge: "nope",
        updatedAt: "2026-09-30T00:00:00.000Z",
      }),
    );
    expect(readAppAttentionSummary(storage)).toMatchObject({
      participate: 0,
      me: 99,
      osBadge: 0,
    });
  });
});
