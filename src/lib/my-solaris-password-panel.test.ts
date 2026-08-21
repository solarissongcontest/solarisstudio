import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

describe("My Solaris password controls", () => {
  it("shows the account security panel in My Solaris", () => {
    const route = source("routes/_authenticated/my-solaris/index.tsx");
    expect(route).toContain('import { MySolarisPasswordPanel } from "@/components/MySolarisPasswordPanel"');
    expect(route).toContain("<MySolarisPasswordPanel />");
  });

  it("uses the protected Solaris password flow", () => {
    const panel = source("components/MySolarisPasswordPanel.tsx");
    expect(panel).toContain("setSolarisPassword(newPassword)");
    expect(panel).toContain("newPassword !== confirmPassword");
    expect(panel).toContain('minLength={6}');
    expect(panel).toContain("known data breaches");
    expect(panel).not.toContain("supabase.auth.updateUser");
  });
});
