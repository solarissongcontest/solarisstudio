import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { renderMaintenancePage } from "./maintenance-page";

const server = readFileSync("src/server.ts", "utf8");
const start = readFileSync("src/start.ts", "utf8");
const page = readFileSync("src/lib/maintenance-page.ts", "utf8");
const css = readFileSync("public/assets/terraos-maintenance.css", "utf8");
const motion = readFileSync("public/assets/terraos-maintenance.js", "utf8");
const hodPortal = readFileSync("src/lib/maintenance-hod-portal.ts", "utf8");
const readiness = readFileSync("src/lib/terraos-release-readiness.ts", "utf8");
const config = readFileSync("src/lib/maintenance.ts", "utf8");
const envExample = readFileSync(".env.example", "utf8");
const confirmationEditRoute = readFileSync("src/routes/confirmations/edit/$token.tsx", "utf8");
const rendered = renderMaintenancePage(new Date("2026-10-24T13:00:00+03:00"));

describe("emergency global maintenance mode", () => {
  it("is explicitly enabled and runs at the Worker entry before normal request middleware", () => {
    expect(config).toContain("GLOBAL_MAINTENANCE_MODE = true");
    expect(server).toContain('return maintenanceResponse(request, env, url.pathname === "/")');
    expect(server).toContain("status: 503");
    expect(start).toContain("requestMiddleware: [errorMiddleware, csrfMiddleware]");
    expect(start).not.toContain("maintenanceMiddleware");
  });

  it("keeps the server-only admin bypass isolated from participant auth", () => {
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

  it("limits public Supabase runtime configuration to the separately flagged Confirmation portal", () => {
    expect(server).toContain("function maintenanceHodRuntime(env: unknown)");
    expect(server).toContain("MAINTENANCE_HOD_ACCESS");
    expect(server).toContain("SUPABASE_PUBLISHABLE_KEY");
    expect(server).toContain("renderMaintenanceHodPortal");
    expect(server).toContain('if (request.method === "GET" && includeHodPortal)');
    expect(server).not.toContain("SUPABASE_SECRET_KEY");
    expect(server).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
  });

  it("keeps maintenance edit flow on the canonical existing-response path", () => {
    expect(confirmationEditRoute).toContain('GLOBAL_MAINTENANCE_MODE && entryFocus?.section === "review"');
    expect(confirmationEditRoute).toContain("const editorInitialStep = maintenanceReviewFocus ? 3 : entryFocus?.step ?? undefined;");
    expect(confirmationEditRoute).toContain('data-maintenance-entry-edit-focus="entry"');
    expect(confirmationEditRoute).toContain("initialStep={editorInitialStep}");
  });

  it("keeps the E2E bypass impossible on production hostnames", () => {
    expect(server).toContain('url.hostname === "127.0.0.1" || url.hostname === "localhost"');
    expect(server).toContain('readCookie(request, E2E_MAINTENANCE_BYPASS_COOKIE) === "1"');
  });
});

describe("TerraOS 3 final visual production contract", () => {
  it("splits renderer, visual system and motion runtime cleanly", () => {
    expect(rendered).toContain('<link rel="stylesheet" href="/assets/terraos-maintenance.css?v=20261025-wordmark-global-nowrap" />');
    expect(rendered).toContain('<script src="/assets/terraos-maintenance.js?v=20261025-wordmark-global-nowrap"></script>');
    expect(css).toContain('font-family:"Classica Crastao"');
    expect(css).toContain('font-family:"Gotham"');
    expect(css).toContain("--muted-soft:");
    expect(css).toContain("--primary:");
    expect(rendered).not.toContain("<style>");
  });

  it("keeps Classica Crastao reserved for TerraOS product branding", () => {
    expect(rendered).toContain('<h1 id="maintenance-title" class="terra-wordmark" style="white-space:nowrap;max-width:none;font-size:clamp(2.6rem,14vw,9.8rem)">TerraOS&nbsp;3</h1>');
    expect(rendered).toContain('<h2 id="finale-title" class="terra-wordmark display-heading" style="white-space:nowrap;max-width:none;font-size:clamp(2.5rem,13.5vw,9rem)">TerraOS&nbsp;3</h2>');
    expect(css).toContain('.terra-wordmark,.product-name span,#maintenance-title,#finale-title{font-family:"Classica Crastao"');
  });

  it("renders TerraOS 3 brand lockups as server-rendered unbreakable text", () => {
    expect(page).toContain('MAINTENANCE_ASSET_REVISION = "20261025-wordmark-global-nowrap"');
    expect(rendered.match(/TerraOS&nbsp;3/g)?.length ?? 0).toBeGreaterThanOrEqual(8);
    expect(rendered).toContain('<span class="terra-wordmark" style="white-space:nowrap">TerraOS&nbsp;3</span>');
    expect(rendered).toContain('terraos-maintenance-story-polish.js?v=20261025-wordmark-global-nowrap');
  });

  it("renders the complete long-form product story", () => {
    for (const fragment of [
      "Solaris, reimagined.", "One experience.<br />Every moment.", "A new generation of Solaris.",
      "Everything<br />in its place.", "What matters,<br />now.", "Know exactly<br />what needs you.",
      "To the moment<br />it matters.", "More Solaris.<br />Less searching.", "See what<br />happened.",
      "Your<br />Solaris.", "Take a closer look.", "Built for<br />contest night.",
      "Your delegation<br />keeps moving.", "is taking shape.", "Built for what happens next.",
    ]) expect(rendered).toContain(fragment);
  });

  it("gives all five V3 destinations standalone real-preview chapters", () => {
    for (const id of ["solaris-now", "participate-feature", "explore-feature", "results-feature", "me-feature"]) {
      expect(rendered).toContain(`id="${id}"`);
    }
    for (const screen of ["home", "participate", "explore", "results", "me"]) {
      expect(rendered).toContain(`/terraos-teaser-preview?screen=${screen}&chrome=content`);
    }
    expect(page).toContain("function featureChapter");
  });

  it("uses obvious locally hosted image-led chapters", () => {
    expect(rendered).toContain('/assets/terraos-maintenance/atmosphere.jpeg');
    expect(rendered).toContain('/assets/terraos-maintenance/moment-a.svg');
    expect(rendered).toContain('/assets/terraos-maintenance/moment-b.svg');
    expect(rendered).not.toContain('/assets/terraos-maintenance/moment-a.png');
    expect(rendered).not.toContain('/assets/terraos-maintenance/moment-b.png');
    expect(page).toContain('SOLARIS_VISUAL_REVISION = "20261025-crisp-vectors"');
    expect(rendered.match(/\?v=20261025-crisp-vectors/g)?.length ?? 0).toBe(4);
    expect(rendered.match(/data-photo-kind="photo"/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
    expect(rendered.match(/class="photo-chapter/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(rendered.match(/data-photo-parallax=/g)?.length ?? 0).toBe(7);
  });

  it("prevents display headings from splitting words", () => {
    expect(css).toContain('p,.body-copy{overflow-wrap:break-word}');
    expect(css).toContain('h1,h2,h3,.display-heading{overflow-wrap:normal;word-break:normal;hyphens:none;text-wrap:balance}');
    expect(rendered).toContain("More Solaris.<br />Less searching.");
    expect(css).not.toContain("overflow-wrap:anywhere");
  });

  it("uses one bounded scroll runtime for musical curves, parallax and state choreography", () => {
    expect(rendered.match(/data-rhythm-field/g)?.length ?? 0).toBe(7);
    expect(page).toContain("function rhythmFieldMarkup");
    expect(motion).toContain("function updateMotion()");
    expect(motion).toContain("requestAnimationFrame(updateMotion)");
    expect(motion).toContain("window.addEventListener('scroll', requestMotion, { passive: true })");
    expect(motion).toContain("--rhythm-progress");
    expect(motion).toContain("--rhythm-shift");
    expect(motion).toContain("--photo-shift");
    expect(motion).not.toContain("setInterval(");
    expect(css).toContain("@media(prefers-reduced-motion:reduce)");
  });

  it("keeps phone composition deliberate rather than floating desktop overlays", () => {
    expect(css).toContain("@media(max-width:680px)");
    expect(css).toContain(".hero-device-left,.hero-device-right{display:none}");
    expect(css).toContain(".immersive-status,.immersive-liquid{position:static!important;transform:none!important");
    expect(css).toContain(".live-copy{position:static}");
    expect(css).toContain("grid-auto-columns:84vw");
  });

  it("keeps readiness automatic and public output sanitized", () => {
    expect(page).toContain("getTerraOsPublicReadiness");
    expect(rendered).toContain("Based on tracked release criteria, not time elapsed.");
    expect(rendered).toContain("Progress reflects tracked release readiness rather than time remaining.");
    expect(readiness).toContain("V3_PUBLIC_CAPABILITIES");
    expect(readiness).toContain("V3_ORGANIZER_CAPABILITY_REGISTRY");
    expect(readiness).toContain("V3_SYSTEM_DOMAIN_REGISTRY");
    expect(readiness).toContain("V3_DOMAIN_CONSEQUENCE_REGISTRY");
    expect(readiness).toContain("Math.min(98");
    expect(rendered).not.toContain("mainSha");
    expect(rendered).not.toContain("PR #");
  });

  it("keeps truthful arrival copy and immediate Confirmation access", () => {
    expect(config).toContain('MAINTENANCE_RETURN_DATE = "15 November 2026"');
    expect(config).toContain('TERRAOS3_ESTIMATED_LAUNCH_AT = "2026-11-15T20:00:00+02:00"');
    expect(rendered).toContain("Estimated arrival");
    expect(page).toContain("TerraOS 3 is being prepared.");
    expect(rendered).toContain('href="#confirmation-access"');
    expect(rendered).toContain('data-confirmation-host');
    expect(motion).toContain("confirmationHost.appendChild(portal)");
    expect(hodPortal).toContain("Manage your current Confirmation");
  });

  it("keeps static visual assets inside the already-approved asset prefix", () => {
    expect(server).toContain('const MAINTENANCE_APP_ASSET_PREFIXES = ["/_build/", "/assets/", "/build/", "/fonts/"] as const;');
    expect(rendered).toContain('/assets/terraos-maintenance.css');
    expect(rendered).toContain('/assets/terraos-maintenance.js');
    expect(rendered).not.toContain("images.unsplash.com");
    expect(rendered).not.toContain("upload.wikimedia.org");
    expect(rendered).toContain('<meta name="robots" content="noindex, nofollow" />');
  });
});