import { describe, expect, it } from "vitest";

import {
  assertNonProductionSupabaseTarget,
  isCanonicalProductionRuntime,
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
  ])("refuses non-loopback target %s without explicit production identity", (url) => {
    expect(isLoopbackSupabaseTarget(url)).toBe(false);
    expect(() =>
      assertNonProductionSupabaseTarget(url, "development", {
        browserHostname: "preview.example.test",
        runtimeEnv: "preview",
      }),
    ).toThrow(/Refusing non-local target/);
  });

  it("does not treat Vite production mode alone as production authority", () => {
    expect(() =>
      assertNonProductionSupabaseTarget(
        "https://dkxmnvekiopyesuzggeu.supabase.co",
        "production",
        {
          browserHostname: "preview.example.test",
          runtimeEnv: "preview",
        },
      ),
    ).toThrow(/Refusing non-local target/);
  });

  it("allows the canonical production browser hostname", () => {
    const context = {
      browserHostname: "studio.solaris-song-contest.workers.dev",
      runtimeEnv: "preview",
    };

    expect(isCanonicalProductionRuntime(context)).toBe(true);
    expect(() =>
      assertNonProductionSupabaseTarget(
        "https://dkxmnvekiopyesuzggeu.supabase.co",
        "production",
        context,
      ),
    ).not.toThrow();
  });

  it("allows an explicitly marked production Worker runtime", () => {
    const context = {
      browserHostname: null,
      runtimeEnv: "production",
    };

    expect(isCanonicalProductionRuntime(context)).toBe(true);
    expect(() =>
      assertNonProductionSupabaseTarget(
        "https://dkxmnvekiopyesuzggeu.supabase.co",
        "production",
        context,
      ),
    ).not.toThrow();
  });
});
