import { describe, expect, it } from "vitest";

import {
  clearLastAppSearchQuery,
  readAppSearchState,
  rememberAppSearchQuery,
} from "@/lib/app-search-state";

class MemoryStorage implements Storage {
  #values = new Map<string, string>();
  get length() { return this.#values.size; }
  clear() { this.#values.clear(); }
  getItem(key: string) { return this.#values.get(key) ?? null; }
  key(index: number) { return [...this.#values.keys()][index] ?? null; }
  removeItem(key: string) { this.#values.delete(key); }
  setItem(key: string, value: string) { this.#values.set(key, value); }
}

describe("App Mode search state", () => {
  it("remembers the last useful query and recent searches", () => {
    const storage = new MemoryStorage();
    rememberAppSearchQuery("  Oland  ", storage);
    rememberAppSearchQuery("SSC 21", storage);
    expect(readAppSearchState(storage)).toEqual({
      lastQuery: "SSC 21",
      recentQueries: ["SSC 21", "Oland"],
    });
  });

  it("deduplicates recent queries case-insensitively", () => {
    const storage = new MemoryStorage();
    rememberAppSearchQuery("Oland", storage);
    rememberAppSearchQuery("oland", storage);
    expect(readAppSearchState(storage).recentQueries).toHaveLength(1);
  });

  it("can clear only the last query while keeping search history", () => {
    const storage = new MemoryStorage();
    rememberAppSearchQuery("Oland", storage);
    clearLastAppSearchQuery(storage);
    expect(readAppSearchState(storage)).toEqual({
      lastQuery: "",
      recentQueries: ["Oland"],
    });
  });
});
