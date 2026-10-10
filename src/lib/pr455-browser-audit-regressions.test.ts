import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("PR455 Browser Audit regression contracts", () => {
  it("keeps transient route pending UI out of page landmark ownership and router subscriptions", () => {
    const router = source("src/router.tsx");

    expect(router).toContain('role="status"');
    expect(router).toContain('aria-label="Loading page"');
    expect(router).not.toContain('<main\n      id="main-content"');
    expect(router).not.toContain('<h1 className="mt-1 font-display text-2xl font-bold">Loading page…</h1>');
    expect(router).not.toContain("createRouter, useRouterState");
    expect(router).not.toContain("const pathname = useRouterState");
    expect(router).toContain("window.location.pathname");
  });

  it("keeps Organizer directory keys unique before an edition has resolved", () => {
    const menu = source("src/routes/_authenticated/admin/menu.tsx");

    expect(menu).toContain('key={`${item.to}:${item.label}`}');
    expect(menu).not.toContain("<DirectoryItem key={item.to}");
  });

  it("keeps hidden swipe actions non-interactive", () => {
    const swipe = source("src/components/interaction/SolarisSwipeActionRow.tsx");

    expect(swipe).toContain('aria-hidden={!open}');
    expect(swipe).toContain('disabled={!open}');
    expect(swipe).toContain('tabIndex={open ? 0 : -1}');
  });

  it("keeps heat progression effects stable while query data is unresolved", () => {
    const progression = source("src/components/admin/HeatProgressionSyncPanel.tsx");

    expect(progression).toContain("const EMPTY_SHOWS: Show[] = [];");
    expect(progression).toContain("const EMPTY_PARTICIPANTS: Participant[] = [];");
    expect(progression).toContain("return unchanged ? current : next;");
  });

  it("uses authenticated Organizer identity directly for notification observers", () => {
    const adminOps = source("src/lib/admin-ops.ts");
    const notificationHook = adminOps.slice(
      adminOps.indexOf("export function useAdminNotifications"),
      adminOps.indexOf("export function useCreateAdminDeadline"),
    );

    expect(notificationHook).toContain("const user = useAuthenticatedUser();");
    expect(notificationHook).toContain('["admin-notifications", user.id]');
    expect(notificationHook).toContain('.eq("recipient_id", user.id)');
    expect(notificationHook).not.toContain("auth.getSession");
    expect(notificationHook).not.toContain("auth.getUser");
  });

  it("publishes installed-app runtime identity before React hydration", () => {
    const root = source("src/routes/__root.tsx");

    expect(root).toContain('root.dataset.solarisRuntime = "standalone"');
    expect(root).toContain('root.setAttribute("data-solaris-app", "")');
    expect(root).toContain('navigator.standalone === true');
  });

  it("audits semantic readiness through positive visible state instead of first-node, loader-absence or network-idle heuristics", () => {
    const audit = source("e2e/audit-helpers.ts");
    const preflight = source("e2e/pr455-organizer-regression.e2e.ts");

    expect(audit).toContain("const visibleMainLandmarks =");
    expect(audit).toContain("mainCount: visibleMainLandmarks.length");
    expect(audit).toContain('page.locator("main:visible")');
    expect(audit).toContain('page.locator("h1:visible")');
    expect(audit).not.toContain('page.locator("main").first()');
    expect(audit).not.toContain('page.locator("h1").first()');
    expect(audit).not.toContain('waitForLoadState("networkidle"');
    expect(audit).not.toContain("waitForTimeout(250)");

    expect(preflight).toContain("waitForSemanticReadiness");
    expect(preflight).toContain(".waitForFunction(");
    expect(preflight).toContain("mainCount === 1 && h1Count === 1 && pendingStatuses.length === 0");
    expect(preflight).toContain("Loading page|Checking organizer access");
    expect(preflight).toContain("pendingStatuses: pageState.pendingStatuses");
    expect(preflight).toContain("mainVisible: pageState.mainCount === 1");
    expect(preflight).toContain("headingVisible: pageState.h1Count === 1");
    expect(preflight).not.toContain('.waitFor({ state: "hidden"');
    expect(preflight).not.toContain('.locator("main")\n    .first()');
    expect(preflight).not.toContain('.locator("h1")\n    .first()');
    expect(preflight).not.toContain('waitForLoadState("networkidle"');
    expect(preflight).not.toContain("waitForTimeout(");
    expect(audit).toContain("if (node.tabIndex < 0) return false;");
  });

  it("starts keyboard reachability checks from a deterministic focus sentinel", () => {
    const audit = source("e2e/audit-helpers.ts");

    expect(audit).toContain("data-solaris-audit-focus-start");
    expect(audit).toContain("sentinel.focus({ preventScroll: true })");
    expect(audit).toContain("const stayedOnSentinel = active === sentinel");
    expect(audit).not.toContain("document.activeElement.blur()");
  });

  it("keeps PR browser audit representative while preserving exhaustive certification", () => {
    const config = source("playwright.config.ts");
    const workflow = source(".github/workflows/browser-audit.yml");

    expect(config).toContain('const fullAudit = process.env.E2E_FULL_AUDIT === "1";');
    expect(config).toContain("const personalityViewportMatrix = fullAudit");
    expect(config).toContain(
      "grepInvert: fullAudit ? undefined : /installed-app route invariant crawl/",
    );
    expect(config).toContain('{ width: 390, height: 844 }');
    expect(config).toContain('{ width: 1440, height: 900 }');
    expect(workflow).toContain("Pull requests run a representative smoke set");
    expect(workflow).toContain("E2E_FULL_AUDIT:");
    expect(workflow).toContain("github.event_name == 'workflow_dispatch'");
  });

  it("keeps organizer child content out of primary-main ownership and legacy Action Center aliases on canonical Tasks", () => {
    const gate = source("src/components/admin/UnifiedServiceAdminGate.tsx");
    const combined = source("src/routes/televoting/admin/combined.tsx");
    const britishAlias = source("src/routes/_authenticated/admin/action-centre.tsx");
    const americanAlias = source("src/routes/_authenticated/admin/action-center.tsx");

    expect(gate).toContain('role="status"');
    expect(gate).toContain('aria-label="Checking organizer access"');
    expect(gate).not.toContain("<main");
    expect(combined).not.toContain("<main");
    expect(britishAlias).toContain('to: "/admin/tasks"');
    expect(americanAlias).toContain('to: "/admin/tasks"');
    expect(britishAlias).not.toContain('to: "/admin/operations"');
    expect(americanAlias).not.toContain('to: "/admin/operations"');
  });

  it("keeps organizer auth resolution inside an effect instead of render", () => {
    const gate = source("src/components/admin/UnifiedServiceAdminGate.tsx");
    const functionStart = gate.indexOf("export function UnifiedServiceAdminGate");
    const effectStart = gate.indexOf("useEffect(() =>", functionStart);
    const beforeEffect = gate.slice(functionStart, effectStart);

    expect(effectStart).toBeGreaterThan(functionStart);
    expect(beforeEffect).not.toContain("supabase.auth.getUser()");
    expect(gate.slice(effectStart)).toContain("supabase.auth.getUser()");
  });
});
