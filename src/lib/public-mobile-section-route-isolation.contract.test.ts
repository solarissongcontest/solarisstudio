import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appShell = readFileSync("src/components/AppShell.tsx", "utf8");
const disclosure = readFileSync("src/components/public/PublicMobileSectionNav.tsx", "utf8");
const regression = readFileSync("e2e/public-section-navigation.e2e.ts", "utf8");

describe("mobile browser section disclosure route identity", () => {
  it("remounts the disclosure for each pathname rather than reusing an old route's state", () => {
    // The old pathname-dependent passive effect can run after a click on the
    // next route and undo that click. A keyed instance cannot inherit it.
    expect(appShell).toContain("<PublicMobileSectionNav key={pathname} pathname={pathname} />");
    expect(appShell).not.toContain("<PublicMobileSectionNav pathname={pathname} />");
    // A redundant after-mount close can still race a fast click on the new route.
    expect(disclosure).not.toContain('useEffect(() => setOpen(false), [pathname])');
  });

  it("keeps keyboard, outside tap and resize dismissal safety on each keyed instance", () => {
    expect(disclosure).toContain('event.key !== "Escape" || !open');
    expect(disclosure).toContain('window.matchMedia("(min-width: 768px)")');
    expect(disclosure).toContain('document.addEventListener("pointerdown", onOutsidePointerDown)');
    expect(disclosure).toContain("onNavigate={() => setOpen(false)}");
  });

  it("retains a real browser regression for immediate disclosure use after a navigation", () => {
    expect(regression).toContain("await recordsLink.click()");
    expect(regression).toContain('await nav.locator(".public-mobile-section-trigger").click()');
    expect(regression).toContain(
      'await expect(nav.locator(".public-mobile-section-trigger")).toHaveAttribute("aria-expanded", "true")',
    );
    expect(regression).toContain('await page.goBack({ waitUntil: "domcontentloaded" })');
  });
});
