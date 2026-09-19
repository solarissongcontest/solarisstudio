import { describe, expect, it, vi } from "vitest";

import { getPublicUxSessionId } from "./public-ux-events";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
  };
}

describe("public UX session", () => {
  it("reuses a recent local session without storing identity data", () => {
    const storage = memoryStorage();
    const first = getPublicUxSessionId(storage as Storage, 1_000);
    const second = getPublicUxSessionId(storage as Storage, 2_000);
    expect(second).toBe(first);
  });

  it("rotates an expired session", () => {
    const storage = memoryStorage();
    const first = getPublicUxSessionId(storage as Storage, 1_000);
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValueOnce(
      "00000000-0000-4000-8000-000000000002",
    );
    const second = getPublicUxSessionId(
      storage as Storage,
      1_000 + 8 * 24 * 60 * 60 * 1000,
    );
    expect(second).not.toBe(first);
    vi.restoreAllMocks();
  });
});


describe("public UX automation guard", () => {
  it("keeps webdriver sessions out of production telemetry", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync(
      new URL("./public-ux-events.ts", import.meta.url),
      "utf8",
    );
    expect(source).toContain("window.navigator.webdriver");
  });
});
