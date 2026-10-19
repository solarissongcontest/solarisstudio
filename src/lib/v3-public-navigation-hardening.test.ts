import { describe, expect, it } from "vitest";

import { consumeV3PublicNavigationRestore } from "@/lib/v3-public-navigation";

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear() {
      values.clear();
    },
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    key(index: number) {
      return [...values.keys()][index] ?? null;
    },
    removeItem(key: string) {
      values.delete(key);
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
  };
}

describe("V3 public tab restore hardening", () => {
  it("consumes malformed restore payloads exactly once", () => {
    const session = memoryStorage();
    const key = "solaris:public-v3-navigation-restore:v1:viewer-a";
    session.setItem(key, "{not-json");

    expect(
      consumeV3PublicNavigationRestore("/explore", "", session, "viewer-a"),
    ).toBeNull();
    expect(session.getItem(key)).toBeNull();
  });
});
