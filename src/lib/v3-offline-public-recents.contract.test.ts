import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";

import { describe, expect, it } from "vitest";

type OfflineNode = {
  tag: string;
  children: OfflineNode[];
  attributes: Map<string, string>;
  dataset: Record<string, string>;
  hidden: boolean;
  className: string;
  href: string;
  textContent: string;
  innerHTML: string;
  lastElementChild: { textContent: string };
  append: (...nodes: OfflineNode[]) => void;
  getAttribute: (name: string) => string | null;
  setAttribute: (name: string, value: string) => void;
  addEventListener: (name: string, callback: () => void) => void;
};

function node(tag = "div"): OfflineNode {
  const attributes = new Map<string, string>();
  const children: OfflineNode[] = [];
  return {
    tag,
    children,
    attributes,
    dataset: {},
    hidden: false,
    className: "",
    href: "",
    textContent: "",
    innerHTML: "",
    lastElementChild: { textContent: "" },
    append: (...elements) => void children.push(...elements),
    getAttribute: (key) => attributes.get(key) ?? null,
    setAttribute: (key, value) => void attributes.set(key, value),
    addEventListener: () => undefined,
  };
}

type StoredRow = { path: string; label: string; visitedAt?: number };
type StorageFixture = {
  recents?: unknown;
  index?: unknown;
  navigation?: unknown;
  blocked?: boolean;
};

const offlineHtml = readFileSync(resolve(process.cwd(), "public/offline.html"), "utf8");
const offlineScript = offlineHtml.match(/<script>\s*([\s\S]*?)<\/script>/)?.[1];

function renderOffline(fixture: StorageFixture = {}) {
  if (!offlineScript) throw new Error("Static offline script is missing");
  const elements = new Map(
    [
      "last-screen-panel", "last-screen-copy", "saved-panel", "saved-at",
      "saved-list", "recent-list", "connection-status", "connection-copy", "retry",
    ].map((id) => [id, node()]),
  );
  elements.get("last-screen-panel")!.hidden = true;
  const values: Record<string, unknown> = {
    "solaris:public-recents": fixture.recents,
    "solaris:offline-public-index:v1": fixture.index,
    "solaris:app-navigation:v1": fixture.navigation,
  };
  runInNewContext(
    offlineScript,
    {
      document: {
        querySelectorAll: () => [],
        getElementById: (id: string) => elements.get(id) ?? null,
        createElement: (tag: string) => node(tag),
      },
      localStorage: {
        getItem: (key: string) => {
          if (fixture.blocked) throw new Error("Storage permission denied");
          const value = values[key];
          return value === undefined ? null : JSON.stringify(value);
        },
      },
      location: { pathname: "/explore", reload: () => undefined },
      navigator: { onLine: false },
      window: {
        addEventListener: () => undefined,
        setTimeout: () => undefined,
      },
    },
    { timeout: 1000 },
  );

  const entries = (id: string) =>
    (elements.get(id)?.children ?? []).filter((element) => element.tag === "a");
  const rows = (id: string) =>
    entries(id).map((element) => ({
      path: element.href,
      label: element.children[0]?.children[0]?.textContent,
    }));
  return {
    recent: rows("recent-list"),
    saved: rows("saved-list"),
    recentEmpty: elements.get("recent-list")!.innerHTML,
    savedEmpty: elements.get("saved-list")!.innerHTML,
    lastScreen: elements.get("last-screen-panel")!,
  };
}

