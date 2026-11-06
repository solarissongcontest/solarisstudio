import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const installedMore = source("src/components/app/AppMoreNavigation.tsx");
const publicShell = source("src/components/AppShell.tsx");

describe("V3 app navigation sheet dismissal and accessibility", () => {
  it("exposes a native, screen-reader labelled close control in installed-app More", () => {
    const moreHeader = installedMore.slice(
      installedMore.indexOf('className="solaris-app-more-header'),
      installedMore.indexOf('<nav\n        className="mt-5'),
    );
    expect(moreHeader).toContain("<SheetClose asChild>");
    expect(moreHeader).toContain('<button');
    expect(moreHeader).toContain('type="button"');
    expect(moreHeader).toContain('aria-label="Close More menu"');
    expect(moreHeader).toContain('size-11');
    expect(moreHeader).toContain('aria-hidden="true"');
  });

  it("closes the installed-app More sheet before the asynchronous sign-out redirect", () => {
    expect(installedMore).toMatch(
      /\{signedIn \? \(\s*<SheetClose asChild>\s*<button\s+type="button" onClick=\{onSignOut\}[\s\S]*?<\/button>\s*<\/SheetClose>/,
    );
    expect(publicShell).toContain('onSignOut={() => void signOut()}');
  });

  it("also dismisses the mobile web drawer on sign-out without duplicating auth logic", () => {
    expect(publicShell).toMatch(
      /<SheetClose asChild>\s*<button\s+type="button"\s+onClick=\{signOut\}[\s\S]*?Sign out\s*<\/button>\s*<\/SheetClose>/,
    );
    expect(publicShell).toContain("<Sheet open={menuOpen} onOpenChange={setMenuOpen}>");
    expect(publicShell).toContain("useEffect(() => setMenuOpen(false), [pathname])");
    expect(publicShell).toContain("await supabase.auth.signOut()");
  });
});
