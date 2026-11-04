import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

function cryptoForTests(seeds: string[]) {
  return {
    getRandomValues: vi.fn((bytes: Uint8Array) => {
      for (let index = 0; index < bytes.length; index++) bytes[index] = index;
      return bytes;
    }),
    subtle: {
      digest: vi.fn(async (_algorithm: string, encoded: Uint8Array) => {
        seeds.push(new TextDecoder().decode(encoded));
        return new Uint8Array(32).buffer;
      }),
    },
  };
}

async function buildIdentity() {
  const { buildTelevotingClientIdentity } = await import("./anti-abuse");
  return buildTelevotingClientIdentity();
}

describe("televote device identity uses secure browser entropy", () => {
  it("creates and persists a cryptographic v4 UUID when randomUUID is unavailable", async () => {
    const seeds: string[] = [];
    const crypto = cryptoForTests(seeds);
    const storage = { getItem: vi.fn(() => null), setItem: vi.fn() };
    vi.stubGlobal("crypto", crypto);
    vi.stubGlobal("localStorage", storage);

    const identity = await buildIdentity();

    expect(crypto.getRandomValues).toHaveBeenCalledTimes(1);
    expect(storage.setItem).toHaveBeenCalledWith(
      "solaris.device_token.v1",
      "00010203-0405-4607-8809-0a0b0c0d0e0f",
    );
    expect(seeds).toContain("solaris-dev:00010203-0405-4607-8809-0a0b0c0d0e0f");
    expect(identity.deviceTokenHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("preserves tokens already tied to existing server-side duplicate checks", async () => {
    const seeds: string[] = [];
    const crypto = {
      ...cryptoForTests(seeds),
      randomUUID: vi.fn(() => {
        throw new Error("A previously stored ballot token must not be rotated");
      }),
    };
    const storage = {
      getItem: vi.fn(() => "existing-ballot-device-token"),
      setItem: vi.fn(),
    };
    vi.stubGlobal("crypto", crypto);
    vi.stubGlobal("localStorage", storage);

    await buildIdentity();

    expect(seeds).toContain("solaris-dev:existing-ballot-device-token");
    expect(crypto.getRandomValues).not.toHaveBeenCalled();
    expect(crypto.randomUUID).not.toHaveBeenCalled();
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it("keeps the same securely generated identity when browser storage is blocked", async () => {
    const seeds: string[] = [];
    const crypto = cryptoForTests(seeds);
    vi.stubGlobal("crypto", crypto);
    vi.stubGlobal("localStorage", {
      getItem: () => { throw new Error("storage blocked"); },
      setItem: () => { throw new Error("storage blocked"); },
    });

    await buildIdentity();
    await buildIdentity();

    expect(crypto.getRandomValues).toHaveBeenCalledTimes(1);
    expect(seeds.filter((seed) => seed.startsWith("solaris-dev:"))).toEqual([
      "solaris-dev:00010203-0405-4607-8809-0a0b0c0d0e0f",
      "solaris-dev:00010203-0405-4607-8809-0a0b0c0d0e0f",
    ]);
  });

  it("rejects a new identity when cryptographic randomness is unavailable", async () => {
    const seeds: string[] = [];
    const crypto = {
      subtle: cryptoForTests(seeds).subtle,
    };
    const storage = { getItem: vi.fn(() => null), setItem: vi.fn() };
    vi.stubGlobal("crypto", crypto);
    vi.stubGlobal("localStorage", storage);

    await expect(buildIdentity()).rejects.toThrow(
      /secure browser cryptography is required/i,
    );
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(seeds).toHaveLength(0);
  });
});
