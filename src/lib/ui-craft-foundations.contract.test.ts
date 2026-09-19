import { readdirSync, readFileSync, statSync } from "node:fs";
import { relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = resolve(directory, entry);
    return statSync(path).isDirectory() ? sourceFiles(path) : [path];
  });
}

function productSourceFiles() {
  return sourceFiles(resolve(process.cwd(), "src"))
    .filter((path) => /\.(?:css|ts|tsx)$/.test(path))
    .filter((path) => !/\.(?:test|spec)\.(?:ts|tsx)$/.test(path));
}

describe("Solaris UI craft foundations", () => {
  it("keeps one global toast host and enables the full iOS safe-area viewport", () => {
    const root = source("src/routes/__root.tsx");
    expect(root).toContain('import { Toaster } from "../components/ui/sonner"');
    expect(root).toContain("viewport-fit=cover");
    expect(root.match(/<Toaster\s*\/>/g)).toHaveLength(1);
  });

  it("keeps public and Organizer drawers on the accessible shared Sheet primitive", () => {
    const appShell = source("src/components/AppShell.tsx");
    const adminUi = source("src/components/admin/AdminUI.tsx");
    const sheet = source("src/components/ui/sheet.tsx");

    expect(appShell).toContain("SheetContent");
    expect(appShell).toContain('side="right"');
    expect(appShell).not.toContain("document.body.style.overflow");
    expect(adminUi).toContain('side="responsive"');
    expect(adminUi).not.toContain("createPortal");
    expect(adminUi).not.toContain("document.body.style.overflow");
    expect(sheet).toContain("data-solaris-sheet");
    expect(sheet).toContain("slide-in-from-bottom");
    expect(sheet).toContain("slide-in-from-right");
  });

  it("does not animate every CSS property anywhere in product source", () => {
    const offenders = productSourceFiles()
      .filter((path) => readFileSync(path, "utf8").includes("transition-all"))
      .map((path) => relative(process.cwd(), path));

    expect(offenders).toEqual([]);
  });

  it("does not wrap full-color design tokens in hsl() anywhere in product source", () => {
    const offenders = productSourceFiles()
      .filter((path) => readFileSync(path, "utf8").includes("hsl(var(--"))
      .map((path) => relative(process.cwd(), path));

    expect(offenders).toEqual([]);
  });

  it("keeps persistent navigation and guidance labels above decorative microtype", () => {
    const files = [
      "src/components/mysolaris/MySolarisWorkspaceNav.tsx",
      "src/components/OfficialAnnouncementFeed.tsx",
      "src/components/rules/RuleDecisionStrip.tsx",
      "src/components/rules/RulebookVersionBanner.tsx",
      "src/components/rules/RuleInterpretationsPanel.tsx",
      "src/components/CountryWorldOverview.tsx",
    ];

    for (const path of files) {
      expect(source(path), path).not.toContain("text-[9px]");
    }
  });

  it("keeps high-visibility status and wayfinding labels above decorative microtype", () => {
    const files = [
      "src/routes/index.tsx",
      "src/routes/shows/index.tsx",
      "src/routes/editions/index.tsx",
      "src/routes/countries/index.tsx",
      "src/routes/jury-voting.tsx",
      "src/components/rules/RulesExperience.tsx",
      "src/routes/_authenticated/admin/integrity-disclosure.tsx",
      "src/components/country/CountryNationalFinals.tsx",
    ];

    for (const path of files) {
      expect(source(path), path).not.toContain("text-[8px]");
    }
    expect(source("src/routes/_authenticated/admin/integrity-disclosure.tsx"))
      .not.toContain("text-[9px]");
  });

  it("keeps operational rules and integrity controls free of decorative hover lift", () => {
    const files = [
      "src/components/rules/RulesExperience.tsx",
      "src/components/integrity/IntegrityCentre.tsx",
      "src/components/integrity/TrustIntegrityHub.tsx",
    ];

    for (const path of files) {
      expect(source(path), path).not.toContain("hover:-translate-y");
    }
  });

  it("separates inline validation from transient async mutation feedback", () => {
    const myPassword = source("src/components/MySolarisPasswordPanel.tsx");
    const adminPassword = source("src/components/admin/AdminCountryPasswordPanel.tsx");
    const hodHistory = source("src/components/CountryHodHistoryPanel.tsx");

    expect(myPassword).toContain("toast.promise");
    expect(adminPassword).toContain("toast.promise");
    expect(hodHistory).toContain("toast.promise");
    expect(hodHistory).not.toContain("setIdentityMessage");
    expect(hodHistory).not.toContain("setMessage");
    expect(myPassword).toContain("Password must be at least 6 characters.");
    expect(adminPassword).toContain("The passwords do not match.");
  });

  it("gives core buttons immediate press feedback without forcing motion on reduced-motion users", () => {
    const button = source("src/components/ui/button.tsx");
    expect(button).toContain("active:scale-[0.97]");
    expect(button).toContain("motion-reduce:active:scale-100");
  });

  it("keeps the unified palette in one visual layer and shared motion vocabulary in foundations", () => {
    const styles = source("src/styles.css");
    const unified = source("src/unified-design.css");

    expect(styles).toContain("--motion-fast: 120ms");
    expect(styles).toContain("--motion-ui: 180ms");
    expect(styles).toContain("--motion-panel: 240ms");
    expect(styles).not.toContain("--background: oklch(0.115 0.045 250)");
    expect(unified).toContain("--background: oklch(0.125 0.027 258)");
  });

  it("uses valid full-color tokens in the public desktop layout", () => {
    const layouts = source("src/desktop-public-layouts.css");
    expect(layouts).not.toContain("hsl(var(--");
    expect(layouts).toContain("color-mix(in srgb");
  });

  it("routes the mobile Explore destination to a real Explore hub", () => {
    const appShell = source("src/components/AppShell.tsx");
    const publicNavigation = source("src/lib/public-navigation.ts");
    const explore = source("src/routes/explore/index.tsx");

    expect(appShell).toContain("PUBLIC_GLOBAL_AREAS.map");
    expect(publicNavigation).toContain('to: "/explore"');
    expect(explore).toContain('createFileRoute("/explore/")');
  });

  it("uses direct mobile navigation labels rather than naming interface mechanisms", () => {
    const organizer = source("src/components/admin/AdminFrame.tsx");
    expect(organizer).toContain('label: "More"');
    expect(organizer).not.toContain('label: "Menu"');
  });

  it("keeps reduced motion useful rather than globally deleting all transition feedback", () => {
    const styles = source("src/styles.css");
    const accessibility = source("src/accessibility.css");

    expect(styles).not.toContain("transition-duration: 0.001ms !important");
    expect(accessibility).toContain("solaris-reduced-fade-in");
    expect(accessibility).toContain("transition-property: color, background-color, border-color, opacity, box-shadow, filter");
    expect(accessibility).toContain("var(--ease-out, ease-out)");
  });

  it("keeps scoreboard movement meaningful and avoids near-zero award materialization", () => {
    const scoreboard = source("src/components/Scoreboard.tsx");
    expect(scoreboard).toContain("useReducedMotion");
    expect(scoreboard).toContain("0.92");
    expect(scoreboard).toContain("0.96");
    expect(scoreboard).not.toContain("isTwelve ? 0.2 : 0.6");
  });
});
