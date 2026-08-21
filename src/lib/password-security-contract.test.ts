import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

describe("password security fallback", () => {
  it("checks only a SHA-1 prefix against Pwned Passwords with padding", () => {
    const edge = source("../supabase/functions/country-auth/index.ts");
    expect(edge).toContain('crypto.subtle.digest("SHA-1"');
    expect(edge).toContain("hash.slice(0, 5)");
    expect(edge).toContain("api.pwnedpasswords.com/range");
    expect(edge).toContain('"Add-Padding": "true"');
    expect(edge).not.toContain("passwords.com/range/${password}");
  });

  it("rejects breached passwords during country signup", () => {
    const edge = source("../supabase/functions/country-auth/index.ts");
    expect(edge).toContain('if (action === "signup")');
    expect(edge).toContain("const passwordError = await passwordSafetyError(password)");
    expect(edge).toContain("appears in known data breaches");
  });

  it("routes password resets through the protected edge action", () => {
    const authClient = source("lib/country-auth.ts");
    const reset = source("routes/auth/reset.tsx");
    expect(authClient).toContain('action: "set-password"');
    expect(reset).toContain("setSolarisPassword(password)");
    expect(reset).not.toContain("supabase.auth.updateUser({ password })");
  });
});
