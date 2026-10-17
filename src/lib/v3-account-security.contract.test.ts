import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("V3 Account security", () => {
  it("uses a native V3 presentation over the protected recovery and password engines", () => {
    const sections = read("src/components/v3/V3AccountSections.tsx");
    const security = read("src/components/v3/V3AccountSecurityPanel.tsx");
    const auth = read("src/lib/country-auth.ts");

    expect(sections).toContain("<V3AccountSecurityPanel />");
    expect(security).toContain("getSolarisAccountProfile");
    expect(security).toContain("setSolarisRecoveryEmail(normalized)");
    expect(security).toContain("setSolarisPassword(newPassword)");
    expect(security).toContain("newPassword !== confirmPassword");
    expect(security).toContain('minLength={6}');
    expect(auth).toContain('action: "set-email"');
    expect(auth).toContain('action: "set-password"');
    expect(security).not.toContain("supabase.auth.updateUser");
  });
});
