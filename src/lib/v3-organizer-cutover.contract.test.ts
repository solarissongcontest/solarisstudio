import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const flags = readFileSync("src/lib/feature-flags.ts", "utf8");
const rollout = readFileSync("src/integrations/v3/rollout-probe.server.ts", "utf8");
const shell = readFileSync("src/components/admin/AdminShell.tsx", "utf8");
const mobile = readFileSync("src/components/admin/OrganizerV3MobileChrome.tsx", "utf8");
const control = readFileSync("src/routes/_authenticated/admin/control.tsx", "utf8");
const migration = readFileSync(
  "supabase/migrations/20261014142000_v3_organizer_cutover.sql",
  "utf8",
);

describe("V3 Organizer reversible cutover", () => {
  it("persists an Organizer-only flag that starts disabled", () => {
    expect(flags).toContain("'solaris_app_v3_organizer'");
    expect(migration).toContain("'solaris_app_v3_organizer'");
    expect(migration).toMatch(/'solaris_app_v3_organizer',\s*false,\s*true/);
  });

  it("evaluates Organizer rollout on the server and fails closed in the shell", () => {
    expect(rollout).toContain('p_key: "solaris_app_v3_organizer"');
    expect(rollout).toContain("organizerEnabled: false");
    expect(rollout).toContain("organizerEnabled: enabled && !organizerFlag.error && organizerFlag.data === true");
    expect(shell).toContain("useV3RolloutProbe(true)");
    expect(shell).toContain("organizerV3.data?.organizerEnabled === true");
    expect(shell).toContain('data-organizer-generation={organizerV3Enabled ? "v3" : "legacy"}');
    expect(shell).toContain("organizerV3Enabled ? <OrganizerV3MobileChrome /> : <OrganizerV6MobileChrome />");
  });

  it("uses the canonical five Organizer areas without creating a second tab bar primitive", () => {
    for (const label of ["Overview", "Tasks", "Control", "Live", "More"]) {
      expect(mobile).toContain(`label: "${label}"`);
    }
    expect(mobile).toContain("OrganizerV6TabBar");
    expect(mobile).toContain("V3_ORGANIZER_TAB_ORDER.map");
    expect(mobile).toContain("getV3OrganizerTabDestination");
    expect(mobile).toContain("consumeV3OrganizerNavigationRestore");
  });

  it("keeps Control as a presentation router over existing authorities", () => {
    expect(control).toContain("buildV3OrganizerControlGroups");
    expect(control).toContain('data-v3-organizer-control=""');
    expect(control).toContain("Current edition");
    expect(control).toContain("Select edition");
    expect(control).not.toContain("integrations/supabase/client");
    expect(control).not.toContain(".from(");
    expect(control).not.toContain(".rpc(");
  });

  it("does not replace the existing Organizer authorization gate", () => {
    const route = readFileSync("src/routes/_authenticated/admin/route.tsx", "utf8");
    expect(route).toContain("hasSolarisOrganizerAccess");
    expect(route).toContain("OrganizerAccessGate");
    expect(route).toContain("<AdminShell");
  });
});
