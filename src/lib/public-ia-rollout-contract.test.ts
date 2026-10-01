import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const exists = (path: string) => existsSync(resolve(process.cwd(), path));

describe("public IA retirement contract", () => {
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

  it("keeps the final public IA as the only runtime chrome", () => {
    expect(shell).toContain("<NewPublicDesktopNavigation");
    expect(shell).toContain("<PublicDrawerNavigation");
    expect(shell).toContain("<PublicSectionNav");
    expect(shell).toContain("<PublicBreadcrumbs");
    expect(shell).toContain("<PublicFooter");

    expect(shell).not.toContain("LegacyPublic");
    expect(shell).not.toContain("publicIaV3Enabled");
    expect(shell).not.toContain("resolvePublicIaV3Enabled");
  });

  it("removes the retired rollout switch from active application registries", () => {
    expect(flags).not.toContain("'public_ia_v3'");
    expect(surfaces).not.toContain("public_ia_v3:");
    expect(exists("src/lib/public-ia-rollout.ts")).toBe(false);
    expect(exists("src/lib/public-ia-rollout.test.ts")).toBe(false);
    expect(exists("src/lib/public-ia-stability.ts")).toBe(false);
    expect(exists("src/lib/public-ia-stability.test.ts")).toBe(false);
  });

  it("preserves the historical rollout migrations as an audit trail", () => {
    expect(initialMigration).toContain("'public_ia_v3'");
    expect(globalMigration).toContain("'public_ia_v3'");
    expect(globalMigration).toContain("admins_only = false");
    expect(globalMigration).toContain("public.public_ia_v3_enabled()");
  });

  it("does not require the old Beta 3 override or rollback path", () => {
    expect(beta).not.toContain("enablePublicIaV3BetaOverride");
    expect(shell).not.toContain("solaris:public-ia-v3-beta");
    expect(source("e2e/governance.e2e.ts")).not.toContain("Public IA rollback");
    expect(source("e2e/governance.e2e.ts")).not.toContain("public_ia_v3_enabled");
  });
});
