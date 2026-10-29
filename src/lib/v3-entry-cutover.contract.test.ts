import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

const gate = () => source("src/components/v3/V3EntryRouteGate.tsx");
const screen = () => source("src/components/v3/V3EntryScreen.tsx");
const server = () => source("src/integrations/v3/entry-source.server.ts");
const route = () => source("src/routes/_authenticated/my-solaris/entry.tsx");
const rollout = () => source("src/integrations/v3/rollout-probe.server.ts");
const migration = () => source("supabase/migrations/20261014050000_v3_entry_cutover.sql");

describe("V3 participant Entry cutover", () => {
  it("keeps the cutover server-authoritative, authenticated and fail closed", () => {
    expect(route()).toContain("V3EntryRouteGate");
    expect(gate()).toContain("rollout.data?.entryEnabled === true");
    expect(gate()).toContain("Boolean(rollout.data?.userId)");
    expect(gate()).toContain("if (bundle.isError || !bundle.data) return <UnavailableEntrySurface />");
    expect(rollout()).toContain('p_key: "solaris_app_v3_entry"');
    expect(migration()).toContain("'solaris_app_v3_entry'");
    expect(migration()).toContain("false,");
  });

  it("does not mount the legacy archive-heavy Entry module for the V3 cohort", () => {
    expect(route()).toContain("legacy={<MySolarisEntryModule />}");
    expect(gate()).toContain("useV3EntryBundle(shouldLoadBundle");
    expect(gate()).toContain("if (bundle.isLoading) return <ResolvingEntrySurface />");
    expect(gate()).toContain("<V3EntryScreen");
  });

  it("preserves Organizer country inspection on the canonical legacy route", () => {
    expect(route()).toContain("organizerInspection={Boolean(search.country)}");
    expect(gate()).toContain("if (organizerInspection || !isAppMode) return <>{legacy}</>");
  });

  it("derives private participant state only from canonical server authorities", () => {
    const code = server();
    expect(code).toContain("getSolarisAccessTokenServer");
    expect(code).toContain('client.rpc("public_country_account_confirmation_access")');
    expect(code).toContain('client.rpc("studio2_hod_context"');
    expect(code).toContain('client.rpc("v3_confirmation_entry_versions"');
    expect(code).toContain("buildStudio2HodWorkspaceSnapshot(hodContext)");
    expect(code).not.toContain("useAllParticipants");
    expect(code).not.toContain('.from("participants")');
  });

  it("keeps V3 Entry presentation read-only over the existing mutation owner", () => {
    expect(screen()).toContain('to="/confirmations"');
    expect(screen()).toContain("Submission receipts remain owned by Confirmation");
    expect(screen()).not.toContain("supabase");
    expect(screen()).not.toContain("mutateAsync");
    expect(gate()).not.toContain("supabase");
  });

  it("keeps Entry independently reversible while requiring the canonical HOD foundation", () => {
    const surfaces = source("src/lib/studio2-product-surfaces.ts");
    expect(surfaces).toContain('key: "solaris_app_v3_entry"');
    expect(surfaces).toContain('dependsOn: ["solaris_app_v3", "hod_workspace_v2"]');
    expect(surfaces).not.toContain('dependsOn: ["solaris_app_v3", "solaris_app_v3_me"]');
  });
});
