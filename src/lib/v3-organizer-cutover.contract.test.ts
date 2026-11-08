import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const flags = readFileSync("src/lib/feature-flags.ts", "utf8");
const surfaces = readFileSync("src/lib/studio2-product-surfaces.ts", "utf8");
const rollout = readFileSync("src/integrations/v3/rollout-probe.server.ts", "utf8");
const shell = readFileSync("src/components/admin/AdminShell.tsx", "utf8");
const mobile = readFileSync("src/components/admin/OrganizerV3MobileChrome.tsx", "utf8");
const navigation = readFileSync("src/lib/v3-organizer-navigation.ts", "utf8");
const organizerLiquid = readFileSync("src/styles/v3-organizer-liquid-tabbar.css", "utf8");
const control = readFileSync("src/routes/_authenticated/admin/control.tsx", "utf8");
const migration = readFileSync(
  "supabase/migrations/20261014142000_v3_organizer_cutover.sql",
  "utf8",
);

describe("V3 Organizer reversible cutover", () => {
  it("persists an Organizer-only flag that starts disabled and registers the rollout surface", () => {
    expect(flags).toContain("'solaris_app_v3_organizer'");
    expect(surfaces).toContain("solaris_app_v3_organizer: {");
    expect(surfaces).toContain('audience: "organizer"');
    expect(surfaces).toContain('route: "/admin/operations"');
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
    // Only the installed runtime may render fixed V3/V6 navigation, and
    // a pending/failed server rollout may not silently select legacy.
    expect(shell).toContain("organizerModeResolved && platformResolved && isAppMode");
    expect(shell).toContain("? <OrganizerV3MobileChrome />");
    expect(shell).toContain(": <OrganizerV6MobileChrome />");
    expect(shell).toContain("organizerModeResolved && platformResolved && !isAppMode");
    expect(shell).toContain("? <OrganizerV3WebNavigation pathname={pathname} />");
    expect(shell).toContain(": <OrganizerLegacyWebNavigation pathname={pathname} />");
    expect(shell).toContain("!organizerV3.isLoading && !organizerV3.isError && organizerV3.data != null");
  });

  it("uses the canonical five Organizer areas on the shared V3 Liquid primitive", () => {
    for (const label of ["Overview", "Tasks", "Control", "Live", "More"]) {
      expect(mobile).toContain(`label: "${label}"`);
    }
    expect(mobile).toContain("V3LiquidTabBar");
    expect(mobile).not.toContain("OrganizerV6TabBar");
    expect(mobile).toContain("V3_ORGANIZER_TAB_ORDER.map");
    expect(mobile).toContain("getV3OrganizerTabDestination");
    expect(mobile).toContain("consumeV3OrganizerNavigationRestore");
    expect(mobile).toContain('data-organizer-v3-tabbar-mode={tabbarMode}');
    expect(organizerLiquid).toContain('data-organizer-v3-tabbar-mode="compact"');
    expect(organizerLiquid).toContain("@media (min-width: 900px)");
  });

  it("locks navigation, interaction generation and route memory to the selected edition context", () => {
    expect(mobile).toContain("const navigationScope = activeEdition?.id ?? null");
    expect(mobile).toContain("const navigationMemoryReady = navigationScope != null");
    expect(mobile).toContain('const navigationInteractionKey = navigationScope ?? "unscoped"');
    expect(mobile).toContain("key={navigationInteractionKey}");
    expect(mobile).toContain('data-organizer-v3-memory-ready={navigationMemoryReady ? "true" : "false"}');
    expect(mobile).toContain("navigationScope,");
    expect(navigation).toContain('return `${STORAGE_PREFIX}:${scopeToken(scopeKey)}`');
    expect(navigation).toContain('return `${RESTORE_PREFIX}:${scopeToken(scopeKey)}`');
    expect(shell).toContain("AdminEditionScopedWorkspace");
    expect(shell).toContain('data-organizer-edition-scope={scope}');
    expect(shell).toContain('key={`${scope}:${contextVersion}`}');
    expect(shell).toContain("data-organizer-context-version={contextVersion}");
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
