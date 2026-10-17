import { describe, expect, it } from "vitest";

import {
  isMaintenanceHodAllowedAppPath,
  maintenanceHodAccessEnabled,
  maintenanceHodConfig,
  renderMaintenanceHodPortal,
} from "./maintenance-hod";

describe("maintenance HOD feature flag", () => {
  it("defaults off and requires the dedicated rollback switch", () => {
    expect(maintenanceHodAccessEnabled({ MAINTENANCE_HOD_ACCESS: "false" })).toBe(false);
    expect(maintenanceHodAccessEnabled({})).toBe(false);
    expect(maintenanceHodAccessEnabled({ MAINTENANCE_HOD_ACCESS: "true" })).toBe(true);
  });

  it("uses browser-safe Supabase configuration only", () => {
    expect(
      maintenanceHodConfig({
        MAINTENANCE_HOD_ACCESS: "true",
        SUPABASE_URL: "https://example.supabase.co/",
        SUPABASE_PUBLISHABLE_KEY: "sb_publishable_public",
      }),
    ).toEqual({
      supabaseUrl: "https://example.supabase.co",
      supabasePublishableKey: "sb_publishable_public",
    });

    expect(
      maintenanceHodConfig({
        MAINTENANCE_HOD_ACCESS: "true",
        SUPABASE_URL: "https://example.supabase.co",
        SUPABASE_PUBLISHABLE_KEY: "sb_secret_never_browser",
      }),
    ).toBeNull();
  });
});

describe("maintenance HOD app-route isolation", () => {
  it("allows only password reset, Confirmation recovery and tokenized existing-response editing", () => {
    expect(isMaintenanceHodAllowedAppPath("/auth/reset")).toBe(true);
    expect(isMaintenanceHodAllowedAppPath("/confirmations/recover")).toBe(true);
    expect(isMaintenanceHodAllowedAppPath("/confirmations/edit/abc123")).toBe(true);
    expect(isMaintenanceHodAllowedAppPath("/confirmations/edit/abc123/")).toBe(true);
  });

  it.each([
    "/",
    "/confirmations",
    "/confirmations/admin",
    "/confirmations/admin/rounds",
    "/explore",
    "/results",
    "/participate",
    "/me",
    "/stories",
    "/wiki",
    "/archive",
    "/jury",
    "/televoting",
    "/admin",
    "/admin/countries",
    "/admin/operations",
  ])("keeps %s behind global maintenance", (pathname) => {
    expect(isMaintenanceHodAllowedAppPath(pathname)).toBe(false);
  });

  it("does not turn the edit prefix into a broad route bypass", () => {
    expect(isMaintenanceHodAllowedAppPath("/confirmations/edit")).toBe(false);
    expect(isMaintenanceHodAllowedAppPath("/confirmations/edit/a/extra")).toBe(false);
    expect(isMaintenanceHodAllowedAppPath("/confirmations/admin/edit/token")).toBe(false);
  });
});

describe("standalone maintenance HOD portal", () => {
  const base = "<!doctype html><html><body><main><h1>Maintenance</h1></main></body></html>";
  const rendered = renderMaintenanceHodPortal(base, {
    supabaseUrl: "https://example.supabase.co",
    supabasePublishableKey: "sb_publishable_public",
  });

  it("keeps the existing maintenance document and appends a narrow HOD card", () => {
    expect(rendered).toContain("<h1>Maintenance</h1>");
    expect(rendered).toContain("Head of Delegation access");
    expect(rendered).toContain("Manage your current Confirmation");
    expect(rendered).toContain("Confirmation only");
  });

  it("reuses persistent Supabase sessions and the existing country-auth contract", () => {
    expect(rendered).toContain("persistSession: true");
    expect(rendered).toContain("autoRefreshToken: true");
    expect(rendered).toContain("supabase.auth.getSession()");
    expect(rendered).toContain("supabase.auth.getUser()");
    expect(rendered).toContain('supabase.functions.invoke("country-auth"');
    expect(rendered).toContain('action: "signin"');
    expect(rendered).toContain('action: "recover"');
  });

  it("loads only the participant-safe portal projection and server-authoritative edit token", () => {
    expect(rendered).toContain('supabase.rpc("public_country_account_confirmation_portal")');
    expect(rendered).toContain('supabase.rpc("public_create_country_account_edit_token"');
    expect(rendered).toContain('"/confirmations/edit/" + encodeURIComponent(data.token)');
    expect(rendered).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(rendered).not.toContain("admin_notes");
  });

  it("separates participation, Confirmation, entry, round and editing status", () => {
    expect(rendered).toContain('addStatus("Participation"');
    expect(rendered).toContain('addStatus("Confirmation"');
    expect(rendered).toContain('addStatus("Entry"');
    expect(rendered).toContain('addStatus("Round"');
    expect(rendered).toContain('addStatus("Editing"');
    expect(rendered).toContain("Everything accepted");
    expect(rendered).toContain("Changes requested");
    expect(rendered).toContain("Awaiting review");
  });

  it("clears delegation UI immediately on sign out", () => {
    const clear = rendered.indexOf("currentPortal = null;");
    const signedOut = rendered.indexOf('showOnly("signedOut")', clear);
    const authSignOut = rendered.indexOf('supabase.auth.signOut({ scope: "local" })', signedOut);
    expect(clear).toBeGreaterThan(-1);
    expect(signedOut).toBeGreaterThan(clear);
    expect(authSignOut).toBeGreaterThan(signedOut);
  });
});
