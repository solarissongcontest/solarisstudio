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

  it("uses the final public IA as the only public chrome", () => {
    expect(shell).toContain("<NewPublicDesktopNavigation");
    expect(shell).toContain("<PublicDrawerNavigation");
    expect(shell).toContain("<PublicSectionNav");
    expect(shell).toContain("<PublicBreadcrumbs");
    expect(shell).toContain("<PublicFooter");

    expect(shell).not.toContain("LegacyPublicDesktopNavigation");
    expect(shell).not.toContain("LegacyPublicDrawerNavigation");
    expect(shell).not.toContain("LegacyPublicSiteSidebar");
    expect(shell).not.toContain("publicIaV3Enabled");
    expect(shell).not.toContain("resolvePublicIaV3Enabled");
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

  it("retires the legacy navigation compatibility layer after global promotion", () => {
    expect(shell).not.toContain("legacyPublic");
    expect(shell).not.toContain("LEGACY_");
    expect(shell).not.toContain("source: \"legacy_");
  });
});
