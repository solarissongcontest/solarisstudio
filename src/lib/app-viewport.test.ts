import { describe, expect, it } from "vitest";

import { resolveAppKeyboardViewport } from "@/lib/app-viewport";

describe("app viewport keyboard inference", () => {
  it("recognizes substantial 1x viewport occlusion as a software keyboard", () => {
    expect(
      resolveAppKeyboardViewport({
        layoutHeight: 844,
        viewportHeight: 500,
        viewportOffsetTop: 0,
        viewportScale: 1,
        editableFocus: true,
      }),
    ).toEqual({ keyboardInset: 344, keyboardOpen: true });
  });

  it("does not reinterpret pinch zoom as a software keyboard", () => {
    expect(
      resolveAppKeyboardViewport({
        layoutHeight: 844,
        viewportHeight: 422,
        viewportOffsetTop: 0,
        viewportScale: 2,
        editableFocus: false,
      }),
    ).toEqual({ keyboardInset: 0, keyboardOpen: false });
  });

  it("preserves real keyboard occlusion when an editable surface owns focus while zoomed", () => {
    expect(
      resolveAppKeyboardViewport({
        layoutHeight: 844,
        viewportHeight: 500,
        viewportOffsetTop: 0,
        viewportScale: 1.5,
        editableFocus: true,
      }),
    ).toEqual({ keyboardInset: 344, keyboardOpen: true });
  });

  it("keeps small browser-chrome viewport differences below the keyboard threshold", () => {
    expect(
      resolveAppKeyboardViewport({
        layoutHeight: 844,
        viewportHeight: 780,
        viewportOffsetTop: 0,
        viewportScale: 1,
        editableFocus: false,
      }),
    ).toEqual({ keyboardInset: 64, keyboardOpen: false });
  });

  it("accounts for visual viewport offset when measuring bottom occlusion", () => {
    expect(
      resolveAppKeyboardViewport({
        layoutHeight: 844,
        viewportHeight: 600,
        viewportOffsetTop: 80,
        viewportScale: 1,
        editableFocus: true,
      }),
    ).toEqual({ keyboardInset: 164, keyboardOpen: true });
  });
});
