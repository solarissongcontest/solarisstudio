import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync(new URL("../routes/auth/index.tsx", import.meta.url), "utf8");

describe("Public sign-in and recovery accessibility", () => {
  it("announces asynchronous authentication and recovery feedback without replacing the canonical auth service", () => {
    expect(page).toContain('<p role="status" aria-live="polite" className="mt-4 text-sm text-muted-foreground">{msg}</p>');
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
