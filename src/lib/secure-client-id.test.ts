import { afterEach, describe, expect, it, vi } from "vitest";

import { createSecureClientId } from "./secure-client-id";

afterEach(() => vi.unstubAllGlobals());

describe("unpredictable browser identifiers", () => {
  it("uses the platform's native cryptographic UUID when available", () => {
    vi.stubGlobal("crypto", {
      randomUUID: () => "d8b94cb3-3d66-49df-9831-4cbe5bd76080",
    });
    expect(createSecureClientId()).toBe("d8b94cb3-3d66-49df-9831-4cbe5bd76080");
  });

  it("uses getRandomValues and still creates a version-4 UUID in older browsers", () => {
    vi.stubGlobal("crypto", {
      getRandomValues(bytes: Uint8Array) {
        for (let i = 0; i < bytes.length; i++) bytes[i] = i;
        return bytes;
      },
    });
    expect(createSecureClientId()).toBe("00010203-0405-4607-8809-0a0b0c0d0e0f");
  });

  it("uses secure bytes if native randomUUID throws", () => {
    vi.stubGlobal("crypto", {
      randomUUID() { throw new Error("UUID unavailable"); },
      getRandomValues(bytes: Uint8Array) {
        bytes.fill(42);
        return bytes;
      },
    });
    expect(createSecureClientId()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it("does not manufacture guessable IDs without browser cryptography", () => {
    vi.stubGlobal("crypto", undefined);
    expect(createSecureClientId()).toBe("");
    vi.stubGlobal("crypto", {});
    expect(createSecureClientId()).toBe("");
  });

  it("fails closed when browser cryptography throws", () => {
    vi.stubGlobal("crypto", {
      getRandomValues() { throw new Error("randomness unavailable"); },
    });
    expect(createSecureClientId()).toBe("");
  });
});
