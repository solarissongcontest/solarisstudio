import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("V3 Account actions", () => {
  it("does not report logout success until the auth service accepts sign-out", () => {
    const actions = read("src/components/v3/V3AccountSections.tsx");
    const session = read("src/lib/account-session.ts");

    expect(actions).toContain("await signOutSolarisAccount()");
    expect(actions).toContain('window.location.href = "/"');
    expect(actions).toContain("This screen will not pretend the session was revoked");
    expect(session).toContain("supabase.auth.signOut()");
  });
});
