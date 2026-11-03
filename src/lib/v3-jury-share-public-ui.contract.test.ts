import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const screen = readFileSync("src/components/v3/V3JuryShareSheet.tsx", "utf8");

describe("V3 Jury Share mobile-sheet presentation contract", () => {
  it("implements the canonical mobile-first share sheet", () => {
    expect(screen).toContain('side="responsive"');
    expect(screen).toContain("Share votes");
    expect(screen).toContain("Choose design");
    expect(screen).toContain("Default");
    expect(screen).toContain("Edition");
    expect(screen).toContain("Liquid Glass");
    expect(screen).toContain("Share image");
    expect(screen).toContain("Save PNG");
    expect(screen).toContain("Save JPEG");
    expect(screen).toContain("Copy votes as text");
  });

  it("keeps Default selected first and derives Story geometry from the shared foundation", () => {
    expect(screen).toContain('useState<JuryShareThemeId>("default")');
    expect(screen).toContain("JURY_SHARE_TARGETS.story.width");
    expect(screen).toContain("JURY_SHARE_TARGETS.story.height");
    expect(screen).toContain('aspect-[9/16]');
  });

  it("remains a presentation primitive instead of creating another authority/export implementation", () => {
    expect(screen).toContain("onShareImage?:");
    expect(screen).toContain("onSaveImage?:");
    expect(screen).toContain("onCopyText?:");
    expect(screen).toContain("must revalidate the current published Result Version before every export");
    expect(screen).not.toContain("supabase");
    expect(screen).not.toContain("v3_jury_share_projection");
    expect(screen).not.toContain("navigator.share");
    expect(screen).not.toContain("navigator.canShare");
    expect(screen).not.toContain("canvas.toBlob");
    expect(screen).not.toContain("html2canvas");
  });

  it("does not fabricate special-theme rendering", () => {
    expect(screen).toContain("Official preview pending");
    expect(screen).toContain("does not invent an Edition or Liquid Glass renderer");
    expect(screen).toContain('availability.state !== "available"');
  });

  it("preserves basic accessible selection and progress semantics", () => {
    expect(screen).toContain('role="radiogroup"');
    expect(screen).toContain('role="radio"');
    expect(screen).toContain("aria-checked={selected}");
    expect(screen).toContain('aria-live="polite"');
  });
});
