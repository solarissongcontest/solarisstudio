import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  MAINTENANCE_CONFIRMATION_API_PATH,
  MAINTENANCE_RETURN_DATE,
  TERRAOS3_ESTIMATED_LAUNCH_AT,
  isMaintenanceHodAppRouteAllowed,
  maintenanceHodAccessEnabled,
} from "./maintenance";
import { renderMaintenanceHodPortal } from "./maintenance-hod-portal";
import { renderMaintenancePage } from "./maintenance-page";

const editRoute = readFileSync("src/routes/confirmations/edit/$token.tsx", "utf8");
const confirmationShell = readFileSync("src/components/v3/V3ConfirmationRouteShell.tsx", "utf8");
const participationChrome = readFileSync("src/components/ParticipationServiceShell.tsx", "utf8");
const maintenanceEditor = readFileSync("src/components/MaintenanceConfirmationEditor.tsx", "utf8");
const maintenanceEditorClient = readFileSync("src/lib/maintenance-confirmation-editor.ts", "utf8");
const maintenanceEditorApi = readFileSync("src/routes/api/maintenance-confirmation.ts", "utf8");
const teaserPreview = readFileSync("src/components/v3/TerraOSTeaserPreview.tsx", "utf8");
const teaserPreviewRoute = readFileSync("src/routes/terraos-teaser-preview.tsx", "utf8");
const preferenceSync = readFileSync("src/components/app/AppExperiencePreferenceSync.tsx", "utf8");
const launchRestore = readFileSync("src/components/app/AppLaunchRestoreCoordinator.tsx", "utf8");
const serverEntry = readFileSync("src/server.ts", "utf8");

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

  it("opens exactly one maintenance POST transport without opening generic server functions", () => {
    expect(MAINTENANCE_CONFIRMATION_API_PATH).toBe("/api/maintenance-confirmation");
    expect(isMaintenanceHodAppRouteAllowed(MAINTENANCE_CONFIRMATION_API_PATH, "POST", true)).toBe(true);
    expect(isMaintenanceHodAppRouteAllowed(MAINTENANCE_CONFIRMATION_API_PATH, "GET", true)).toBe(false);
    expect(isMaintenanceHodAppRouteAllowed("/_serverFn/fake-id", "POST", true)).toBe(false);
    expect(isMaintenanceHodAppRouteAllowed("/api/flag", "POST", true)).toBe(false);
    expect(isMaintenanceHodAppRouteAllowed(MAINTENANCE_CONFIRMATION_API_PATH, "POST", false)).toBe(false);
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

  it("renders the edit-token route in an isolated maintenance shell without public app navigation", () => {
    expect(editRoute).toContain("maintenanceMode={GLOBAL_MAINTENANCE_MODE}");
    expect(editRoute).toContain('href="/"');
    expect(editRoute).toContain("resolveMaintenanceEditToken(token)");
    expect(editRoute).toContain("<MaintenanceConfirmationEditor");
    expect(confirmationShell).toContain('data-maintenance-confirmation-shell=""');
    expect(confirmationShell).toContain("Only this existing Confirmation editor is available");
    expect(participationChrome).toContain(
      'GLOBAL_MAINTENANCE_MODE && isMaintenanceHodAppRouteAllowed(pathname, "GET", true)',
    );
    expect(participationChrome).toContain("if (nested || maintenanceIsolated) return <>{children}</>;");
  });

  it("does not tell HODs that reopening an existing response requires reopening the round", () => {
    expect(editRoute).not.toContain("only if the round is reopened");
    expect(editRoute).toContain(
      "TSBC can reopen editing for this response without reopening the Confirmation round.",
    );
  });

  it("keeps the emergency editor on the exact canonical existing-response path", () => {
    expect(maintenanceEditorClient).toContain("MAINTENANCE_CONFIRMATION_API_PATH");
    expect(maintenanceEditorClient).toContain('action: "resolve"');
    expect(maintenanceEditorClient).toContain('action: "submit"');
    expect(maintenanceEditorClient).toContain('action: "reconcile"');
    expect(maintenanceEditorClient).toContain("deterministicOperationId");
    expect(maintenanceEditorClient).not.toContain("service_role");

    expect(maintenanceEditorApi).toContain('createFileRoute("/api/maintenance-confirmation")');
    expect(maintenanceEditorApi).toContain("if (!GLOBAL_MAINTENANCE_MODE)");
    expect(maintenanceEditorApi).toContain("if (!sameOrigin(request))");
    expect(maintenanceEditorApi).toContain("edit_token: z.string().trim().min(1).max(120)");
    expect(maintenanceEditorApi).toContain('rpc<ConfirmationSubmitResult>("v3_submit_confirmation"');
    expect(maintenanceEditorApi).toContain('rpc<ConfirmationSubmitResult>("v3_reconcile_confirmation"');
    expect(maintenanceEditorApi).toContain('"public_resolve_edit_token"');
    expect(maintenanceEditorApi).toContain("syncConfirmationSubmissionToSolarisInternal");
    expect(maintenanceEditorApi).not.toContain('rpc<ConfirmationSubmitResult>("submit_confirmation"');

    expect(maintenanceEditor).toContain('data-maintenance-confirmation-editor="true"');
    expect(maintenanceEditor).toContain("Save changes to this Confirmation");
    expect(maintenanceEditor).toContain("It cannot create a new Confirmation during maintenance.");
  });
});

