import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const route = () => read("src/routes/_authenticated/admin/operations.tsx");
const css = () => read("src/styles/v3-organizer-overview-editorial.css");

describe("Organizer Overview screenshot-audit redesign", () => {
  it("makes current work primary and secondary status expandable on ordinary web", () => {
    const source = route();
    expect(source).toContain('data-admin-overview=""');
    expect(source).toContain('aria-label="Current priorities"');
    expect(source).toContain('className="admin-overview-priorities"');
    expect(source).toContain('className="admin-overview-next"');
    expect(source).toContain('className="admin-overview-readiness"');
    expect(source).toContain('className="admin-overview-ready-details"');
    expect(source).toContain('className="admin-overview-secondary mt-5"');
    expect(source).toContain('className="admin-overview-secondary-summary"');
    expect(source).toContain("setShowReady(event.currentTarget.open)");
    expect(source).toContain("setShowSecondary(event.currentTarget.open)");
  });

  it("keeps app detail panels expanded and all canonical Organizer work intact", () => {
    const source = route();
    expect(source).toContain('const { isAppMode } = useSolarisApp()');
    expect(source).toContain("open={isAppMode || showReady}");
    expect(source).toContain("open={isAppMode || showSecondary}");
    expect(source).toContain("useV3OrganizerProjection(editionId || null)");
    expect(source).toContain("organizerOverviewStatus(projection.risk, projection.systemHealth.state)");
    expect(source).toContain("organizerIncidentEscalation(");
    expect(source).toContain('to="/admin/tasks"');
    expect(source).toContain('to="/admin/incidents"');
    expect(source).toContain('to="/admin/broadcast-rundown"');
    expect(source).toContain("projection.readiness.blocking");
    expect(source).toContain("projection.readiness.incomplete");
    expect(source).toContain("projection.readiness.ready");
    expect(source).toContain("projection.recentChanges.slice(0, 5)");
    expect(source).toContain("Object.entries(projection.domains).map");
    expect(source).not.toMatch(/supabase\.(?:from|rpc)\(/);
  });

  it("respects browser-only styling, focus, and narrow mobile widths", () => {
    const source = css();
    expect(route()).toContain('import "@/styles/v3-organizer-overview-editorial.css"');
    expect(source).toContain('html:not([data-solaris-app]) .admin-control-room');
    expect(source).toContain("admin-overview-secondary-summary:focus-visible");
    expect(source).toContain("admin-overview-readiness-item:focus-visible");
    expect(source).toContain("min-height: 48px");
    expect(source).toContain("@media (max-width: 639px)");
    expect(source).toContain("@media (forced-colors: active)");
  });
});
