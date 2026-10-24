import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const route = readFileSync(resolve(process.cwd(), "src/routes/me/index.tsx"), "utf8");

describe("V3 Me route authentication boundary", () => {
  it("does not reinterpret a failed session read as anonymous", () => {
    expect(route).toContain("session.isError");
    expect(route).toContain("Me stays locked until Solaris can confirm whether this browser is signed in");
    expect(route).toContain("Retry session check");
    expect(route).toContain("session.refetch()");
    expect(route).toContain("!session.isError && user");
  });

  it("preserves the anonymous Me sign-in entry and safe return destination", () => {
    expect(route).toContain("Sign in or create an account");
    expect(route).toContain('search={{ redirect: "/my-solaris" }}');
    expect(route).toContain('navigate({ to: "/my-solaris", replace: true })');
  });

  it("keeps personal Me entry out of public indexing", () => {
    expect(route).toContain('{ name: "robots", content: "noindex, nofollow" }');
  });

  it("does not invent a second auth or account authority", () => {
    expect(route).toContain("useFanSession()");
    expect(route).not.toContain("supabase.auth");
    expect(route).not.toContain("localStorage");
    expect(route).not.toContain("sessionStorage");
    expect(route).not.toContain("Date.now");
  });
});
