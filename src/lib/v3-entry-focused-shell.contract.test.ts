import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { resolveSolarisAppScreen } from "./app-screen-registry";
import { routeUpdateBlocker } from "./app-update-safety";
import { resolveV3FocusedTaskChrome } from "./v3-focused-task-chrome";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("V3 Entry focused participant shell", () => {
  it("classifies Entry as authenticated Participate critical work", () => {
    const screen = resolveSolarisAppScreen("/my-solaris/entry");

    expect(screen.id).toBe("mysolaris.entry");
    expect(screen.presentation).toBe("task");
    expect(screen.hierarchy.rootTab).toBe("participate");
    expect(screen.hierarchy.parent).toEqual({ label: "Participate", href: "/participate" });
    expect(screen.chrome).toEqual({ toolbar: "focused", tabbar: "hidden", search: "none" });
    expect(screen.access.auth).toBe("authenticated");
    expect(screen.behavior.criticalTask).toBe(true);
    expect(screen.behavior.immersive).toBe(false);
    expect(screen.behavior.offline).toBe("online-required");
  });

  it("derives Entry chrome from the canonical screen registry", () => {
    expect(resolveV3FocusedTaskChrome("/my-solaris/entry")).toMatchObject({
      pathname: "/my-solaris/entry",
      screenId: "mysolaris.entry",
      title: "Entry",
      rootTab: "participate",
      backLabel: "Participate",
      backTo: "/participate",
      helpTo: "/guide",
    });
  });

  it("uses the shared focused shell without reintroducing global V3 app chrome", () => {
    const gate = source("src/components/v3/V3EntryRouteGate.tsx");

    expect(gate).toContain('resolveV3FocusedTaskChrome("/my-solaris/entry")');
    expect(gate).toContain("<V3FocusedTaskShell");
    expect(gate).toContain("chrome={ENTRY_FOCUSED_CHROME}");
    expect(gate).not.toContain("<V3AppShell");
    expect(gate).not.toContain('activeArea="participate"');
  });

  it("blocks service-worker activation throughout Entry while ordinary MySolaris remains safe", () => {
    expect(routeUpdateBlocker("/my-solaris/entry")?.id).toBe("focused-participation-task");
    expect(routeUpdateBlocker("/my-solaris/entry/")?.id).toBe("focused-participation-task");
    expect(routeUpdateBlocker("/my-solaris/activity")).toBeNull();
  });
});
