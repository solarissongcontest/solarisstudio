import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("Solaris V6 full microinteraction pass", () => {
  it("uses shared direct-manipulation physics in both Public and Organizer persistent navigation", () => {
    const publicTabs = source("src/components/app/AppTabBar.tsx");
    const organizerTabs = source("src/components/admin/OrganizerV6TabBar.tsx");

    for (const tabs of [publicTabs, organizerTabs]) {
      expect(tabs).toContain("useScrollResponsiveBar");
      expect(tabs).toContain("resolveElasticDrag");
      expect(tabs).toContain("useSolarisPressHold");
      expect(tabs).toContain("onPointerCancel");
      expect(tabs).toContain("onLostPointerCapture");
    }
  });

  it("consumes every major V6 interaction primitive in a real product flow", () => {
    const shell = source("src/components/AppShell.tsx");
    const participantTasks = source(
      "src/components/mysolaris/modules/MySolarisTasksModule.tsx",
    );
    const organizerTasks = source("src/routes/_authenticated/admin/tasks.tsx");
    const inbox = source("src/routes/_authenticated/admin/inbox.tsx");
    const broadcast = source(
      "src/routes/_authenticated/admin/broadcast-rundown.tsx",
    );

    expect(shell).toContain("SolarisDraggableSheetContent");
    expect(participantTasks).toContain("SolarisPressable");
    expect(organizerTasks).toContain("SolarisMorphingSelection");
    expect(inbox).toContain("SolarisSwipeActionRow");
    expect(broadcast).toContain("SolarisReorderableList");
  });

  it("keeps advanced gestures optional with keyboard and explicit-action fallbacks", () => {
    const sheet = source("src/components/interaction/SolarisDraggableSheet.tsx");
    const reorder = source("src/components/interaction/SolarisReorderableList.tsx");
    const swipe = source("src/components/interaction/SolarisSwipeActionRow.tsx");

    for (const label of ["Expand sheet", "Collapse sheet", "Close sheet"]) {
      expect(sheet).toContain(`aria-label="${label}"`);
    }
    expect(reorder).toContain("Move ${item.ariaLabel} up");
    expect(reorder).toContain("Move ${item.ariaLabel} down");
    expect(swipe).toContain("Actions");
    expect(swipe).toContain("tabIndex={open ? 0 : -1}");
    expect(swipe).toContain("aria-hidden={!open}");
  });

  it("honours reduced motion focus visibility and interruption recovery", () => {
    const transitions = source("src/lib/app-view-transitions.ts");
    const accessibility = source("src/accessibility.css");
    const styles = source("src/styles.css");
    const organizerTabs = source("src/components/admin/OrganizerV6TabBar.tsx");

    expect(transitions).toContain("prefersReducedMotion");
    expect(accessibility).toContain("solaris-reduced-fade-in");
    expect(styles).toContain("outline: 3px solid");
    expect(organizerTabs).toContain('window.addEventListener("blur"');
    expect(organizerTabs).toContain('window.addEventListener("orientationchange"');
    expect(organizerTabs).toContain('document.addEventListener("visibilitychange"');
  });

  it("keeps overlay keyboard safe-area and persistent-chrome measurements under shared ownership", () => {
    const manager = source("src/components/app/AppOverlayManager.tsx");
    const metrics = source("src/components/app/AppChromeMetrics.tsx");
    const appStyles = source("src/styles/app-shell.css");

    expect(manager).toContain("data-solaris-feature-overlay-open");
    expect(manager).toContain("<AppChromeMetrics />");
    expect(metrics).toContain("--solaris-keyboard-inset");
    expect(metrics).toContain("--solaris-safe-bottom");
    expect(appStyles).toContain("--solaris-bottom-obstruction");
  });
});
