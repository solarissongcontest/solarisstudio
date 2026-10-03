import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("Solaris V6 interaction primitives in real product flows", () => {
  it("uses the draggable sheet for the installed-app More surface while preserving the desktop/public drawer", () => {
    const shell = source("src/components/AppShell.tsx");
    expect(shell).toContain("SolarisDraggableSheetContent");
    expect(shell).toContain('aria-label="More Solaris Studio options"');
    expect(shell).toContain('side="right"');
    expect(shell).toContain('aria-label="Navigation menu"');
  });

  it("uses morphing selection for Organizer task filtering without changing canonical task truth", () => {
    const tasks = source("src/routes/_authenticated/admin/tasks.tsx");
    expect(tasks).toContain("SolarisMorphingSelection");
    expect(tasks).toContain('ariaLabel="Task filters"');
    expect(tasks).toContain("useOrganizerTasksV5");
    expect(tasks).toContain("There is intentionally no generic “Mark resolved” button.");
  });

  it("uses the reorder primitive for the canonical broadcast rundown without removing explicit keyboard controls", () => {
    const rundown = source("src/routes/_authenticated/admin/broadcast-rundown.tsx");
    const reorder = source("src/components/interaction/SolarisReorderableList.tsx");
    expect(rundown).toContain("SolarisReorderableList");
    expect(rundown).toContain("disabled={structureLocked}");
    expect(rundown).toContain("onMove={moveSegment}");
    expect(reorder).toContain("Move ${item.ariaLabel} up");
    expect(reorder).toContain("Move ${item.ariaLabel} down");
    expect(reorder).toContain("disabled={disabled || index === 0}");
  });

  it("adds optional swipe actions to Organizer Inbox without confusing seen state with domain resolution", () => {
    const inbox = source("src/routes/_authenticated/admin/inbox.tsx");
    const swipe = source("src/components/interaction/SolarisSwipeActionRow.tsx");
    expect(inbox).toContain("SolarisSwipeActionRow");
    expect(inbox).toContain('showFallbackActions={false}');
    expect(inbox).toContain('id: "seen"');
    expect(inbox).toContain("!resolved && !domainResolved");
    expect(inbox).toContain("Resolving automatically from the source workflow").toBe(false);
    expect(inbox).toContain("Resolves automatically from the source workflow");
    expect(swipe).toContain("tabIndex={open ? 0 : -1}");
    expect(swipe).toContain("aria-hidden={!open}");
  });

  it("uses semantic pending press feedback for participant notice acknowledgement", () => {
    const tasks = source("src/components/mysolaris/modules/MySolarisTasksModule.tsx");
    expect(tasks).toContain("SolarisPressable");
    expect(tasks).toContain("pending={acknowledgeNotice.isPending}");
    expect(tasks).toContain('weight="standard"');
    expect(tasks).toContain("acknowledgeStudio2Notice");
  });
});
