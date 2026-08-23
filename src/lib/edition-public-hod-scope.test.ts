import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const routeTheme = source("src/components/RouteVisualTheme.tsx");
const editionCss = source("src/edition-public-design.css");
const hodPanel = source("src/components/CountryHodHistoryPanel.tsx");
const migration = source("supabase/migrations/20260821234500_country_hod_self_history.sql");
const intelligence = source("src/integrations/televoting/intelligence.server.ts");

describe("edition public design", () => {
  it("uses edition-owned public style settings rather than the generic page treatment", () => {
    expect(routeTheme).toContain("editionPublicStyle");
    expect(routeTheme).toContain("editionPublicSettings");
    expect(editionCss).toContain('body[data-entity-theme="edition"] .app-main > .page-header');
    expect(editionCss).toContain("border: 1px solid rgb(var(--solaris-accent)");
    expect(editionCss).toContain('data-edition-public-style="glass"');
  });
});

describe("country HOD ownership history", () => {
  it("lets the HOD classify each participated edition and stop automatic carry-forward", () => {
    expect(hodPanel).toContain('"mine"');
    expect(hodPanel).toContain('"other"');
    expect(hodPanel).toContain('"unknown"');
    expect(hodPanel).toContain("I am no longer HOD");
    expect(migration).toContain("hod_auto_assign_future");
    expect(migration).toContain("participants_auto_assign_country_hod");
  });

  it("keeps the HOD and historical-country controls mountable on My Solaris", () => {
    expect(hodPanel).toContain('location.pathname === "/my-solaris"');
    expect(hodPanel).toContain("Historical country names & flags");
    expect(hodPanel).toContain("MutationObserver");
    expect(hodPanel).toContain('document.querySelector<HTMLElement>(".app-main")');
  });

  it("feeds only resolved HOD identities into friendship-voting intelligence", () => {
    expect(migration).toContain("delegation_hod_assignments");
    expect(migration).toContain("country-account-self");
    expect(intelligence).toContain("canonical.hod.resolve");
    expect(intelligence).toContain('if (lens === "hod" && !hod) continue;');
    expect(intelligence).not.toContain("unknown:${editionId}:${voterCode}");
  });
});
