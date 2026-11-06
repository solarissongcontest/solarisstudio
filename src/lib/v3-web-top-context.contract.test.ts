import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("V3 three-experience top-context composition", () => {
  it("never renders the installed PWA top context as the mobile or desktop browser masthead", () => {
    const shell = source("src/components/v3/V3AppShell.tsx");
    expect(shell).toContain('const { isAppMode, platformResolved } = useSolarisApp()');
    expect(shell).toContain("!platformResolved ? null : isAppMode ? (");
    expect(shell).toContain("<V3TopContext edition={editionLabel} phase={phaseLabel} actions={shellActions} />");
    expect(shell).toContain("<V3WebTopContext edition={editionLabel} phase={phaseLabel} actions={shellActions} />");
    expect(shell).toContain('data-v3-shell-experience={!platformResolved ? "resolving" : isAppMode ? "app" : "web"}');
  });

  it("gives the browser semantic branded navigation without an app-style sticky masthead", () => {
    const web = source("src/components/v3/V3WebTopContext.tsx");
    const css = source("src/styles/v3-web-top-context.css");
    expect(web).toContain('data-v3-website-header=""');
    expect(web).toContain('aria-label="Solaris Studio home"');
    expect(web).toContain('to="/"');
    expect(web).toContain('aria-label={`${edition}${phase ? `, ${phase}` : ""}`}');
    expect(css).toContain('min-height: 44px');
    expect(css).toContain('grid-template-areas: "brand actions" "context context"');
    expect(css).toContain('@media (min-width: 720px)');
    expect(css).toContain('@media (min-width: 1024px)');
    expect(css).toContain('--v3-top-context-obstruction: 0px');
    expect(css).toContain('.v3-desktop-primary-nav');
    expect(css).toContain('top: 0;');
    expect(css).not.toContain('position: fixed');
    expect(css).not.toContain('backdrop-filter');
  });
});
