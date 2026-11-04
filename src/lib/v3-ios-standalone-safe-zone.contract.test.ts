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
      "[platform.isAppMode, platform.mode, platformResolved]",
    );
    expect(runtime).toMatch(
      /root\.dataset\.solarisRuntime = platform\.mode;[\s\S]*?\}, \[platform\.isAppMode, platform\.mode, platformResolved\]\);/,
    );
    expect(runtime).toMatch(
      /root\.dataset\.solarisConnectivity = connectivity\.status;[\s\S]*?\}, \[connectivity\.status, lifecycle\.phase\]\);/,
    );
  });

  it("extends the same safe system boundary to legacy installed app toolbar", () => {
    const legacyCss = source("src/styles/app-shell.css");
    expect(legacyCss).toContain("--solaris-app-safe-top: env(safe-area-inset-top)");
    expect(legacyCss).toContain("--solaris-app-safe-top-comfort: 6px");
    expect(legacyCss).toContain(
      'html[data-solaris-runtime="standalone"]',
    );
    expect(legacyCss).toMatch(
      /@media \(pointer: coarse\) and \(orientation: portrait\)[\s\S]*?--solaris-app-safe-top: max\(env\(safe-area-inset-top, 0px\), 60px\)/,
    );
    expect(legacyCss).toMatch(
      /@media \(pointer: coarse\) and \(orientation: landscape\)[\s\S]*?--solaris-app-safe-top: max\(env\(safe-area-inset-top, 0px\), 20px\)/,
    );
    expect(
      legacyCss.match(/padding-top: calc\(var\(--solaris-app-safe-top\) \+ var\(--solaris-app-safe-top-comfort\)\);/g),
    ).toHaveLength(2);
    expect(legacyCss).not.toContain("padding-top: env(safe-area-inset-top);");
  });

  it("keeps focused participation and Confirmation toolbar/focus below the same safe boundary", () => {
    const focusedCss = source("src/styles/v3-focused-task-shell.css");
    expect(focusedCss).toContain(
      "min-height: calc(4rem + var(--solaris-app-safe-top));",
    );
    expect(focusedCss).toContain(
      "calc(var(--solaris-app-safe-top) + 0.45rem)",
    );
    expect(focusedCss).toContain(
      "scroll-margin-block-start: calc(4.75rem + var(--solaris-app-safe-top));",
    );
    expect(focusedCss).not.toContain("calc(env(safe-area-inset-top)");
  });

  it("positions offline and reconnect status below the safe toolbar, not the raw unreliable env inset", () => {
    const appCss = source("src/styles/app-shell.css");
    const reconnect = source("src/components/app/AppReconnectReconciler.tsx");
    const offset =
      "calc(var(--solaris-app-safe-top) + var(--solaris-app-toolbar-height) + var(--solaris-app-safe-top-comfort) + .45rem)";
    expect(appCss).toContain("top: " + offset + ";");
    expect(reconnect).toContain('top: "' + offset + '"');
    expect(reconnect).not.toContain("top: \"calc(env(safe-area-inset-top)");
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
