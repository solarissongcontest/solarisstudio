import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("installed app adaptive layout", () => {
  it("switches iPad-sized installed apps to a stable side rail", () => {
    const tabs = source("src/components/app/AppTabBar.tsx");
    const css = source("src/styles/app-shell.css");
    expect(tabs).toContain('(min-width: 900px)');
    expect(tabs).toContain('data-layout={railMode ? "rail" : "bar"}');
    expect(tabs).toContain("railMode ||");
    expect(css).toContain("Installed iPad / large-screen rail");
    expect(css).toContain("@media (display-mode: standalone) and (min-width: 900px)");
    expect(css).toContain("grid-template-columns: 1fr");
  });

  it("keeps mobile touch targets and reduced-motion fallbacks explicit", () => {
    const css = source("src/styles/app-shell.css");
    expect(css).toContain("min-height: 3.7rem");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain("@media (prefers-reduced-transparency: reduce)");
  });

  it("sends organizers straight to the operational queue from the app utility sheet", () => {
    const more = source("src/components/app/AppMoreNavigation.tsx");
    expect(more).toContain('to="/admin/action-center"');
  });
});
