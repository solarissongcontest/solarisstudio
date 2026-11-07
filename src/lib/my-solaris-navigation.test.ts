import { describe, expect, it } from "vitest";

import {
  MY_SOLARIS_MOBILE_PRIMARY_IDS,
  MY_SOLARIS_NAVIGATION,
  mySolarisItemIsActive,
  mySolarisMoreItems,
  mySolarisNavigationItems,
} from "@/lib/my-solaris-navigation";

describe("MySolaris final information architecture", () => {
  it("keeps every section in exactly one requested group", () => {
    expect(MY_SOLARIS_NAVIGATION.map((group) => group.label)).toEqual([
      null,
      "My edition",
      "My country",
      "My Solaris",
    ]);

    const items = mySolarisNavigationItems();
    expect(items.map((item) => item.label)).toEqual([
      "Home",
      "Entry",
      "Voting",
      "Notices",
      "Country",
      "Page & media",
      "History",
      "Activity",
      "Predictions",
      "Saved",
      "Account",
    ]);
    expect(new Set(items.map((item) => item.id)).size).toBe(items.length);
  });

  it("keeps the compact mobile navigation focused on four personal sections plus More", () => {
    expect(MY_SOLARIS_MOBILE_PRIMARY_IDS).toEqual(["home", "entry", "voting", "notices"]);
    expect(mySolarisMoreItems().map((item) => item.label)).toEqual([
      "Country",
      "Page & media",
      "History",
      "Activity",
      "Predictions",
      "Saved",
      "Account",
    ]);
  });

  it("treats both page editing and appearance as Page & media", () => {
    const pageMedia = mySolarisNavigationItems().find((item) => item.id === "page-media")!;
    expect(mySolarisItemIsActive(pageMedia, "/my-solaris/page-builder")).toBe(true);
    expect(mySolarisItemIsActive(pageMedia, "/my-solaris/theme")).toBe(true);
    expect(mySolarisItemIsActive(pageMedia, "/my-solaris/country")).toBe(false);
  });
});
