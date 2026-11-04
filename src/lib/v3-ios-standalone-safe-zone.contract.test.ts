import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("V3 installed iOS top system safe zone", () => {
  const css = source("src/styles/v3-shared-public-shell-completion.css");

  it("reserves system exclusion and comfort separately in the shared V3 header", () => {
    expect(css).toContain("--v3-top-system-safe: env(safe-area-inset-top, 0px)");
    expect(css).toContain("--v3-top-safe-comfort: 6px");
    expect(css).toMatch(
      /\.v3-top-context\s*\{[\s\S]*?min-height: calc\([\s\S]*?var\(--v3-top-system-safe\)[\s\S]*?var\(--v3-top-safe-comfort\)/,
    );
    expect(css).toMatch(
      /\.v3-top-context\s*\{[\s\S]*?padding:\s*calc\(var\(--v3-top-system-safe\) \+ var\(--v3-top-safe-comfort\)\)/,
    );
  });

  it("uses the pre-hydration canonical runtime identity, never a narrow-screen guess", () => {
    const root = source("src/routes/__root.tsx");
    const runtime = source("src/components/app/AppRuntime.tsx");

    expect(root).toContain('root.dataset.solarisRuntime = "standalone"');
    expect(root).toContain('navigator.standalone === true');
    expect(runtime).toContain("root.dataset.solarisRuntime = platform.mode");
    expect(css).toContain('html[data-solaris-runtime="standalone"] [data-solaris-v3]');
    expect(css).not.toMatch(/@media\s*\(max-width:[^)]*\)\s*\{\s*html\[data-solaris-runtime="standalone"\]/);
  });

  it("preserves pre-hydration standalone identity until platform detection is authoritative", () => {
    const runtime = source("src/components/app/AppRuntime.tsx");
    const root = source("src/routes/__root.tsx");

    expect(root).toContain('root.dataset.solarisRuntime = "standalone"');
    expect(runtime).toMatch(
      /useEffect\(\(\) => \{\s*\/\/ The SSR head bootstrap marks installed launches[\s\S]*?if \(!platformResolved\) return;\s*const root = document\.documentElement;\s*root\.dataset\.solarisRuntime = platform\.mode;/,
    );
    expect(runtime).toContain(
      "[connectivity.status, lifecycle.phase, platform.isAppMode, platform.mode, platformResolved]",
    );
  });

  it("fails safe on iOS standalone with an absent top inset without raising mobile-web or desktop headers", () => {
    const guardedRule =
      /@supports \(-webkit-touch-callout: none\)\s*\{[\s\S]*?@media \(pointer: coarse\) and \(orientation: portrait\)\s*\{\s*html\[data-solaris-runtime="standalone"\] \[data-solaris-v3\]\s*\{\s*--v3-top-system-safe: max\(env\(safe-area-inset-top, 0px\), 60px\);/;
    expect(css).toMatch(guardedRule);
    expect(css).toMatch(
      /@media \(pointer: coarse\) and \(orientation: landscape\)[\s\S]*?--v3-top-system-safe: max\(env\(safe-area-inset-top, 0px\), 20px\)/,
    );
    expect(css).not.toContain("html[data-solaris-runtime=\"web\"] [data-solaris-v3]");
  });
});
