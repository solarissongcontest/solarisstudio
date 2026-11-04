import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("V3 top system safe zone for all experience families", () => {
  const safeCss = source("src/styles/v3-shared-public-shell-completion.css");
  const runtime = source("src/components/app/AppRuntime.tsx");

  it("reserves the physical top system inset separately from semantic chrome", () => {
    expect(safeCss).toContain("--v3-top-system-safe: env(safe-area-inset-top, 0px)");
    expect(safeCss).toContain("--v3-top-safe-comfort: 6px");
    expect(safeCss).toContain("var(--v3-top-system-safe) + var(--v3-top-safe-comfort)");
    expect(safeCss).toContain("[data-solaris-v3] .v3-top-context");
  });

  it("defends iOS standalone portrait before and after runtime hydration", () => {
    expect(safeCss).toContain("@supports (-webkit-touch-callout: none)");
    expect(safeCss).toContain("@media (orientation: portrait)");
    expect(safeCss).toContain("@media (display-mode: standalone)");
    expect(safeCss).toContain(
      'html[data-solaris-runtime="standalone"] [data-solaris-v3]',
    );
    expect(safeCss.match(/max\(env\(safe-area-inset-top, 0px\), 59px\)/g)?.length).toBe(2);
    expect(runtime).toContain("root.dataset.solarisRuntime = platform.mode");
  });

  it("does not infer app identity from a narrow viewport", () => {
    const fallback = safeCss.slice(
      safeCss.indexOf("@supports (-webkit-touch-callout: none)"),
      safeCss.indexOf("/* Keep the physical system exclusion region"),
    );
    expect(fallback).not.toContain("max-width");
    expect(fallback).not.toContain("min-width");
    expect(fallback).not.toContain("data-solaris-app-boot");
  });
});
