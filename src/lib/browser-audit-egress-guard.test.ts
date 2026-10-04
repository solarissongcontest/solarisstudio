import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(".github/workflows/browser-audit.yml", "utf8");

describe("browser audit hosted-egress guard", () => {
  it("runs browser CI against isolated local Supabase only", () => {
    expect(workflow).toContain("Start isolated local Supabase for browser audit");
    expect(workflow).toContain("supabase db reset --local --no-seed");
    expect(workflow).toContain("Refusing browser audit against non-local Supabase URL");
    expect(workflow).toContain("Refusing audit server with hosted Supabase URL");
    expect(workflow).toContain("http://127.0.0.1:54321");
  });

  it("does not expose hosted Supabase or account credentials to browser CI", () => {
    expect(workflow).not.toContain("secrets.E2E_SUPABASE_URL");
    expect(workflow).not.toContain("secrets.E2E_SUPABASE_PUBLISHABLE_KEY");
    expect(workflow).not.toContain("secrets.E2E_COUNTRY_EMAIL");
    expect(workflow).not.toContain("secrets.E2E_ORGANIZER_EMAIL");
    expect(workflow).not.toContain("secrets.E2E_SUSPENDED_EMAIL");
    expect(workflow).not.toContain("dkxmnvekiopyesuzggeu");
  });
});
