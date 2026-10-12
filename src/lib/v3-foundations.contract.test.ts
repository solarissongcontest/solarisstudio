import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("Solaris Studio V3 foundation preview", () => {
  it("keeps the visual foundation isolated from the production app", () => {
    const css = source("src/styles/v3-foundations.css");
    expect(css).toContain("[data-solaris-v3]");
    expect(css).toContain("--v3-bg-base");
    expect(css).toContain("--v3-motion-standard");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain("@media (prefers-reduced-transparency: reduce)");
    expect(css).not.toMatch(/(^|\n)\s*:root\s*\{/);
    expect(css).not.toMatch(/(^|\n)\s*body\s*\{/);
  });

  it("starts with the stable five-area product architecture", () => {
    const preview = source("src/components/v3/V3FoundationPreview.tsx");
    for (const label of ["Home", "Explore", "Participate", "Results", "Me"]) {
      expect(preview).toContain(`label: "${label}"`);
    }
    expect(preview).toContain("Your responsibilities");
    expect(preview).toContain("Optional now");
    expect(preview).toContain("Outcome first");
    expect(preview).toContain("Your Solaris identity");
  });

  it("keeps the preview route isolated, unindexed and disabled in production by default", () => {
    const route = source("src/routes/v3-preview.tsx");
    expect(route).toContain('name: "robots", content: "noindex,nofollow"');
    expect(route).toContain("V3FoundationPreview");
    expect(route).toContain("!import.meta.env.PROD");
    expect(route).toContain('import.meta.env.VITE_SOLARIS_V3_PREVIEW === "1"');
    expect(route).toContain('redirect({ to: "/", replace: true })');
    expect(route).not.toContain("supabase");
  });

  it("keeps required status semantic rather than colour-only", () => {
    const components = source("src/components/v3/V3Foundation.tsx");
    expect(components).toContain("V3StatusChip");
    expect(components).toContain("data-tone={tone}");
    expect(components).toContain("aria-valuenow");
    expect(components).toContain('aria-label={label ?? "Progress"}');
  });

  it("does not make gesture-only behaviour part of the first foundation slice", () => {
    const components = source("src/components/v3/V3Foundation.tsx");
    const preview = source("src/components/v3/V3FoundationPreview.tsx");
    expect(components).not.toContain("onPointerMove");
    expect(components).not.toContain("onTouchMove");
    expect(preview).not.toContain("onPointerMove");
    expect(preview).not.toContain("onTouchMove");
  });
});
