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
const maintenanceCss = readFileSync("public/assets/terraos-maintenance.css", "utf8");
const maintenanceMotion = readFileSync("public/assets/terraos-maintenance.js", "utf8");

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
    "/", "/auth", "/confirmations", "/confirmations/admin", "/confirmations/admin/rounds",
    "/participate", "/explore", "/results", "/me", "/stories", "/wiki", "/archive",
    "/jury", "/televoting", "/admin", "/admin/operations",
  ])("keeps unrelated route maintenance-blocked: %s", (pathname) => {
    expect(isMaintenanceHodAppRouteAllowed(pathname, "GET", true)).toBe(false);
  });

  it("disables every HOD app exception when the rollback flag is off", () => {
    for (const pathname of allowedGets) expect(isMaintenanceHodAppRouteAllowed(pathname, "GET", false)).toBe(false);
  });

  it("renders the edit-token route in an isolated maintenance shell", () => {
    expect(editRoute).toContain("maintenanceMode={GLOBAL_MAINTENANCE_MODE}");
    expect(editRoute).toContain("resolveMaintenanceEditToken(token)");
    expect(editRoute).toContain("<MaintenanceConfirmationEditor");
    expect(confirmationShell).toContain('data-maintenance-confirmation-shell=""');
    expect(confirmationShell).toContain("Only this existing Confirmation editor is available");
    expect(participationChrome).toContain('GLOBAL_MAINTENANCE_MODE && isMaintenanceHodAppRouteAllowed(pathname, "GET", true)');
    expect(participationChrome).toContain("if (nested || maintenanceIsolated) return <>{children}</>;");
  });

  it("keeps the emergency editor on the canonical existing-response contract", () => {
    expect(maintenanceEditorClient).toContain("MAINTENANCE_CONFIRMATION_API_PATH");
    expect(maintenanceEditorClient).toContain('action: "resolve"');
    expect(maintenanceEditorClient).toContain('action: "submit"');
    expect(maintenanceEditorClient).toContain('action: "reconcile"');
    expect(maintenanceEditorClient).toContain("deterministicOperationId");
    expect(maintenanceEditorClient).not.toContain("service_role");
    expect(maintenanceEditorApi).toContain('createFileRoute("/api/maintenance-confirmation")');
    expect(maintenanceEditorApi).toContain("if (!GLOBAL_MAINTENANCE_MODE)");
    expect(maintenanceEditorApi).toContain("if (!sameOrigin(request))");
    expect(maintenanceEditorApi).toContain('rpc<ConfirmationSubmitResult>("v3_submit_confirmation"');
    expect(maintenanceEditorApi).toContain('rpc<ConfirmationSubmitResult>("v3_reconcile_confirmation"');
    expect(maintenanceEditorApi).toContain('"public_resolve_edit_token"');
    expect(maintenanceEditorApi).not.toContain('rpc<ConfirmationSubmitResult>("submit_confirmation"');
    expect(maintenanceEditor).toContain('data-maintenance-confirmation-editor="true"');
    expect(maintenanceEditor).toContain("It cannot create a new Confirmation during maintenance.");
  });
});