describe("isolated offline public route privacy boundary", () => {
  it("keeps legitimate public reference details without presenting them as official offline results", () => {
    const allowed: StoredRow[] = [
      { path: "/countries/oland", label: "Oland", visitedAt: 5 },
      { path: "/editions/ssc22", label: "SSC 22", visitedAt: 4 },
      { path: "/shows/semi-one", label: "Semi-final", visitedAt: 3 },
      { path: "/rules/chapters/entries", label: "Entry rules", visitedAt: 2 },
      { path: "/rules/22.1", label: "Rule 22.1", visitedAt: 2 },
      { path: "/rules/22.1.3", label: "Nested rule", visitedAt: 2 },
      { path: "/televoting/results", label: "Published voting", visitedAt: 1 },
    ];
    const result = renderOffline({
      recents: allowed,
      index: { countries: [{ path: "/countries/oland", label: "Oland" }] },
    });
    expect(result.recent).toEqual(allowed.map(({ path, label }) => ({ path, label })));
    expect(result.saved).toEqual([{ path: "/countries/oland", label: "Oland" }]);
  });

  it("filters legacy private labels and malformed links before displaying anything", () => {
    const sensitive = [
      "/admin/operations",
      "/my-solaris/history",
      "/me/receipts",
      "/confirmations/secret-edit",
      "/jury-voting",
      "/televoting/ballots",
      "/integrity/appeals/secret",
      "/settings",
      "/countries/oland/edit",
      "/rules/admin",
      "/rules/22.1/edit",
      "/rules/%2e%2e",
      "/countries/../auth",
      "/countries/%2e%2e",
      "/countries/%252e%252e",
      "/countries/a%2fb",
      "/countries/a%252fb",
      "/countries/a?token=secret",
      "/countries/a#secret",
      "/countries/a%0A",
      "/countries/a//b",
      "/countries/%E0%A4%A",
      "//attacker.test/path",
      "/not-a-registered-page",
    ];
    const unsafeRows: StoredRow[] = sensitive.map((path, index) => ({
      path,
      label: "Private " + index,
      visitedAt: 30 - index,
    }));
    const result = renderOffline({
      recents: [...unsafeRows, { path: "/countries/oland", label: "Oland", visitedAt: 1 }],
      index: {
        countries: [
          { path: "/my-solaris/history", label: "Personal country history" },
          { path: "/countries/oland", label: "Oland" },
        ],
        editions: [{ path: "//evil.test", label: "Unsafe edition" }],
      },
    });
    expect(result.recent).toEqual([{ path: "/countries/oland", label: "Oland" }]);
    expect(result.saved).toEqual([{ path: "/countries/oland", label: "Oland" }]);
  });

  it("drops records without a trusted timestamp or usable public title", () => {
    const result = renderOffline({
      recents: [
        { path: "/countries/oland", label: "No timestamp" },
        { path: "/countries/oland", label: "" , visitedAt: 3 },
        { path: "/countries/oland", label: "A".repeat(251), visitedAt: 3 },
        { path: "/countries/oland", label: "Oland", visitedAt: 1 },
      ],
    });
    expect(result.recent).toEqual([{ path: "/countries/oland", label: "Oland" }]);
  });

  it("shows an empty state for denied storage and stores no private navigation route in the DOM", () => {
    const denied = renderOffline({ blocked: true });
    expect(denied.recent).toEqual([]);
    expect(denied.recentEmpty).toContain("No recent public pages");
    const cached = renderOffline({
      navigation: {
        activeTab: "me",
        tabs: { me: { current: { pathname: "/my-solaris/account/private" } } },
      },
      recents: [{ path: "/my-solaris/account/private", label: "Private", visitedAt: 1 }],
    });
    expect(cached.recent).toEqual([]);
    expect(cached.lastScreen.dataset.path).toBeUndefined();
    expect(offlineHtml).not.toContain("panel.dataset.path");
  });

  it("applies the eight-result limit after filtering old private entries", () => {
    const recents: StoredRow[] = Array.from({ length: 8 }, (_, index) => ({
      path: "/my-solaris/private-" + index,
      label: "Private " + index,
      visitedAt: 40 - index,
    }));
    recents.push(...Array.from({ length: 10 }, (_, index) => ({
      path: "/countries/public-" + index,
      label: "Public " + index,
      visitedAt: 20 - index,
    })));
    const result = renderOffline({ recents });
    expect(result.recent).toHaveLength(8);
    expect(result.recent[0]?.path).toBe("/countries/public-0");
    expect(result.recent[7]?.path).toBe("/countries/public-7");
  });
});
