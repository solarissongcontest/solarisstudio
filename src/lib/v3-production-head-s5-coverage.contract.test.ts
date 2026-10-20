import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const upgradeScript = readFileSync(
  ".github/scripts/v3-production-head-upgrade-rehearsal.sh",
  "utf8",
);
const notificationRehearsal = readFileSync(
  ".github/scripts/v3-s5-notification-consequences-rehearsal.sh",
  "utf8",
);

const s5ConsequenceRehearsals = readdirSync(".github/scripts")
  .filter((name) => /^v3-s5-.*-consequences-rehearsal\.sh$/.test(name))
  .sort();

describe("V3 production-head upgrade S5 consequence coverage", () => {
  it("discovers every checked-in S5 consequence rehearsal instead of maintaining a stale allowlist", () => {
    expect(s5ConsequenceRehearsals.length).toBeGreaterThan(2);
    expect(s5ConsequenceRehearsals).toContain("v3-s5-access-consequences-rehearsal.sh");
    expect(s5ConsequenceRehearsals).toContain("v3-s5-preference-consequences-rehearsal.sh");

    expect(upgradeScript).toContain("mapfile -t s5_consequence_rehearsals");
    expect(upgradeScript).toContain("-name 'v3-s5-*-consequences-rehearsal.sh'");
    expect(upgradeScript).toContain('"${s5_consequence_rehearsals[@]}"');
  });

  it("keeps the production-required Confirmation maintenance flow in the upgraded-database sequence", () => {
    expect(upgradeScript).toContain("v3-confirmation-maintenance-edit-rehearsal.sh");
  });

  it("restores only the disposable local operational mode between destructive scenarios", () => {
    expect(upgradeScript).toContain("reset_local_operational_mode");
    expect(upgradeScript).toContain("studio2_platform_operational_state");
    expect(upgradeScript).toContain("mode='normal'");
    expect(upgradeScript).toContain("Production-head rehearsal isolation");

    const loop = upgradeScript.slice(upgradeScript.indexOf("for rehearsal in"));
    expect(loop).toContain("reset_local_operational_mode");
  });

  it("preserves fail-closed local-only migration rehearsal guards", () => {
    expect(upgradeScript).toContain("Refusing hosted Supabase rehearsal");
    expect(upgradeScript).toContain("Refusing non-local database rehearsal");
    expect(upgradeScript).toContain("supabase migration up --local --include-all");
    expect(upgradeScript).toContain("PRODUCTION_BASELINE_SHA256");
  });

  it("keeps Notification diagnostics off stdout so captured fixture ids stay machine-readable", () => {
    expect(notificationRehearsal).toContain(
      "log() { printf '\\n[v3-s5-notification] %s\\n' \"$*\" >&2; }",
    );
    expect(notificationRehearsal).toContain(
      'RECIPIENT_USER="$(create_user \'v3-s5-notification-recipient@solaris.invalid\')"',
    );
  });
});
