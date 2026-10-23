import { describe, expect, it, vi } from "vitest";

import {
  readOptionalStorage,
  writeOptionalStorage,
} from "@/lib/app-optional-browser-storage";

describe("optional browser storage", () => {
  it("distinguishes unavailable storage from a missing value", () => {
    expect(readOptionalStorage(null, "demo")).toBeUndefined();

    const storage = {
      getItem: vi.fn(() => null),
    } as unknown as Storage;

    expect(readOptionalStorage(storage, "demo")).toBeNull();
  });

  it("fails soft when a browser rejects reads", () => {
    const storage = {
      getItem: vi.fn(() => {
        throw new DOMException("blocked", "SecurityError");
      }),
    } as unknown as Storage;

    expect(readOptionalStorage(storage, "demo")).toBeUndefined();
  });

  it("reports write success without throwing on restricted storage", () => {
    const writable = {
      setItem: vi.fn(),
    } as unknown as Storage;
    expect(writeOptionalStorage(writable, "demo", "1")).toBe(true);

    const blocked = {
      setItem: vi.fn(() => {
        throw new DOMException("blocked", "QuotaExceededError");
      }),
    } as unknown as Storage;
    expect(writeOptionalStorage(blocked, "demo", "1")).toBe(false);
    expect(writeOptionalStorage(null, "demo", "1")).toBe(false);
  });
});
