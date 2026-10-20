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

  it("does not treat zoom as a keyboard merely because an editable surface remains focused", () => {
    expect(
      resolveAppKeyboardViewport({
        layoutHeight: 844,
        viewportHeight: 844 / 1.5,
        viewportOffsetTop: 120,
        viewportScale: 1.5,
        editableFocus: true,
      }),
    ).toEqual({ keyboardInset: 0, keyboardOpen: false });
  });

  it("normalizes real keyboard occlusion while an editable surface owns focus under zoom", () => {
    expect(
      resolveAppKeyboardViewport({
        layoutHeight: 844,
        viewportHeight: 500 / 1.5,
        viewportOffsetTop: 120,
        viewportScale: 1.5,
        editableFocus: true,
      }),
    ).toEqual({ keyboardInset: 344, keyboardOpen: true });
  });

  it("keeps zoomed page panning separate from keyboard occlusion", () => {
    expect(
      resolveAppKeyboardViewport({
        layoutHeight: 844,
        viewportHeight: 422,
        viewportOffsetTop: 210,
        viewportScale: 2,
        editableFocus: false,
      }),
    ).toEqual({ keyboardInset: 0, keyboardOpen: false });
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

  it("accounts for visual viewport offset when measuring 1x bottom occlusion", () => {
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

  it("falls back to 1x semantics for unusable scale values", () => {
    expect(
      resolveAppKeyboardViewport({
        layoutHeight: 844,
        viewportHeight: 500,
        viewportOffsetTop: 0,
        viewportScale: 0,
        editableFocus: true,
      }),
    ).toEqual({ keyboardInset: 344, keyboardOpen: true });
  });
});
