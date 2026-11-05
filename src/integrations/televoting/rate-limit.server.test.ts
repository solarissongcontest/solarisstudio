import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("televoting server rate limiter resource safety", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-04T00:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function freshLimiter() {
    // The module-level buckets are deliberately isolated per test.
    return (await import("./rate-limit.server")).enforceTelevotingRateLimit;
  }

  it("allows a configured budget, blocks excess attempts, then expires exactly on time", async () => {
    const enforce = await freshLimiter();
    const options = { limit: 2, windowMs: 60_000 };
    enforce("vote:identity-a", options);
    enforce("vote:identity-a", options);
    expect(() => enforce("vote:identity-a", options)).toThrow(/too many attempts/i);

    vi.advanceTimersByTime(59_999);
    expect(() => enforce("vote:identity-a", options)).toThrow(/too many attempts/i);

    vi.advanceTimersByTime(1);
    expect(() => enforce("vote:identity-a", options)).not.toThrow();
    expect(() => enforce("vote:identity-b", options)).not.toThrow();
  });

  it("never evicts active buckets to admit a new identity at capacity", async () => {
    const enforce = await freshLimiter();
    const options = { limit: 2, windowMs: 60_000 };

    for (let i = 0; i < 5000; i += 1) {
      enforce(`vote:client-${i}`, options);
    }

    expect(() => enforce("vote:extra-client", options)).toThrow(/too many attempts/i);
    // Active keys retain their original budget despite the rejected new key.
    expect(() => enforce("vote:client-0", options)).not.toThrow();
    expect(() => enforce("vote:client-0", options)).toThrow(/too many attempts/i);
    expect(() => enforce("vote:extra-client", options)).toThrow(/too many attempts/i);
  });

  it("does not repeatedly sweep all active buckets under capacity abuse", async () => {
    const enforce = await freshLimiter();
    const options = { limit: 1, windowMs: 60_000 };
    for (let i = 0; i < 5000; i += 1) {
      enforce(`vote:full-${i}`, options);
    }

    const filterSpy = vi.spyOn(Array.prototype, "filter");
    let rejected = 0;
    let additionalScans = -1;
    try {
      const priorScans = filterSpy.mock.calls.length;
      for (let i = 0; i < 50; i += 1) {
        try {
          enforce(`vote:overflow-${i}`, options);
        } catch {
          rejected += 1;
        }
      }
      additionalScans = filterSpy.mock.calls.length - priorScans;
    } finally {
      filterSpy.mockRestore();
    }
    expect(rejected).toBe(50);
    expect(additionalScans).toBe(0);
  });

  it("prunes expired keys using their own windows without resetting longer limits", async () => {
    const enforce = await freshLimiter();
    const longWindow = { limit: 1, windowMs: 60_000 };
    const shortWindow = { limit: 1, windowMs: 1_000 };

    enforce("vote:long-window", longWindow);
    for (let i = 1; i < 5000; i += 1) {
      enforce(`vote:short-${i}`, shortWindow);
    }

    vi.advanceTimersByTime(1_001);
    expect(() => enforce("vote:new-client", shortWindow)).not.toThrow();
    expect(() => enforce("vote:long-window", longWindow)).toThrow(/too many attempts/i);
  });

  it("reuses capacity exactly at expiry and still bounds the replacement identities", async () => {
    const enforce = await freshLimiter();
    const options = { limit: 1, windowMs: 60_000 };
    for (let i = 0; i < 5000; i += 1) enforce(`vote:old-${i}`, options);

    vi.advanceTimersByTime(59_999);
    expect(() => enforce("vote:early", options)).toThrow(/too many attempts/i);
    vi.advanceTimersByTime(1);
    for (let i = 0; i < 5000; i += 1) enforce(`vote:new-${i}`, options);

    expect(() => enforce("vote:overflow", options)).toThrow(/too many attempts/i);
    expect(() => enforce("vote:new-0", options)).toThrow(/too many attempts/i);
  });

  it("does not free a bucket when only its oldest hit has expired", async () => {
    const enforce = await freshLimiter();
    const options = { limit: 2, windowMs: 60_000 };
    for (let i = 0; i < 5000; i += 1) enforce(`vote:active-${i}`, options);
    vi.advanceTimersByTime(30_000);
    for (let i = 0; i < 5000; i += 1) enforce(`vote:active-${i}`, options);
    vi.advanceTimersByTime(30_000);

    expect(() => enforce("vote:overflow", options)).toThrow(/too many attempts/i);
    // Only the first hit has expired; this existing key has one attempt left.
    expect(() => enforce("vote:active-0", options)).not.toThrow();
    expect(() => enforce("vote:active-0", options)).toThrow(/too many attempts/i);

    vi.advanceTimersByTime(30_000);
    expect(() => enforce("vote:reclaimed", options)).not.toThrow();
    expect(() => enforce("vote:active-0", options)).not.toThrow();
    expect(() => enforce("vote:active-0", options)).toThrow(/too many attempts/i);
  });

  it("reclaims a shortened window even when the configuration change denied an attempt", async () => {
    const enforce = await freshLimiter();
    const original = { limit: 1, windowMs: 60_000 };
    for (let i = 0; i < 5000; i += 1) enforce(`vote:client-${i}`, original);

    vi.advanceTimersByTime(10_000);
    const shortened = { limit: 1, windowMs: 15_000 };
    expect(() => enforce("vote:client-0", shortened)).toThrow(/too many attempts/i);
    vi.advanceTimersByTime(4_999);
    expect(() => enforce("vote:new-client", original)).toThrow(/too many attempts/i);
    vi.advanceTimersByTime(1);

    expect(() => enforce("vote:new-client", original)).not.toThrow();
    expect(() => enforce("vote:client-1", original)).toThrow(/too many attempts/i);
  });

  const invalidCases: Array<[string, string, { limit: number; windowMs: number }]> = [
    ["missing identity", "", { limit: 1, windowMs: 1_000 }],
    ["oversized identity", "x".repeat(257), { limit: 1, windowMs: 1_000 }],
    ["zero limit", "valid", { limit: 0, windowMs: 1_000 }],
    ["fractional limit", "valid", { limit: 0.5, windowMs: 1_000 }],
    ["nonfinite limit", "valid", { limit: Number.POSITIVE_INFINITY, windowMs: 1_000 }],
    ["oversized limit", "valid", { limit: 101, windowMs: 1_000 }],
    ["zero window", "valid", { limit: 1, windowMs: 0 }],
    ["nonfinite window", "valid", { limit: 1, windowMs: Number.NaN }],
    ["oversized window", "valid", { limit: 1, windowMs: 86_400_001 }],
  ];

  it.each(invalidCases)("fails closed for %s", async (_reason, key, options) => {
    const enforce = await freshLimiter();
    expect(() => enforce(key, options)).toThrow(/rate limiting is temporarily unavailable/i);
  });
});