describe("TerraOS 3 maintenance teaser contract", () => {
  const teaser = renderMaintenancePage(new Date("2026-10-18T13:00:00+03:00"));

  it("preserves the HOD insertion point while making TerraOS 3 the public hero", () => {
    expect(teaser).toContain("          <footer>");
    expect(teaser).toContain("TerraOS 3");
    expect(teaser).toContain("Solaris Studio, rebuilt.");
    expect(teaser).toContain("Estimated arrival");
    expect(teaser).toContain(MAINTENANCE_RETURN_DATE);
    expect(teaser).toContain(`data-terraos-launch-at="${TERRAOS3_ESTIMATED_LAUNCH_AT}"`);
    expect(teaser).toContain('role="timer"');
    expect(teaser).toContain('aria-live="off"');
    expect(teaser).not.toContain("Solaris Studio is temporarily unavailable");
    expect(teaser).not.toContain("Organizer tools");
  });

  it("keeps the existing Confirmation portal theme tokens available", () => {
    expect(teaser).toContain("--muted-soft:var(--soft)");
    expect(teaser).toContain("--primary:var(--blue)");
  });

  it("moves the injected Confirmation portal ahead of the product story in DOM order", () => {
    expect(teaser).toContain("var portal=document.querySelector('.hod-portal')");
    expect(teaser).toContain("var story=document.querySelector('.product-story')");
    expect(teaser).toContain("root.insertBefore(portal,story)");
  });

  it("renders the production V3 page components inside the teaser devices instead of hand-built miniatures", () => {
    expect(teaser).toContain('/terraos-teaser-preview?screen=home');
    expect(teaser).toContain('/terraos-teaser-preview?screen=explore');
    expect(teaser).toContain('/terraos-teaser-preview?screen=participate');
    expect(teaser).toContain('class="phone-preview"');
    expect(teaser).toContain('class="preview-page"');
    expect(teaser).not.toContain('class="orbit"');
    expect(teaser).not.toContain("Final results");

    expect(teaserPreview).toContain("V3HomeScreen");
    expect(teaserPreview).toContain("V3ExploreScreen");
    expect(teaserPreview).toContain("V3ParticipateScreen");
    expect(teaserPreview).toContain("V3FoundationShell");
    expect(teaserPreview).toContain("V3TopContext");
    expect(teaserPreview).toContain("V3BottomNavigation");
    expect(teaserPreview).not.toContain("TeaserBottomNav");
    expect(teaserPreview).not.toContain("useQuery");
    expect(teaserPreview).not.toContain("supabase");
    expect(teaserPreviewRoute).toContain('createFileRoute("/terraos-teaser-preview")');
    expect(preferenceSync).toContain('window.location.pathname === "/terraos-teaser-preview"');
    expect(launchRestore).toContain('pathname === "/terraos-teaser-preview"');
    expect(serverEntry).toContain('const TERRAOS_TEASER_PREVIEW_PATH = "/terraos-teaser-preview"');
    expect(serverEntry).toContain("isTerraOsTeaserPreviewRequest");
  });

  it("renders only the current reveal phase instead of giant future placeholders", () => {
    expect(teaser).toContain('data-terraos-teaser-phase="0"');
    expect(teaser).toContain('data-next-reveal="2026-10-19"');
    expect(teaser).toContain("More on 19.10");
    expect(teaser).not.toContain("data-locked-copy");
    expect(teaser).not.toContain('id="liquid-demo"');
    expect(teaser).not.toContain("More on 20.10");
    expect(teaser).not.toContain("More on 21.10");
    expect(teaser).not.toContain("fetch(");
    expect(teaser).not.toContain("XMLHttpRequest");
  });

  it("provides direct-manipulation navigation with accessibility fallbacks when the 19 October reveal is active", () => {
    const navigation = renderMaintenancePage(new Date("2026-10-19T00:01:00+03:00"));
    expect(navigation).toContain('id="liquid-demo"');
    expect(navigation).toContain('role="tablist"');
    expect(navigation).toContain('aria-selected="true"');
    expect(navigation).toContain("demo.addEventListener('pointerdown'");
    expect(navigation).toContain("demo.addEventListener('pointermove'");
    expect(navigation).toContain("demo.addEventListener('pointerup'");
    expect(navigation).toContain("velocity");
    expect(navigation).toContain("prefers-reduced-motion:reduce");
    expect(navigation).toContain("prefers-reduced-transparency:reduce");
  });

  it("keeps sparse launch copy instead of generic technology language", () => {
    const full = renderMaintenancePage(new Date("2026-10-21T00:01:00+03:00"));
    expect(full).toContain("Take a closer look.");
    expect(full).toContain("Five places.<br />One Solaris.");
    expect(full).toContain("Touch it.");
    expect(full).toContain("What’s next,<br />at a glance.");
    expect(full).toContain("Results, live.");
    expect(full).not.toMatch(/next-generation|revolutionary|reimagined|seamless|effortless/i);
  });
});