describe("TerraOS 3 maintenance page + HOD integration", () => {
  const teaser = renderMaintenancePage(new Date("2026-10-24T13:00:00+03:00"));

  it("preserves a formatting-independent HOD insertion point", () => {
    expect(teaser).toContain("<footer>");
    expect(serverEntry).toContain('html = html.replace("<footer>"');
    expect(serverEntry).toContain("isolateMaintenanceHodPortalMarkup");
    expect(teaser).toContain("TerraOS 3");
    expect(teaser).toContain("Solaris, reimagined.");
    expect(teaser).toContain("Estimated arrival");
    expect(teaser).toContain(MAINTENANCE_RETURN_DATE);
    expect(teaser).toContain(`data-terraos-launch-at="${TERRAOS3_ESTIMATED_LAUNCH_AT}"`);
  });

  it("keeps Confirmation portal theme tokens in the static visual system", () => {
    expect(maintenanceCss).toContain("--muted-soft:");
    expect(maintenanceCss).toContain("--primary:");
  });

  it("moves the injected portal into the dedicated Confirmation chapter through the static runtime", () => {
    expect(teaser).toContain('data-confirmation-host');
    expect(teaser).toContain('id="confirmation-access"');
    expect(teaser).toMatch(/<script src="\/assets\/terraos-maintenance\.js\?v=[^"\s]+"><\/script>/);
    expect(maintenanceMotion).toContain("const portal = document.querySelector('.hod-portal')");
    expect(maintenanceMotion).toContain("const confirmationHost = document.querySelector('[data-confirmation-host]')");
    expect(maintenanceMotion).toContain("confirmationHost.appendChild(portal)");
  });

  it("renders production V3 components in fixture-safe teaser surfaces", () => {
    for (const screen of ["home", "explore", "participate", "results", "me"]) {
      expect(teaser).toContain(`/terraos-teaser-preview?screen=${screen}&chrome=content`);
    }
    expect(teaser).toContain('class="terra-preview-frame"');
    expect(teaserPreview).toContain("V3HomeScreen");
    expect(teaserPreview).toContain("V3ExploreScreen");
    expect(teaserPreview).toContain("V3ParticipateScreen");
    expect(teaserPreview).toContain("V3FoundationShell");
    expect(teaserPreview).toContain("V3BottomNavigation");
    expect(teaserPreview).not.toContain("useQuery");
    expect(teaserPreview).not.toContain("supabase");
    expect(teaserPreviewRoute).toContain('createFileRoute("/terraos-teaser-preview")');
    expect(preferenceSync).toContain('window.location.pathname === "/terraos-teaser-preview"');
    expect(launchRestore).toContain('pathname === "/terraos-teaser-preview"');
  });

  it("ships the complete mature story without historical teaser gates", () => {
    for (const fragment of [
      "A new generation of Solaris.", "Everything<br />in its place.", "What matters,<br />now.",
      "Know exactly<br />what needs you.", "More Solaris.<br />Less searching.", "See what<br />happened.",
      "Your<br />Solaris.", "Take a closer look.", "Built for<br />contest night.",
      "Your delegation<br />keeps moving.", "is taking shape.",
    ]) expect(teaser).toContain(fragment);
    expect(teaser).not.toContain("data-terraos-teaser-phase");
    expect(teaser).not.toContain("data-next-reveal");
    expect(teaser).not.toContain("More on 19.10");
    expect(maintenanceMotion).not.toContain("fetch(");
    expect(maintenanceMotion).not.toContain("XMLHttpRequest");
  });

  it("keeps horizontal discovery keyboard accessible without vertical scroll hijacking", () => {
    expect(teaser).toContain('data-gallery-prev');
    expect(teaser).toContain('data-gallery-next');
    expect(maintenanceMotion).toContain("track.addEventListener('keydown'");
    expect(maintenanceCss).toContain("scroll-snap-type:x mandatory");
    expect(maintenanceCss).toContain("prefers-reduced-motion:reduce");
    expect(maintenanceCss).toContain("prefers-reduced-transparency:reduce");
  });
});

describe("maintenance HOD portal contract", () => {
  const html = renderMaintenanceHodPortal({
    supabaseUrl: "https://example.supabase.co",
    publishableKey: "sb_publishable_test",
  });

  it("keeps the participant-facing Confirmation workflow understandable", () => {
    expect(html).toContain("Manage your current Confirmation");
    expect(html).toContain("Sign in to Confirmation access");
    expect(html).toContain("Instagram username or recovery email");
    expect(html).toContain("Sign in to Confirmations");
  });

  it("reuses existing country auth and participant-safe projections only", () => {
    expect(html).toContain('client.functions.invoke("country-auth"');
    expect(html).toContain('action: "signin"');
    expect(html).toContain('action: "recover"');
    expect(html).toContain("client.auth.getSession()");
    expect(html).toContain('client.rpc("public_country_account_confirmation_dashboard")');
    expect(html).toContain('client.rpc("public_create_country_account_edit_token"');
    expect(html).not.toContain("admin_update_confirmation_controls");
    expect(html).not.toContain("service_role");
  });

  it("does not install unbounded production polling", () => {
    expect(html).not.toContain("setInterval(");
    expect(html).toContain("[30000, 90000]");
  });

  it("escapes injected runtime configuration", () => {
    const hostile = renderMaintenanceHodPortal({
      supabaseUrl: "https://example.test/</script><script>alert(1)</script>",
      publishableKey: "<unsafe>",
    });
    expect(hostile).not.toContain("</script><script>alert(1)</script>");
    expect(hostile).toContain("\\u003c/script>");
  });
});
