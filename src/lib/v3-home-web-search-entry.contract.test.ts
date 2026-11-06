import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");

describe("V3 Home mobile-browser Search discovery", () => {
  const home = () => source("src/routes/index.tsx");
  const shell = () => source("src/components/AppShell.tsx");
  const palette = () => source("src/components/public/PublicCommandPalette.tsx");

  it("keeps installed Home under the existing server-authoritative cutover", () => {
    const route = home();
    expect(route).toContain('<V3PrimaryRouteGate surface="home" legacy={<LegacyHomePage />} />');
    expect(route).toContain("function LegacyHomePage()");
    expect(route).toContain("{!isAppMode ? (");
  });

  it("exposes canonical global Search directly in the narrow mobile browser Home header", () => {
    const route = home();
    const header = route.slice(
      route.indexOf('data-v3-home-web-search-entry=""') - 80,
      route.indexOf('data-v3-home-web-search-entry=""') + 130,
    );
    expect(header).toContain('className="lg:hidden"');
    expect(header).toContain("<PublicCommandPalette compact keyboardShortcut={false} />");
    expect(route).toContain('import { PublicCommandPalette } from "@/components/public/PublicCommandPalette"');
  });

  it("does not duplicate the desktop or installed global Search owner", () => {
    expect(shell()).toContain("<PublicCommandPalette access={access} />");
    expect(shell()).toContain('className="ml-auto hidden items-center gap-1 lg:flex"');
    expect(palette()).toContain('aria-label="Search Solaris Studio"');
    expect(palette()).toContain("keyboardShortcut = true");
    expect(palette()).toContain("if (!keyboardShortcut) return;");
    expect(palette()).toContain("}, [keyboardShortcut]);");
    expect(palette()).toContain('rpc("solaris_public_search"');
    expect(home()).not.toContain('rpc("solaris_public_search"');
  });
});
