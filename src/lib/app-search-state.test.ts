import { describe, expect, it } from "vitest";

import {
  clearAppSearchReturn,
  clearLastAppSearchQuery,
  readAppSearchReturn,
  readAppSearchState,
  readPendingAppSearchRestore,
  rememberAppSearchQuery,
  rememberAppSearchReturn,
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
  it("preserves search origin across a result route until the origin restores it", () => {
    const storage = new MemoryStorage();
    rememberAppSearchReturn("/results", "oland", "/countries/OL", storage);

    expect(readAppSearchReturn("/countries/OL", storage)).toMatchObject({
      originPath: "/results",
      query: "oland",
      resultPath: "/countries/OL",
    });
    expect(readAppSearchReturn("/countries/XX", storage)).toBeNull();
    expect(readPendingAppSearchRestore("/results", storage)).toMatchObject({
      query: "oland",
    });

    clearAppSearchReturn(storage);
    expect(readAppSearchReturn(undefined, storage)).toBeNull();
  });

  it("normalizes unsafe search-return paths instead of persisting external navigation", () => {
    const storage = new MemoryStorage();
    rememberAppSearchReturn("//evil.example", "test", "https://evil.example/x", storage);

    expect(readAppSearchReturn(undefined, storage)).toMatchObject({
      originPath: "/",
      resultPath: "/",
    });
  });

});
