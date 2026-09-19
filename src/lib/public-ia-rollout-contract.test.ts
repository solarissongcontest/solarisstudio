import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("public IA v3 rollout contract", () => {
  const flags = source("src/lib/feature-flags.ts");
  const surfaces = source("src/lib/studio2-product-surfaces.ts");
  const shell = source("src/components/AppShell.tsx");
  const legacy = source("src/components/public/LegacyPublicNavigation.tsx");
  const beta = source("src/routes/beta-test/index.tsx");
  const migration = source(
    "supabase/migrations/20260919123500_public_ia_v3_rollout_flag.sql",
  );

  it("registers the rollout flag as a real public product surface", () => {
    expect(flags).toContain("'public_ia_v3'");
    expect(surfaces).toContain("public_ia_v3:");
    expect(surfaces).toContain('label: "Public IA v3"');
    expect(surfaces).toContain('state: "product_surface"');
    expect(surfaces).toContain('audience: "public"');
  });

  it("keeps one page tree and switches only the public chrome", () => {
    expect(shell).toContain("resolvePublicIaV3Enabled");
    expect(shell).toContain("publicIaV3Enabled");
    expect(shell).toContain("<PublicDrawerNavigation");
    expect(shell).toContain("<LegacyPublicDrawerNavigation");
    expect(shell).toContain("<PublicSectionNav");
    expect(shell).toContain("<LegacyPublicSiteSidebar");
    expect(legacy).toContain("LEGACY_PUBLIC_NAVIGATION_GROUPS");
    expect(shell).not.toContain("LegacyPublicRoute");
  });

  it("opts Beta 3 into the new IA without broadening the public server flag", () => {
    expect(beta).toContain("enablePublicIaV3BetaOverride");
    expect(migration).toContain("'public_ia_v3'");
    expect(migration).toContain("true,");
    expect(migration).toContain("admins_only");
    expect(migration).toContain("'{}'::uuid[]");
  });

  it("starts rollout at Organizer scope and remains reversible", () => {
    expect(migration).toContain("'public_ia_v3',\n  true,\n  true");
    expect(shell).toContain("LegacyPublicDesktopNavigation");
    expect(shell).toContain("NewPublicDesktopNavigation");
  });
});
