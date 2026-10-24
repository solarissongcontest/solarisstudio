import { describe, expect, it } from "vitest";

import {
  assertNonProductionSupabaseTarget,
  isLoopbackSupabaseTarget,
} from "@/lib/supabase-target-safety";

describe("Supabase target safety", () => {
  it.each([
    "http://127.0.0.1:54321",
    "http://localhost:54321",
    "http://[::1]:54321",
  ])("accepts loopback target %s", (url) => {
    expect(isLoopbackSupabaseTarget(url)).toBe(true);
    expect(() => assertNonProductionSupabaseTarget(url, "development")).not.toThrow();
    expect(() => assertNonProductionSupabaseTarget(url, "test")).not.toThrow();
  });

  it.each([
    "https://example.supabase.co",
    "https://dkxmnvekiopyesuzggeu.supabase.co",
    "http://192.168.1.20:54321",
    "not-a-url",
  ])("refuses non-loopback target %s outside production", (url) => {
    expect(isLoopbackSupabaseTarget(url)).toBe(false);
    expect(() => assertNonProductionSupabaseTarget(url, "development")).toThrow(
      /Refusing non-local target outside production mode/,
    );
  });

  it("allows the deployed production runtime to use its configured hosted target", () => {
    expect(() =>
      assertNonProductionSupabaseTarget(
        "https://example.supabase.co",
        "production",
      ),
    ).not.toThrow();
  });
});
