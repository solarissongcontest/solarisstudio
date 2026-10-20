import { describe, expect, it } from "vitest";

import { resolveVisualViewportKeyboardInset } from "@/lib/app-viewport";

describe("VisualViewport keyboard inset", () => {
  it("preserves the existing scale-1 keyboard bottom-gap calculation", () => {
    expect(
      resolveVisualViewportKeyboardInset({
        layoutHeight: 844,
        viewportHeight: 500,
        viewportOffsetTop: 100,
        viewportScale: 1,
      }),
    ).toBe(244);
  });

  it("does not mistake pinch zoom for a software keyboard", () => {
    expect(
      resolveVisualViewportKeyboardInset({
        layoutHeight: 844,
        viewportHeight: 422,
        viewportOffsetTop: 0,
        viewportScale: 2,
      }),
    ).toBe(0);
  });

  it("does not mistake a panned pinch-zoom viewport for keyboard occlusion", () => {
    expect(
      resolveVisualViewportKeyboardInset({
        layoutHeight: 844,
        viewportHeight: 422,
        viewportOffsetTop: 100,
        viewportScale: 2,
      }),
    ).toBe(0);
  });

  it("still detects bottom occlusion while the visual viewport is zoomed", () => {
    expect(
      resolveVisualViewportKeyboardInset({
        layoutHeight: 844,
        viewportHeight: 300,
        viewportOffsetTop: 100,
        viewportScale: 2,
      }),
    ).toBe(144);
  });

  it("fails safe to scale 1 when the browser reports an unusable scale", () => {
    expect(
      resolveVisualViewportKeyboardInset({
        layoutHeight: 844,
        viewportHeight: 844,
        viewportOffsetTop: 0,
        viewportScale: 0,
      }),
    ).toBe(0);
  });
});
