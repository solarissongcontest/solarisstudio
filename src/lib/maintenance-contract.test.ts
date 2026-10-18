import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const server = readFileSync("src/server.ts", "utf8");
const start = readFileSync("src/start.ts", "utf8");
const page = readFileSync("src/lib/maintenance-page.ts", "utf8");
const hodPortal = readFileSync("src/lib/maintenance-hod-portal.ts", "utf8");
const config = readFileSync("src/lib/maintenance.ts", "utf8");
const envExample = readFileSync(".env.example", "utf8");
const confirmationEditRoute = readFileSync("src/routes/confirmations/edit/$token.tsx", "utf8");

describe("emergency global maintenance mode", () => {
  it("is explicitly enabled and runs at the Worker entry before normal request middleware", () => {
    expect(config).toContain("GLOBAL_MAINTENANCE_MODE = true");
    expect(server).toContain('return maintenanceResponse(request, env, url.pathname === "/")');
    expect(server).toContain("status: 503");
    expect(start).toContain("requestMiddleware: [errorMiddleware, csrfMiddleware]");
    expect(start).not.toContain("maintenanceMiddleware");
  });

  it("keeps a server-only maintenance bypass for administrators without coupling it to HOD auth", () => {
    expect(server).toContain("MAINTENANCE_ADMIN_SECRET");
    expect(server).toContain('const MAINTENANCE_ADMIN_PATH = "/__maintenance-admin"');
    expect(server).toContain("await hasValidMaintenanceBypass(request, secret)");
    expect(server).toContain("HttpOnly; Secure; SameSite=Strict");
    expect(server).toContain("It does not grant Solaris account or Organizer permissions.");
    expect(server).toContain("function maintenanceSecret(env: unknown)");
    expect(server).toContain(
      "async function handleMaintenanceAdminRequest(request: Request, secret: string)",
    );
    expect(server).not.toContain("x-solaris-maintenance-bypass");
    expect(server).not.toContain("maintenanceDatabaseIsReadOnly");
    expect(server).not.toContain("solaris_maintenance_read_only_probe");
    expect(server).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(server).not.toContain("service_role");
    expect(envExample).toContain("MAINTENANCE_ADMIN_SECRET=");
    expect(envExample).not.toContain("VITE_MAINTENANCE_ADMIN_SECRET");
  });

  it("limits public Supabase runtime configuration to the separately flagged HOD portal", () => {
    expect(server).toContain("function maintenanceHodRuntime(env: unknown)");
    expect(server).toContain("MAINTENANCE_HOD_ACCESS");
    expect(server).toContain("SUPABASE_PUBLISHABLE_KEY");
    expect(server).toContain("renderMaintenanceHodPortal");
    expect(server).toContain('if (request.method === "GET" && includeHodPortal)');
    expect(server).toContain("if (hod.enabled && hod.supabaseUrl && hod.publishableKey)");
    expect(server).not.toContain("SUPABASE_SECRET_KEY");
    expect(server).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
  });

  it("opens maintenance change requests on an editable entry step instead of the review-only summary", () => {
    expect(confirmationEditRoute).toContain(
      'GLOBAL_MAINTENANCE_MODE && entryFocus?.section === "review"',
    );
    expect(confirmationEditRoute).toContain(
      "const editorInitialStep = maintenanceReviewFocus ? 3 : entryFocus?.step ?? undefined;",
    );
    expect(confirmationEditRoute).toContain('data-maintenance-entry-edit-focus="entry"');
    expect(confirmationEditRoute).toContain("initialStep={editorInitialStep}");
  });

  it("keeps the E2E bypass impossible on a production hostname", () => {
    expect(server).toContain('url.hostname === "127.0.0.1" || url.hostname === "localhost"');
    expect(server).toContain('readCookie(request, E2E_MAINTENANCE_BYPASS_COOKIE) === "1"');
    expect(server).not.toContain('process.env.SOLARIS_E2E_BYPASS_MAINTENANCE !== "1"');
  });

  it("renders the TerraOS 3 launch teaser instead of an outage incident report", () => {
    expect(page).toContain('font-family:"Classica Crastao"');
    expect(page).toContain('font-family:"Gotham"');
    expect(page).toContain("<title>TerraOS 3 — Solaris Studio</title>");
    expect(page).toContain('<h1 id="maintenance-title">TerraOS 3</h1>');
    expect(page).toContain("Solaris Studio, rebuilt.");
    expect(page).toContain("Estimated arrival");
    expect(page).toContain("Take a closer look.");
    expect(page).toContain("Five places.<br />One Solaris.");
    expect(page).toContain("TERRAOS_NAVIGATION_REVEAL_AT");
    expect(page).toContain("TERRAOS_PARTICIPATION_REVEAL_AT");
    expect(page).toContain("TERRAOS_RESULTS_REVEAL_AT");
    expect(page).toContain('data-next-reveal="2026-10-19"');
    expect(page).toContain("@media (prefers-reduced-motion:no-preference)");
    expect(page).toContain("@media (prefers-reduced-motion:reduce)");
    expect(page).toContain("@media (prefers-reduced-transparency:reduce)");
    expect(page).not.toContain('class="orbit"');
    expect(page).not.toContain("data-locked-copy");
    expect(page).not.toContain('class="service-grid"');
    expect(page).not.toContain("Most services paused");
    expect(page).not.toContain("What does maintenance affect?");
    expect(page).not.toContain('class="recovery-visual"');
    expect(page).not.toContain('class="recovery-stage"');
    expect(page).not.toContain("Awaiting restoration");
  });

  it("uses truthful launch copy while keeping HOD Confirmation availability explicit", () => {
    expect(config).toContain('MAINTENANCE_RETURN_DATE = "23 October 2026"');
    expect(config).toContain('MAINTENANCE_LAST_UPDATED = "18 October 2026"');
    expect(config).toContain(
      'TERRAOS3_ESTIMATED_LAUNCH_AT = "2026-10-23T20:00:00+03:00"',
    );
    expect(config).toContain("Public estimate only. The maintenance/release gate remains authoritative.");
    expect(page).toContain("Maintenance in progress");
    expect(page).toContain("Estimated arrival");
    expect(page).toContain("root.insertBefore(portal,story)");
    expect(hodPortal).toContain("Manage your current Confirmation");
    expect(hodPortal).toContain(
      "This is the participant area that remains available during maintenance.",
    );
    expect(hodPortal).toContain(
      "Sign in with the same country account you normally use for Solaris Studio.",
    );
    expect(page).not.toContain("A database service error is currently preventing Solaris Studio");
    expect(page).not.toContain("All Solaris Studio services are temporarily unavailable.");
    expect(page).not.toContain("Confirmations, Televoting and Organizer tools");
    expect(page).not.toContain("Organizer tools");
    expect(page).toContain("Terra Solaris Broadcasting Coalition");
  });

  it("blocks writes while still allowing the maintenance branding assets", () => {
    expect(server).toContain('request.method === "GET" || request.method === "HEAD"');
    expect(server).toContain('"solaris_studio_maintenance"');
    expect(server).toContain('expected_return: "coming_soon"');
    expect(server).toContain('"/tsbc-maintenance-mark.svg"');
    expect(server).toContain('"/solaris-studio-mark.png"');
    expect(server).toContain('"/solaris-background.webp"');
    expect(server).toContain('"/sw.js"');
    expect(server).toContain('"/offline.html"');
    expect(server).not.toContain('"retry-after": "Sat, 10 Oct 2026 00:00:00 GMT"');
    expect(server).not.toContain('expected_return: "2026-10-10"');
    expect(server).toContain('"x-robots-tag": "noindex, nofollow"');
    expect(page).toContain('<meta name="robots" content="noindex, nofollow" />');
  });
});
