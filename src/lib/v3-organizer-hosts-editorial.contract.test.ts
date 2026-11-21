import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = () => readFileSync(resolve(process.cwd(), "src/routes/_authenticated/admin/hosts.tsx"), "utf8");
const styles = () => readFileSync(resolve(process.cwd(), "src/styles/v3-organizer-hosts-editorial.css"), "utf8");

describe("Host Management screenshot-driven browser experience", () => {
  it("links all five host stages with browser Back/Forward while retaining app-local navigation", () => {
    const s = source();
    expect(s).toContain("hostViewFromHash(hash: string): HostView");
    expect(s).toContain("HOST_VIEWS.find((item) => item.id === key)?.id ?? 'overview'");
    expect(s).toContain("window.addEventListener('popstate', restore)");
    expect(s).toContain("window.addEventListener('hashchange', restore)");
    expect(s).toContain("window.history.pushState(window.history.state");
    expect(s).toContain("if (isAppMode) return;");
    expect(s).toContain("onChange={openHostView}");
    expect(s).toContain("onView={openHostView}");
    expect(s).toContain("aria-pressed={view === tab.id}");
    for (const view of ["overview", "bids", "evaluation", "selected", "operations"]) {
      expect(s).toContain(`id: '${view}'`);
    }
  });

  it("prioritizes the selected host but leaves all canonical operation reviews untouched", () => {
    const s = source();
    expect(s).toContain('className="admin-host-selected"');
    expect(s).toContain('className="admin-host-metrics');
    expect(s).toContain('className="admin-host-steps"');
    expect(s).toContain("loadStudio2HostManagement(resolvedEditionId)");
    expect(s).toContain("executeStudio2HostOperation");
    expect(s).toContain("snapshot?.edition.id !== resolvedEditionId");
    expect(s).toContain("pending.expectedRevision");
    expect(s).toContain("confirmationText={pending?.confirmationText}");
    expect(s).toContain("AuditReason");
    expect(s).toContain("AdminConfirmSheet");
  });

  it("keeps the installed app outside all new presentation rules", () => {
    const s = styles();
    expect(source()).toContain("import '@/styles/v3-organizer-hosts-editorial.css'");
    expect(s).toContain("html:not([data-solaris-app]) .admin-control-room .admin-host-workspace");
    expect(s).toContain(".admin-host-selected {\n  order: -1;");
    expect(s).toContain('.admin-host-tabs > button[aria-pressed="true"]');
    expect(s).toContain("min-height: 48px");
    expect(s).toContain("min-height: 44px");
    expect(s).toContain("@media (max-width: 767px)");
    expect(s).toContain("@media (max-width: 359px)");
    expect(s).toContain("@media (forced-colors: active)");
  });
});
