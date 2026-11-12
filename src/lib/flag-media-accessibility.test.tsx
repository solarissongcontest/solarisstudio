import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { canShowFlagImage, FlagFrame } from "@/components/FlagMedia";

describe("shared country flag fallback", () => {
  it("exposes a missing image as one labelled flag, not anonymous text", () => {
    const html = renderToStaticMarkup(
      <FlagFrame alt="Flag of Oland" fallback="OLA" image={null} chip />,
    );

    expect(html).toContain('data-flag-frame="standard"');
    expect(html).toContain('data-flag-chip="true"');
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="Flag of Oland unavailable"');
    expect(html).toContain(">OLA</span>");
    expect(html).not.toContain("<img");
  });

  it("retries a newly selected flag URL immediately after another image fails", () => {
    expect(canShowFlagImage("https://cdn.test/flag-a.png", "https://cdn.test/flag-a.png")).toBe(false);
    expect(canShowFlagImage("https://cdn.test/flag-b.png", "https://cdn.test/flag-a.png")).toBe(true);
    expect(canShowFlagImage(null, "https://cdn.test/flag-a.png")).toBe(false);
    expect(canShowFlagImage(undefined, null)).toBe(false);
  });

  it("retains canonical 3:2 geometry for both the image and its fallback", () => {
    const css = readFileSync(resolve(process.cwd(), "src/flag-media.css"), "utf8");

    expect(css).toMatch(/\.flag-media-frame\s*\{[^}]*aspect-ratio:\s*3\s*\/\s*2/s);
    expect(css).toContain(".flag-media-frame > .flag-media-image,");
    expect(css).toContain(".flag-media-frame > .flag-media-fallback");
  });
});
