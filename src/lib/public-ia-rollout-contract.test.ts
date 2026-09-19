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
  const initialMigration = source(
    "supabase/migrations/20260919113422_public_ia_v3_rollout_flag.sql",
  );
  const globalMigration = source(
    "supabase/migrations/20260919220333_public_ia_v3_global_default.sql",
  );

  it("registers the rollout flag as a real public product surface", () => {
    expect(flags).toContain("'public_ia_v3'");
    expect(surfaces).toContain("public_ia_v3:");
    expect(surfaces).toContain('label: "Public IA v3"');
    expect(surfaces).toContain('state: "product_surface"');
    expect(surfaces).toContain('audience: "public"');
    expect(initialMigration).toContain("'public_ia_v3'");
  });

  it("uses the new IA as the default public chrome while retaining legacy only for rollback", () => {
    expect(shell).toContain("useState(true)");
    expect(shell).toContain("resolvePublicIaV3Enabled()");
    expect(shell).toContain("<NewPublicDesktopNavigation");
    expect(shell).toContain("<PublicDrawerNavigation");
    expect(shell).toContain("<PublicSectionNav");
    expect(shell).toContain("<PublicBreadcrumbs");
    expect(shell).toContain("<PublicFooter");

    expect(shell).toContain("<LegacyPublicDesktopNavigation");
    expect(shell).toContain("<LegacyPublicDrawerNavigation");
    expect(shell).toContain("<LegacyPublicSiteSidebar");
    expect(legacy).toContain("LEGACY_PUBLIC_NAVIGATION_GROUPS");
    expect(shell).not.toContain("LegacyPublicRoute");
  });

  it("promotes public IA v3 from organizer-only rollout to a global default", () => {
    expect(globalMigration).toContain("'public_ia_v3'");
    expect(globalMigration).toContain("true,");
    expect(globalMigration).toContain("false,");
    expect(globalMigration).toContain("admins_only = false");
    expect(globalMigration).toContain("public.public_ia_v3_enabled()");
    expect(globalMigration).toContain("to anon, authenticated");
  });

  it("does not require a Beta 3 localStorage override anymore", () => {
    expect(beta).not.toContain("enablePublicIaV3BetaOverride");
    expect(shell).not.toContain("solaris:public-ia-v3-beta");
  });

  it("keeps legacy navigation available only behind the explicit rollout boolean", () => {
    expect(shell).toContain("publicIaV3Enabled ? (");
    expect(shell).toContain("LegacyPublicDesktopNavigation");
    expect(shell).toContain("LegacyPublicDrawerNavigation");
    expect(shell).toContain("LegacyPublicSiteSidebar");
  });
});