describe("maintenance HOD portal contract", () => {
  const html = renderMaintenanceHodPortal({
    supabaseUrl: "https://example.supabase.co",
    publishableKey: "sb_publishable_test",
  });

  it("keeps Confirmation as the operational section immediately after the hero", () => {
    expect(html).toContain(".hod-portal {\n    order: 2;");
    expect(html).toContain("Manage your current Confirmation");
    expect(html).toContain("This is the participant area that remains available during maintenance.");
  });

  it("makes the signed-out country-account action understandable", () => {
    expect(html).toContain("Manage your current Confirmation");
    expect(html).toContain("This is the participant area that remains available during maintenance.");
    expect(html).toContain("Sign in to Confirmation access");
    expect(html).toContain("Instagram username or recovery email");
    expect(html).toContain("Use the Instagram username linked to your country account, or its recovery email.");
    expect(html).toContain("Sign in to Confirmations");
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

  it("keeps status domains separate while explaining round-closed versus edit-open", () => {
    expect(html).toContain("Participation");
    expect(html).toContain("Confirmation");
    expect(html).toContain("Entry");
    expect(html).toContain("New Confirmations");
    expect(html).toContain("Existing submission editing");
    expect(html).toContain("Closed to new Confirmations");
    expect(html).toContain(
      "The submission round is closed to new Confirmations, but TSBC has reopened editing for this existing response.",
    );
    expect(html).toContain("View status details");
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
