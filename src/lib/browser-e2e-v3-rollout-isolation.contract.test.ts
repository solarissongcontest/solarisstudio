import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const accountStates = () => read("e2e/account-states.e2e.ts");
const search = () => read("e2e/v3-search.e2e.ts");
const rules = () => read("e2e/v3-rules-guidance.e2e.ts");
const organizer = () => read("e2e/v3-organizer.e2e.ts");
const focusedParticipation = () =>
  read("e2e/v3-navigation/focused-participation-account-states.e2e.ts");

const navigationBrowserEvidence = [
  "e2e/v3-navigation/installed-app.e2e.ts",
  "e2e/v3-navigation/route-memory-installed-app.e2e.ts",
  "e2e/v3-navigation/geometry-report-installed-app.e2e.ts",
  "e2e/v3-navigation/frame-profile-installed-app.e2e.ts",
  "e2e/v3-navigation/large-text-installed-app.e2e.ts",
  "e2e/v3-navigation/reduced-transparency-installed-app.e2e.ts",
  "e2e/v3-navigation/overlay-isolation-installed-app.e2e.ts",
] as const;

const sharedRootDisable = /(?:setFeature|setV3FeatureForLocalUser|setV3ForLocalUser)\([^;]*"solaris_app_v3"\s*,\s*false\b/s;

describe("Browser Audit V3 rollout isolation", () => {
  it("recognizes an actual shared-root disable without confusing helper options or child flags", () => {
    expect(
      'await setFeature(url, key, session, "solaris_app_v3", false, true);',
    ).toMatch(sharedRootDisable);
    expect(
      'await setFeature(url, key, session, "solaris_app_v3", true, false);',
    ).not.toMatch(sharedRootDisable);
    expect(
      'await setFeature(url, key, session, "solaris_app_v3_organizer", false, true);',
    ).not.toMatch(sharedRootDisable);
  });

  it("keeps the seeded country in shared root cohorts used by Organizer-B specs", () => {
    for (const source of [accountStates(), search(), rules(), organizer()]) {
      expect(source).toContain("E2E_COUNTRY_EMAIL");
      expect(source).toContain("E2E_COUNTRY_PASSWORD");
    }

    expect(accountStates()).toContain("[session.user.id, country.user.id]");
    expect(search()).toContain("[session.user.id, country.user.id]");
    expect(rules()).toContain("[session.user.id, country.user.id]");
    expect(organizer()).toContain("[session.user.id, country.user.id]");
  });

  it("does not tear down the shared root flag from a parallel feature test", () => {
    expect(accountStates()).not.toMatch(sharedRootDisable);
    expect(search()).not.toMatch(sharedRootDisable);
    expect(rules()).not.toMatch(sharedRootDisable);
    expect(organizer()).not.toMatch(sharedRootDisable);
    expect(focusedParticipation()).not.toMatch(sharedRootDisable);
  });

  it("keeps focused participation browser proof on child flags only", () => {
    const source = focusedParticipation();

    expect(source).toContain('"solaris_app_v3_confirmation"');
    expect(source).toContain('"solaris_app_v3_jury"');
    expect(source).not.toContain('key: "solaris_app_v3"');
    expect(source).toContain("Refusing focused participation E2E against non-local Supabase");
  });

  it("keeps every NAV Browser Audit fixture hard-wired to loopback Supabase", () => {
    for (const path of navigationBrowserEvidence) {
      const source = read(path);
      expect(source, path).toContain("127.0.0.1");
      expect(source, path).toContain("localhost");
      expect(source, path).toMatch(/Refusing V3/);
      expect(source, path).not.toContain("supabase.co");
    }
  });

  it("keeps shared Explore ownership stable while Search and account-state proofs overlap", () => {
    expect(accountStates()).not.toContain(
      'setV3FeatureForLocalUser(url!, publishableKey!, session, "solaris_app_v3_explore", false)',
    );
    expect(search()).not.toContain(
      'setFeature(url!, publishableKey!, session, "solaris_app_v3_explore", false)',
    );
  });

  it("lets the local seed own Entry's root prerequisite instead of rewriting it", () => {
    const source = accountStates();
    const entryStart = source.indexOf(
      'test("country participant Entry cuts over to V3 without taking Organizer inspection ownership"',
    );
    const nextTest = source.indexOf(
      'test("server-authorized V3 rollout keeps primary, Edition and Delegation content aligned with app navigation"',
      entryStart,
    );
    const entrySource = source.slice(entryStart, nextTest);

    expect(entrySource).not.toContain(
      'setV3FeatureForLocalUser(url!, publishableKey!, organizer, "solaris_app_v3"',
    );
    expect(entrySource).toContain('"solaris_app_v3_entry"');
    expect(entrySource).toContain('"hod_workspace_v2"');
  });
});
