import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const routeTheme = source("src/components/RouteVisualTheme.tsx");
const editionCss = source("src/edition-appearance.css");
const appearanceRoute = source("src/routes/_authenticated/admin/edition-appearance.$slug.tsx");
const hodRoute = source("src/routes/_authenticated/my-solaris/hod-history.tsx");
const intelligence = source("src/integrations/televoting/intelligence.server.ts");
const hodMigration = source("supabase/migrations/20260821204337_harden_hod_self_history_and_edition_design.sql");
const scopeMigration = source("supabase/migrations/20260821205035_fix_hod_history_participation_scope.sql");
const finalAutoMigration = source("supabase/migrations/20260821205353_finalize_hod_auto_scope_and_permissions.sql");

describe("edition public design", () => {
  it("removes the legacy cyan page-header streak and themes show pages from the edition", () => {
    expect(editionCss).toContain('body[data-entity-theme="edition"] .page-header::after');
    expect(editionCss).toContain("content: none !important");
    expect(editionCss).toContain("rgb(var(--solaris-accent))");
    expect(routeTheme).toContain("editionAppearanceFromConfig");
    expect(routeTheme).toContain("--edition-page-background");
  });

  it("offers actual edition composition controls instead of colours only", () => {
    expect(appearanceRoute).toContain("Header style");
    expect(appearanceRoute).toContain("Card material");
    expect(appearanceRoute).toContain("Page background");
    expect(appearanceRoute).toContain("Artwork left / right");
    expect(appearanceRoute).toContain("Optional third background colour");
  });
});

describe("HOD tenure identity", () => {
  it("lets the country account mark editions mine, other or unknown and stop future carry-forward", () => {
    expect(hodRoute).toContain('type HodStatus = "mine" | "other" | "unknown"');
    expect(hodRoute).toContain("set_owned_hod_auto_assign");
    expect(hodRoute).toContain("Automatically count new editions as mine");
    expect(hodMigration).toContain("source not in ('country-account-self','country-account-auto')");
  });

  it("only auto-assigns confirmed canonical participations", () => {
    expect(finalAutoMigration).toContain("new.show_id is not null");
    expect(finalAutoMigration).toContain("new.participation_status <> 'confirmed'");
    expect(scopeMigration).toContain("update of country_id,edition_id,participation_status,show_id");
    expect(scopeMigration).toContain("p.participation_status='confirmed'");
  });

  it("does not feed unresolved HOD editions into personal friendship-voting observations", () => {
    const skipCount = intelligence.split('if (lens === "hod" && !hod) continue;').length - 1;
    expect(skipCount).toBe(2);
    expect(intelligence).not.toContain("`unknown:${editionId}:${voterCode}`");
    expect(intelligence).not.toContain("`unknown:${first.edition_id}:${voterCode}`");
  });
});
