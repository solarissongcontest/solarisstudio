import { describe, expect, it } from "vitest";

import { resolveScrollMorphProgress } from "@/lib/use-scroll-morph-progress";

describe("Solaris V6 toolbar scroll morph", () => {
  it("clamps before and after the morph range", () => {
    expect(resolveScrollMorphProgress(-20, 0, 100)).toBe(0);
    expect(resolveScrollMorphProgress(160, 0, 100)).toBe(1);
  });

  it("tracks direct scroll progress continuously", () => {
    expect(resolveScrollMorphProgress(25, 0, 100)).toBe(0.25);
    expect(resolveScrollMorphProgress(50, 0, 100)).toBe(0.5);
  });
});
