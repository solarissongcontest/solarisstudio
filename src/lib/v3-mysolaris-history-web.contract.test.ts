import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("MySolaris country History browser redesign", () => {
  it("shows a focused web edition list and one editor or add form at a time", () => {
    const source = read("src/components/mysolaris/modules/MySolarisCountryModule.tsx");
    expect(source).toContain('className="solaris-history-web-directory"');
    expect(source).toContain('className="solaris-history-web-list"');
    expect(source).toContain('className="solaris-history-web-row"');
    expect(source).toContain('className="solaris-history-web-back"');
    expect(source).toContain('myEntries.filter((group) => isAppMode || group.editionId === historyFocus)');
    expect(source).toContain('openHistoryFocus("add")');
    expect(source).toContain('isAppMode || historyFocus === "add"');
    expect(source).toContain('data-history-focused={focused ? "true" : undefined}');
  });

  it("restores browser Back/Forward and shareable edit URLs without changing PWA navigation", () => {
    const source = read("src/components/mysolaris/modules/MySolarisCountryModule.tsx");
    expect(source).toContain('if (section !== "history" || isAppMode) return;');
    expect(source).toContain('window.addEventListener("popstate", restoreHistoryFocus)');
    expect(source).toContain('window.addEventListener("hashchange", restoreHistoryFocus)');
    expect(source).toContain('window.history.pushState(');
    expect(source).toContain('#history-entry-');
    expect(source).toContain('focused={!isAppMode}');
    expect(source).toContain('open={focused ? true : undefined}');
  });

  it("preserves canonical save and account permission paths", () => {
    const source = read("src/components/mysolaris/modules/MySolarisCountryModule.tsx");
    expect(source).toContain('useMyCountryAccount()');
    expect(source).toContain('useSaveCountryEntry(country.id, organizerOverride)');
    expect(source).toContain('useSaveEntryListeningLinks(country.id, organizerOverride)');
    expect(source).toContain('await saveEntry.mutateAsync({');
    expect(source).toContain('await saveEntryLinks.mutateAsync({');
    expect(source).toContain('useCountryWorldProfile(country.id)');
    expect(source).not.toContain('supabase.from(');
  });

  it("keeps all composition changes off the installed PWA and supports keyboard focus", () => {
    const source = read("src/components/mysolaris/modules/MySolarisCountryModule.tsx");
    const css = read("src/styles/v3-mysolaris-history-editorial.css");
    expect(source).toContain('import "@/styles/v3-mysolaris-history-editorial.css"');
    expect(css).toContain('html:not([data-solaris-app]) .solaris-history-web-row');
    expect(css).toContain('.solaris-history-entry[data-history-focused="true"]');
    expect(css).toContain('min-height: 44px');
    expect(css).toContain(':focus-visible');
    expect(css).toContain('prefers-reduced-motion: reduce');
    expect(css).toContain('forced-colors: active');
  });
});
