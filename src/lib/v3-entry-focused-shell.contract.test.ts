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
    expect(screen.behavior.offline).toBe("online-required");
  });

  it("derives Entry chrome from the canonical screen registry", () => {
    expect(resolveV3FocusedTaskChrome("/my-solaris/entry")).toMatchObject({
      screenId: "mysolaris.entry",
      title: "Entry",
      rootTab: "participate",
      backLabel: "Participate",
      backTo: "/participate",
      helpTo: "/guide",
    });
  });

  it("uses one route-owned focused shell instead of stacked global/workspace chrome", () => {
    const gate = source("src/components/v3/V3EntryRouteGate.tsx");
    const workspace = source("src/components/mysolaris/MySolarisWorkspaceShell.tsx");
    const css = source("src/styles/v3-focused-task-shell.css");

    expect(gate).toContain("<V3FocusedTaskShell");
    expect(gate).not.toContain("<V3AppShell");
    expect(workspace).toContain("resolveSolarisAppScreen(location.pathname).behavior.criticalTask");
    expect(workspace).toContain("if (focusedTask) return <>{children}</>");
    expect(css).toContain("body:has([data-v3-focused-task-shell]) .solaris-app-toolbar");
    expect(css).toContain('.app-main[data-solaris-app-mode="true"]');
  });

  it("keeps country-scoped organizer inspection in the canonical legacy workspace", () => {
    const gate = source("src/components/v3/V3EntryRouteGate.tsx");
    const workspace = source("src/components/mysolaris/MySolarisWorkspaceShell.tsx");
    const route = source("src/routes/_authenticated/my-solaris/entry.tsx");

    expect(route).toContain("organizerInspection={Boolean(search.country)}");
    expect(gate).toContain("if (organizerInspection || !isAppMode) return <>{legacy}</>");
    expect(workspace).toContain("const countryInspection = countryInspectionTarget(location.search)");
    expect(workspace).toContain("!countryInspection &&");
    expect(workspace).toContain("<MySolarisWorkspaceNav />");
  });

  it("blocks service-worker activation throughout Entry while ordinary MySolaris remains safe", () => {
    expect(routeUpdateBlocker("/my-solaris/entry")?.id).toBe("focused-participation-task");
    expect(routeUpdateBlocker("/my-solaris/entry/")?.id).toBe("focused-participation-task");
    expect(routeUpdateBlocker("/my-solaris/activity")).toBeNull();
  });
});
