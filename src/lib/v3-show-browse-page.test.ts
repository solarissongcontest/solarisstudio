import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { getV3ShowBrowsePage, V3_SHOW_BROWSE_PAGE_SIZE } from "./v3-show-browse-page";

describe("V3 public Shows bounded browse", () => {
  const shows = Array.from({ length: 65 }, (_, index) => ({ id: `show-${index + 1}` }));

  it("renders a bounded first window without changing historical order or identity", () => {
    const page = getV3ShowBrowsePage(shows, 1);
    expect(page.visible).toEqual(shows.slice(0, V3_SHOW_BROWSE_PAGE_SIZE));
    expect(page.visible[0]).toBe(shows[0]);
    expect(page.remaining).toBe(41);
    expect(page.hasMore).toBe(true);
    expect(shows).toHaveLength(65);
  });

  it("reveals the next window without duplicates and stops after the last page", () => {
    const second = getV3ShowBrowsePage(shows, 2);
    const last = getV3ShowBrowsePage(shows, 3);
    expect(second.visible).toEqual(shows.slice(0, 48));
    expect(second.remaining).toBe(17);
    expect(last.visible).toEqual(shows);
    expect(last.remaining).toBe(0);
    expect(last.hasMore).toBe(false);
    expect(getV3ShowBrowsePage(shows, 999).visible).toEqual(shows);
  });

  it("handles empty, reduced and invalid pagination without synthetic shows", () => {
    expect(getV3ShowBrowsePage([], 1)).toEqual({ visible: [], remaining: 0, hasMore: false });
    expect(getV3ShowBrowsePage(shows.slice(0, 7), 1).visible).toEqual(shows.slice(0, 7));
    expect(getV3ShowBrowsePage(shows, -1).visible).toHaveLength(24);
    expect(getV3ShowBrowsePage(shows, Number.NaN).visible).toHaveLength(24);
    expect(getV3ShowBrowsePage(shows, 1.5).visible).toHaveLength(24);
  });

  it("resets the browse window after search or facet changes and retains publication authority", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/components/v3/V3ShowsDiscoveryScreen.tsx"), "utf8",
    );
    expect(source).toContain("getV3ShowBrowsePage(");
    expect(source).toContain("browseWindowState.key === browseFilterKey ? browseWindowState.page : 1");
    expect(source).toContain("JSON.stringify([search.trim(), editionId, kind, state])");
    expect(source).toContain("setBrowseWindowState((previous) => (");
    expect(source).toContain("browseWindow.visible.map((item)");
    expect(source).not.toContain("browseItems.map((item)");
    expect(source).toContain("buildShowDiscovery({");
    expect(source).toContain("showPublishesResults(item.show)");
    expect(source).toContain('to="/shows/$showId"');
    expect(source).not.toContain(".from(");
  });
});
