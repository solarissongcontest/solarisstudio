import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("V3 browser rollout fixture isolation", () => {
  it("keeps the seeded country cohort enabled while account-state rollout proof adds Organizer B", () => {
    const seed = source(".github/scripts/seed-browser-e2e-local.sh");
    const accountStates = source("e2e/account-states.e2e.ts");

    expect(seed).toContain(
      "('solaris_app_v3', true, false, array['$COUNTRY_ID'::uuid], '{}'::uuid[], null)",
    );
    expect(accountStates).toContain(
      "const globalRolloutTargets = [countrySession.user.id, session.user.id]",
    );
    expect(accountStates).toContain(
      '"solaris_app_v3",\n    true,\n    [],\n    globalRolloutTargets',
    );
  });

  it("restores the country-only seed baseline instead of globally disabling App V3", () => {
    const accountStates = source("e2e/account-states.e2e.ts");
    const positivePathStart = accountStates.indexOf(
      'test("server-authorized V3 rollout keeps primary, Edition and Delegation content aligned with app navigation"',
    );
    expect(positivePathStart).toBeGreaterThanOrEqual(0);

    const positivePath = accountStates.slice(positivePathStart);
    expect(positivePath).toContain(
      '"solaris_app_v3",\n      true,\n      [],\n      [countrySession.user.id]',
    );
    expect(positivePath).not.toContain(
      "await setV3ForLocalUser(url!, publishableKey!, session, false)",
    );
  });
});
