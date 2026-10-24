import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const server = readFileSync("src/server.ts", "utf8");
const start = readFileSync("src/start.ts", "utf8");
const page = readFileSync("src/lib/maintenance-page.ts", "utf8");
const hodPortal = readFileSync("src/lib/maintenance-hod-portal.ts", "utf8");
const readiness = readFileSync("src/lib/terraos-release-readiness.ts", "utf8");
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
    expect(server).not.toContain("x-solaris-maintenance-bypass");
    expect(server).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(envExample).toContain("MAINTENANCE_ADMIN_SECRET=");
    expect(envExample).not.toContain("VITE_MAINTENANCE_ADMIN_SECRET");
  });

  it("limits public Supabase runtime configuration to the separately flagged HOD portal", () => {
    expect(server).toContain("function maintenanceHodRuntime(env: unknown)");
    expect(server).toContain("MAINTENANCE_HOD_ACCESS");
    expect(server).toContain("SUPABASE_PUBLISHABLE_KEY");
    expect(server).toContain("renderMaintenanceHodPortal");
    expect(server).toContain('if (request.method === "GET" && includeHodPortal)');
    expect(server).not.toContain("SUPABASE_SECRET_KEY");
    expect(server).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
  });

  it("opens maintenance change requests on an editable entry step instead of the review-only summary", () => {
    expect(confirmationEditRoute).toContain('GLOBAL_MAINTENANCE_MODE && entryFocus?.section === "review"');
    expect(confirmationEditRoute).toContain("const editorInitialStep = maintenanceReviewFocus ? 3 : entryFocus?.step ?? undefined;");
    expect(confirmationEditRoute).toContain('data-maintenance-entry-edit-focus="entry"');
    expect(confirmationEditRoute).toContain("initialStep={editorInitialStep}");
  });

  it("keeps the E2E bypass impossible on a production hostname", () => {
    expect(server).toContain('url.hostname === "127.0.0.1" || url.hostname === "localhost"');
    expect(server).toContain('readCookie(request, E2E_MAINTENANCE_BYPASS_COOKIE) === "1"');
    expect(server).not.toContain('process.env.SOLARIS_E2E_BYPASS_MAINTENANCE !== "1"');
  });

  it("renders the expanded TerraOS 3 product story with Classica Crastao branding", () => {
    expect(page).toContain('font-family:"Classica Crastao"');
    expect(page).toContain('font-family:"Gotham"');
    expect(page).toContain("<title>TerraOS 3 — Solaris Studio</title>");
    expect(page).toContain('<h1 id="maintenance-title" class="terra-wordmark">TerraOS 3</h1>');
    expect(page).toContain('.terra-wordmark,.product-name span,#maintenance-title,#finale-title');
    expect(page).toContain("Solaris, reimagined.");
    expect(page).toContain("A new generation of Solaris.");
    expect(page).toContain("Everything<br />in its place.");
    expect(page).toContain("What matters, now.");
    expect(page).toContain("Know exactly what needs you.");
    expect(page).toContain("More Solaris. Less searching.");
    expect(page).toContain("See what happened.");
    expect(page).toContain("Your Solaris.");
    expect(page).toContain("Take a closer look.");
    expect(page).toContain("Built for<br />contest night.");
    expect(page).toContain("Your delegation<br />keeps moving.");
    expect(page).toContain("TerraOS 3 is taking shape.");
    expect(page).toContain("Built for what happens next.");
    expect(page).toContain("/solaris-background.webp");
    expect(page).toContain("/solaris-studio-social.jpg");
    expect(page).toContain("/terraos-maintenance/blue-motion.svg");
    expect(page).toContain("/terraos-maintenance/live-stage.svg");
    expect(page).toContain("/terraos-maintenance/purple-tunnel.svg");
    expect(page).toContain("@media (prefers-reduced-motion:reduce)");
    expect(page).toContain("@media (prefers-reduced-transparency:reduce)");
    expect(page).not.toContain('class="service-grid"');
    expect(page).not.toContain("Most services paused");
  });

  it("gives the five V3 destinations standalone feature chapters before the recap gallery", () => {
    expect(page).toContain('id="solaris-now"');
    expect(page).toContain('id="participate-feature"');
    expect(page).toContain('id="explore-feature"');
    expect(page).toContain('id="results-feature"');
    expect(page).toContain('id="me-feature"');
    expect(page).toContain("function featureChapter");
    expect(page).toContain('screen:"home"');
    expect(page).toContain('screen:"participate"');
    expect(page).toContain('screen:"explore"');
    expect(page).toContain('screen:"results"');
    expect(page).toContain('screen:"me"');
  });

  it("uses mobile-first containment instead of desktop floating overlays on phones", () => {
    expect(page).toContain("@media (max-width:680px)");
    expect(page).toContain(".hero-device-left,.hero-device-right { display:none; }");
    expect(page).toContain(".immersive-status,.immersive-liquid { position:static!important; transform:none!important;");
    expect(page).toContain(".live-copy { position:static; }");
    expect(page).toContain("overflow-x:clip");
    expect(page).toContain("window.innerWidth<681");
  });

  it("derives a sanitized public readiness percentage from canonical V3 state", () => {
    expect(page).toContain("TerraOS 3 readiness");
    expect(page).toContain("Based on tracked release criteria, not time elapsed.");
    expect(page).toContain("Progress reflects tracked release readiness rather than time remaining.");
    expect(page).toContain("getTerraOsPublicReadiness");
    expect(readiness).toContain("V3_PUBLIC_CAPABILITIES");
    expect(readiness).toContain("V3_ORGANIZER_CAPABILITY_REGISTRY");
    expect(readiness).toContain("V3_SYSTEM_DOMAIN_REGISTRY");
    expect(readiness).toContain("V3_DOMAIN_CONSEQUENCE_REGISTRY");
    expect(readiness).toContain("Math.min(98");
    expect(page).not.toContain("deployment");
    expect(page).not.toContain("mainSha");
    expect(page).not.toContain("PR #");
  });

  it("uses truthful estimated-arrival copy while keeping Confirmation immediately reachable", () => {
    expect(config).toContain('MAINTENANCE_RETURN_DATE = "25 October 2026"');
    expect(config).toContain('TERRAOS3_ESTIMATED_LAUNCH_AT = "2026-10-25T20:00:00+02:00"');
    expect(page).toContain("Estimated arrival");
    expect(page).toContain('href="#confirmation-access"');
    expect(page).toContain("TerraOS 3 is being prepared.");
    expect(page).toContain("confirmationHost.appendChild(portal)");
    expect(hodPortal).toContain("Manage your current Confirmation");
    expect(page).toContain("Terra Solaris Broadcasting Coalition");
  });

  it("blocks writes while allowing only the maintenance artwork used by the experience", () => {
    expect(server).toContain('request.method === "GET" || request.method === "HEAD"');
    expect(server).toContain('"/tsbc-maintenance-mark.svg"');
    expect(server).toContain('"/solaris-studio-mark.png"');
    expect(server).toContain('"/solaris-background.webp"');
    expect(server).toContain('"/solaris-studio-social.jpg"');
    expect(server).toContain('"/terraos-maintenance/blue-motion.svg"');
    expect(server).toContain('"/terraos-maintenance/live-stage.svg"');
    expect(server).toContain('"/terraos-maintenance/purple-tunnel.svg"');
    expect(server).toContain('"x-robots-tag": "noindex, nofollow"');
    expect(page).toContain('<meta name="robots" content="noindex, nofollow" />');
  });
});
