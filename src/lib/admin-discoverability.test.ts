import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("Organizer discoverability", () => {
  it("makes core edition workspaces visible from the edition landing page", () => {
    const edition = source("src/routes/_authenticated/admin/$slug.tsx");

    expect(edition).toContain("Edition workspaces");
    expect(edition).toContain("Delegations & confirmations");
    expect(edition).toContain('to="/admin/countries"');
    expect(edition).toContain('to="/televoting/admin"');
    expect(edition).toContain('to="/admin/control-room"');
    expect(edition).toContain('to={`/admin/publication/${slug}`}');
    expect(edition).toContain("More edition tools");
  });

  it("keeps Home aligned with the five current-edition workspaces", () => {
    const home = source("src/routes/_authenticated/admin/operations.tsx");

    expect(home).toContain('to="/admin/countries"');
    expect(home).toContain('label="Delegations"');
    expect(home).toContain('label="Voting & results"');
    expect(home).toContain('label="Live"');
    expect(home).toContain('to="/admin/action-center"');
  });

  it("makes confirmations reachable from the Delegations hub without search", () => {
    const countries = source("src/routes/_authenticated/admin/countries.tsx");

    expect(countries).toContain("Delegation workflows");
    expect(countries).toContain('to="/confirmations/admin"');
    expect(countries).toContain('to="/confirmations/admin/responses"');
    expect(countries).toContain('to="/confirmations/admin/rounds"');
    expect(countries).toContain('to="/confirmations/admin/calendar"');
    expect(countries).toContain('to="/confirmations/admin/recovery-codes"');
  });

  it("makes important global administration tools visible from Administration", () => {
    const administration = source("src/routes/_authenticated/admin/more.tsx");

    for (const path of [
      "/admin/access-permissions",
      "/admin/country-accounts",
      "/admin/hod-history",
      "/admin/feature-rollout",
      "/admin/guide",
      "/admin/menu",
      "/admin/sync-health",
      "/admin/system",
    ]) {
      expect(administration).toContain(path);
    }
  });

  it("keeps contextual workflows visible on narrow screens without horizontal-scroll discovery", () => {
    const sectionNav = source("src/components/admin/AdminSectionNav.tsx");

    expect(sectionNav).toContain("flex flex-wrap");
    expect(sectionNav).not.toContain("overflow-x-auto");
    expect(sectionNav).toContain("basis-[30%]");
  });

  it("keeps a visible complete tool directory without bloating permanent navigation", () => {
    const nav = source("src/components/admin/AdminNav.tsx");
    const menu = source("src/routes/_authenticated/admin/menu.tsx");

    expect(nav).toContain("All Organizer tools");
    expect(nav).toContain('to="/admin/menu"');
    expect(menu).toContain("All specialist pages");
  });

  it("keeps protected Rules & Cases specialist workflows visibly connected", () => {
    const evidence = source("src/routes/_authenticated/admin/integrity-evidence.tsx");
    const disclosure = source("src/routes/_authenticated/admin/integrity-disclosure.tsx");

    expect(evidence).toContain('to="/admin/integrity-disclosure"');
    expect(evidence).toContain('to="/admin/integrity-identity"');
    expect(disclosure).toContain('to="/admin/integrity-identity"');

    const rules = source("src/routes/_authenticated/admin/rules-manager.tsx");
    expect(rules).toContain('to="/admin/rule-interpretations"');
  });
});
