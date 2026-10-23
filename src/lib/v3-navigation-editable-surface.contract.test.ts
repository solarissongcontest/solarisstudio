import { describe, expect, it } from "vitest";

import { HORIZONTAL_BLOCK_SELECTOR } from "@/lib/v3-navigation-gesture";

describe("V3 editable-surface gesture arbitration", () => {
  it("fails closed for every explicit editable content surface except false", () => {
    expect(HORIZONTAL_BLOCK_SELECTOR).toContain(
      '[contenteditable]:not([contenteditable="false"])',
    );
    expect(HORIZONTAL_BLOCK_SELECTOR).not.toContain('[contenteditable="true"]');
  });

  it("keeps ordinary form controls owned by content instead of whole-page navigation", () => {
    for (const selector of ["input", "textarea", "select", "button"]) {
      expect(HORIZONTAL_BLOCK_SELECTOR.split(",")).toContain(selector);
    }
  });
});
