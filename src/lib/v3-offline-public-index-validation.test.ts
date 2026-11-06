import { describe, expect, it, vi } from "vitest";

import {
  OFFLINE_PUBLIC_INDEX_KEY,
  readOfflinePublicIndex,
  writeOfflinePublicIndex,
  type OfflinePublicIndex,
} from "./app-offline-snapshot";

const validIndex = (): OfflinePublicIndex => ({
  savedAt: "2026-11-07T00:00:00.000Z",
  editions: [{ id: "e1", label: "SSC 22 · Ålanti", path: "/editions/ålanti-22" }],
  shows: [{ id: "s1", label: "Grand Final", path: "/shows/s1" }],
  countries: [{ id: "c1", label: "Oland", path: "/countries/OL" }],
});

function localIndex(value: unknown) {
  const rows = new Map([[OFFLINE_PUBLIC_INDEX_KEY, JSON.stringify(value)]]);
  return {
    getItem: (key: string) => rows.get(key) ?? null,
    setItem: (key: string, next: string) => { rows.set(key, next); },
    removeItem: (key: string) => { rows.delete(key); },
  };
}

describe("offline public-index fail-closed storage boundary", () => {
  it("preserves genuine public metadata and the original bounded reader contract", () => {
    const snapshot = validIndex();
    expect(readOfflinePublicIndex(localIndex(snapshot))).toEqual(snapshot);
  });

  it.each([
    ["private task route", "/participate/entry"],
    ["account route", "/me"],
    ["cross-collection route", "/shows/s1"],
    ["encoded separator", "/countries/OL%2fprivate"],
    ["double-encoded separator", "/countries/OL%252fprivate"],
    ["traversal", "/countries/%2e%2e"],
    ["fragment", "/countries/OL#private"],
    ["query", "/countries/OL?token=secret"],
    ["backslash", "/countries/OL\\private"],
    ["second segment", "/countries/OL/private"],
  ])("refuses a %s instead of returning legacy private metadata", (_name, path) => {
    const index = validIndex();
    index.countries[0].path = path;
    expect(readOfflinePublicIndex(localIndex(index))).toBeNull();
  });

  it.each(["editions", "shows", "countries"] as const)(
    "rejects private or unexpected metadata in %s rows",
    (collection) => {
      const index = validIndex();
      const row = index[collection][0] as unknown as Record<string, unknown>;
      row.privateNotes = "not public";
      expect(readOfflinePublicIndex(localIndex(index))).toBeNull();
    },
  );

  it("rejects extra root metadata, impossible dates and untrusted label contents", () => {
    expect(readOfflinePublicIndex(localIndex({ ...validIndex(), accountId: "private" }))).toBeNull();

    const date = validIndex();
    date.savedAt = "2026-13-07T00:00:00.000Z";
    expect(readOfflinePublicIndex(localIndex(date))).toBeNull();

    const label = validIndex();
    label.shows[0].label = "Hidden result\nprivate";
    expect(readOfflinePublicIndex(localIndex(label))).toBeNull();
  });

  it.each([
    ["editions", 13],
    ["shows", 25],
    ["countries", 81],
  ] as const)("rejects %s above the existing %i-entry cap", (collection, count) => {
    const index = validIndex();
    const original = index[collection][0];
    const rows = index as unknown as Record<
      "editions" | "shows" | "countries",
      Array<{ id: string; label: string; path: string }>
    >;
    rows[collection] = Array.from({ length: count }, (_, n) => ({
      ...original,
      id: "row-" + n,
    }));
    expect(readOfflinePublicIndex(localIndex(index))).toBeNull();
  });

  it("does not persist an unsafe index supplied by an erroneous published-data caller", () => {
    const setItem = vi.fn();
    writeOfflinePublicIndex({
      editions: [{ id: "e1", name: "SSC 22", slug: "ssc22", edition_number: 22 }],
      shows: [],
      countries: [{ id: "c1", name: "Oland", short_code: "OL%2fsecret" }],
    }, { setItem });
    expect(setItem).not.toHaveBeenCalled();

    writeOfflinePublicIndex({
      editions: [{ id: "e1", name: "SSC 22", slug: "ssc22", edition_number: 22 }],
      shows: [{ id: "s1", name: "Grand Final" }],
      countries: [{ id: "c1", name: "Oland", short_code: "OL" }],
    }, { setItem });
    expect(setItem).toHaveBeenCalledTimes(1);
    const [key, serialized] = setItem.mock.calls[0];
    expect(key).toBe(OFFLINE_PUBLIC_INDEX_KEY);
    expect(readOfflinePublicIndex(localIndex(JSON.parse(serialized)))).not.toBeNull();
  });
});
