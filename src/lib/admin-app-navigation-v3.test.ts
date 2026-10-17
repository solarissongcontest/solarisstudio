import { describe, expect, it } from "vitest";

import {
  adminAppTabForPath,
  adminAppTabRoot,
  readAdminNavigationState,
  writeAdminNavigationState,
  type AdminNavigationState,
} from "./admin-app-navigation";

function reader(values: Record<string, string>) {
  return {
    getItem(key: string) {
      return values[key] ?? null;
    },
  };
}

describe("canonical Organizer navigation memory", () => {
  it("uses the canonical Overview · Tasks · Control · Live · More roots", () => {
    expect(adminAppTabRoot("overview")).toBe("/admin/operations");
    expect(adminAppTabRoot("tasks")).toBe("/admin/tasks");
    expect(adminAppTabRoot("control")).toBe("/admin/control");
    expect(adminAppTabRoot("live")).toBe("/admin/control-room");
    expect(adminAppTabRoot("more")).toBe("/admin/more");

    expect(adminAppTabForPath("/admin/operations")).toBe("overview");
    expect(adminAppTabForPath("/admin/inbox")).toBe("tasks");
    expect(adminAppTabForPath("/confirmations/admin/responses")).toBe("control");
    expect(adminAppTabForPath("/admin/results")).toBe("control");
    expect(adminAppTabForPath("/admin/control-room")).toBe("live");
    expect(adminAppTabForPath("/admin/incidents")).toBe("live");
    expect(adminAppTabForPath("/admin/system-health")).toBe("more");
  });

  it("redistributes legacy Edition history by current canonical route ownership", () => {
    const legacy = {
      version: 1,
      activeTab: "edition",
      tabs: {
        home: {
          current: {
            pathname: "/admin/operations",
            searchStr: "",
            scrollY: 10,
            visitedAt: "2026-10-17T08:00:00.000Z",
          },
          history: [],
        },
        edition: {
          current: {
            pathname: "/admin/control-room",
            searchStr: "?show=final",
            scrollY: 320,
            visitedAt: "2026-10-17T09:00:00.000Z",
          },
          history: [
            {
              pathname: "/admin/results",
              searchStr: "",
              scrollY: 140,
              visitedAt: "2026-10-17T08:30:00.000Z",
            },
            {
              pathname: "/admin/control-room",
              searchStr: "?show=final",
              scrollY: 320,
              visitedAt: "2026-10-17T09:00:00.000Z",
            },
          ],
        },
        delegations: {
          current: {
            pathname: "/admin/countries",
            searchStr: "",
            scrollY: 90,
            visitedAt: "2026-10-17T08:45:00.000Z",
          },
          history: [],
        },
      },
    };
    const state = readAdminNavigationState(
      null,
      reader({ "solaris:organizer-navigation:v1": JSON.stringify(legacy) }),
    );

    expect(state.version).toBe(2);
    expect(state.activeTab).toBe("live");
    expect(state.tabs.live?.current.pathname).toBe("/admin/control-room");
    expect(state.tabs.live?.current.scrollY).toBe(320);
    expect(state.tabs.control?.history.map((entry) => entry.pathname)).toEqual([
      "/admin/results",
    ]);
    expect(state.tabs.control?.current.pathname).toBe("/admin/countries");
  });

  it("prefers canonical V2 storage and writes only the V2 key", () => {
    const canonical: AdminNavigationState = {
      version: 2,
      activeTab: "tasks",
      tabs: {},
    };
    const state = readAdminNavigationState(
      null,
      reader({
        "solaris:organizer-navigation:v2": JSON.stringify(canonical),
        "solaris:organizer-navigation:v1": JSON.stringify({ version: 1, activeTab: "home", tabs: {} }),
      }),
    );
    expect(state.activeTab).toBe("tasks");

    const writes = new Map<string, string>();
    writeAdminNavigationState(canonical, {
      setItem(key: string, value: string) {
        writes.set(key, value);
      },
    });
    expect(writes.has("solaris:organizer-navigation:v2")).toBe(true);
    expect(writes.has("solaris:organizer-navigation:v1")).toBe(false);
  });
});
