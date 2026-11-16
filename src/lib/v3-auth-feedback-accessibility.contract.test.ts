import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync(new URL("../routes/auth/index.tsx", import.meta.url), "utf8");

describe("Public sign-in and recovery accessibility", () => {
  it("announces asynchronous authentication and recovery feedback without replacing the canonical auth service", () => {
    // The live region must exist before asynchronous feedback is set, not mount already populated.
    expect(page).toMatch(/<p\s+role="status"\s+aria-live="polite"\s+aria-atomic="true"[\s\S]*?>\s*\{msg\}\s*<\/p>/);
    expect(page).not.toMatch(/\{msg\s*\?\s*<p\b/);
    expect(page).toContain("setMsg(error instanceof Error ? error.message : \"Something went wrong.\")");
    expect(page).toContain("setMsg(");
    expect(page).toContain("await signInSolarisAccount(identifier, password)");
    expect(page).toContain("await requestSolarisPasswordRecovery(login)");
    expect(page).not.toContain("window.alert(");
  });

  it("keeps primary and secondary authentication controls at least 44px tall", () => {
    expect(page).toContain('className="bg-aurora min-h-11 w-full rounded-xl');
    expect(page).toContain('className="mt-3 inline-flex min-h-11 w-full');
    expect(page).toContain('className="mt-4 inline-flex min-h-11 w-full');
  });
});
