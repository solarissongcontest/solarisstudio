import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  isMaintenanceHodAppRouteAllowed,
  maintenanceHodAccessEnabled,
} from "./maintenance";
import { renderMaintenanceHodPortal } from "./maintenance-hod-portal";
import { renderMaintenancePage } from "./maintenance-page";

const editRoute = readFileSync("src/routes/confirmations/edit/$token.tsx", "utf8");
const confirmationShell = readFileSync("src/components/v3/V3ConfirmationRouteShell.tsx", "utf8");

describe("maintenance HOD access flag", () => {
  it("fails closed unless explicitly enabled", () => {
    expect(maintenanceHodAccessEnabled(undefined)).toBe(false);
    expect(maintenanceHodAccessEnabled("")).toBe(false);
    expect(maintenanceHodAccessEnabled("false")).toBe(false);
    expect(maintenanceHodAccessEnabled("1")).toBe(false);
    expect(maintenanceHodAccessEnabled(" true ")).toBe(true);
    expect(maintenanceHodAccessEnabled("TRUE")).toBe(true);
  });
});

describe("maintenance HOD route isolation", () => {
  const allowedGets = [
    "/confirmations/edit/token-value",
    "/confirmations/edit/token-value/",
    "/confirmations/recover",
    "/confirmations/recover/",
    "/auth/reset",
    "/auth/reset/",
  ];

  it.each(allowedGets)("allows only the required GET/HEAD app route: %s", (pathname) => {
    expect(isMaintenanceHodAppRouteAllowed(pathname, "GET", true)).toBe(true);
    expect(isMaintenanceHodAppRouteAllowed(pathname, "HEAD", true)).toBe(true);
    expect(isMaintenanceHodAppRouteAllowed(pathname, "POST", true)).toBe(false);
  });

  it.each([
    "/",
    "/auth",
    "/auth/",
    "/confirmations",
    "/confirmations/admin",
    "/confirmations/admin/rounds",
    "/participate",
    "/explore",
    "/results",
    "/me",
    "/stories",
    "/wiki",
    "/archive",
    "/jury",
    "/televoting",
    "/admin",
    "/admin/operations",
  ])("keeps unrelated route maintenance-blocked: %s", (pathname) => {
    expect(isMaintenanceHodAppRouteAllowed(pathname, "GET", true)).toBe(false);
  });

  it("disables every HOD app exception when the rollback flag is off", () => {
    for (const pathname of allowedGets) {
      expect(isMaintenanceHodAppRouteAllowed(pathname, "GET", false)).toBe(false);
    }
  });

  it("renders the allowed edit-token route in an isolated maintenance shell", () => {
    expect(editRoute).toContain("maintenanceMode={GLOBAL_MAINTENANCE_MODE}");
    expect(editRoute).toContain('href="/"');
    expect(confirmationShell).toContain('data-maintenance-confirmation-shell=""');
    expect(confirmationShell).toContain("Only this existing Confirmation editor is available");
    expect(confirmationShell).toContain("<a");
  });

  it("does not tell HODs that reopening an existing response requires reopening the round", () => {
    expect(editRoute).not.toContain("only if the round is reopened");
    expect(editRoute).toContain(
      "TSBC can reopen editing for this response without reopening the Confirmation round.",
    );
  });
});

describe("maintenance HOD portal contract", () => {
  const html = renderMaintenanceHodPortal({
    supabaseUrl: "https://example.supabase.co",
    publishableKey: "sb_publishable_test",
  });

  it("preserves the maintenance page insertion point instead of replacing the page", () => {
    expect(renderMaintenancePage()).toContain("          <footer>");
    expect(renderMaintenancePage()).toContain("Solaris Studio is temporarily unavailable");
  });

  it("reuses the existing Solaris country auth/session system", () => {
    expect(html).toContain('client.functions.invoke("country-auth"');
    expect(html).toContain('action: "signin"');
    expect(html).toContain('action: "recover"');
    expect(html).toContain("client.auth.getSession()");
    expect(html).toContain("client.auth.getUser()");
    expect(html).toContain("client.auth.setSession");
    expect(html).toContain("client.auth.signOut()");
  });

  it("uses only the participant-safe dashboard projection and canonical edit token", () => {
    expect(html).toContain('client.rpc("public_country_account_confirmation_dashboard")');
    expect(html).toContain('client.rpc("public_create_country_account_edit_token"');
    expect(html).not.toContain("admin_update_confirmation_controls");
    expect(html).not.toContain("studio2_country_cockpit");
    expect(html).not.toContain("service_role");
  });

  it("keeps status domains separate and focuses requested corrections", () => {
    expect(html).toContain("Participation");
    expect(html).toContain("Confirmation");
    expect(html).toContain("Entry");
    expect(html).toContain("Editing");
    expect(html).toContain("#entry-section-review");
  });

  it("does not install an unbounded production polling loop", () => {
    expect(html).not.toContain("setInterval(");
    expect(html).toContain("[30000, 90000]");
    expect(html).toContain('window.addEventListener("focus"');
    expect(html).toContain('document.addEventListener("visibilitychange"');
  });

  it("escapes injected runtime configuration before embedding it into module code", () => {
    const hostile = renderMaintenanceHodPortal({
      supabaseUrl: "https://example.test/</script><script>alert(1)</script>",
      publishableKey: "<unsafe>",
    });
    expect(hostile).not.toContain("</script><script>alert(1)</script>");
    expect(hostile).toContain("\\u003c/script>");
  });
});
