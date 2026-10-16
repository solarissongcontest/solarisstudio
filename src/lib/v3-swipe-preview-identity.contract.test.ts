import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = () =>
  readFileSync(resolve(process.cwd(), "src/components/v3/V3AppShell.tsx"), "utf8");

describe("V3 live swipe preview identity", () => {
  it("requires every supplied live preview to declare the canonical root it represents", () => {
    const code = source();

    expect(code).toContain("export type V3TopLevelSwipePreviewSurface");
    expect(code).toContain("area: V3Area");
    expect(code).toContain("surface: ReactNode");
  });

  it("accepts only the exact adjacent canonical roots", () => {
    const code = source();

    expect(code).toContain("expectedPreviousArea");
    expect(code).toContain("expectedNextArea");
    expect(code).toContain("previousPreview?.area === expectedPreviousArea");
    expect(code).toContain("nextPreview?.area === expectedNextArea");
  });

  it("fails closed instead of rendering a stale or non-adjacent preview", () => {
    const code = source();

    expect(code).toContain("expectedPreviousArea == null || previousSurface != null");
    expect(code).toContain("expectedNextArea == null || nextSurface != null");
    expect(code).toContain("previousSurface={previousSurface}");
    expect(code).toContain("nextSurface={nextSurface}");
    expect(code).not.toContain("previousSurface={swipePreviewSurfaces?.previous}");
    expect(code).not.toContain("nextSurface={swipePreviewSurfaces?.next}");
  });
});
