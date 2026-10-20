import { describe, expect, it } from "vitest";

import {
  readPublicBetaFeedbackStorage,
  removePublicBetaFeedbackStorage,
  writePublicBetaFeedbackStorage,
} from "./public-beta-feedback-storage";

type StorageMethod = "getItem" | "setItem" | "removeItem";

function throwingStorage(method: StorageMethod): Pick<Storage, StorageMethod> & Partial<Storage> {
  return {
    getItem() {
      if (method === "getItem") throw new DOMException("blocked", "SecurityError");
      return null;
    },
    setItem() {
      if (method === "setItem") throw new DOMException("full", "QuotaExceededError");
    },
    removeItem() {
      if (method === "removeItem") throw new DOMException("blocked", "SecurityError");
    },
  };
}

describe("public beta feedback browser storage", () => {
  it("treats an unavailable draft read as no local draft", () => {
    expect(
      readPublicBetaFeedbackStorage("draft", throwingStorage("getItem") as Storage),
    ).toBeNull();
  });

  it("fails optional draft writes without throwing", () => {
    expect(
      writePublicBetaFeedbackStorage("draft", "payload", throwingStorage("setItem") as Storage),
    ).toBe(false);
  });

  it("fails optional cleanup without throwing", () => {
    expect(
      removePublicBetaFeedbackStorage("draft", throwingStorage("removeItem") as Storage),
    ).toBe(false);
  });

  it("reports successful local writes and cleanup when storage accepts them", () => {
    const values = new Map<string, string>();
    const storage: Pick<Storage, "getItem" | "setItem" | "removeItem"> = {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => void values.set(key, value),
      removeItem: (key) => void values.delete(key),
    };

    expect(writePublicBetaFeedbackStorage("draft", "payload", storage)).toBe(true);
    expect(readPublicBetaFeedbackStorage("draft", storage)).toBe("payload");
    expect(removePublicBetaFeedbackStorage("draft", storage)).toBe(true);
    expect(readPublicBetaFeedbackStorage("draft", storage)).toBeNull();
  });
});
