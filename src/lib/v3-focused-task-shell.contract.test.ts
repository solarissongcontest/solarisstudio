import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Solaris Studio V3 focused critical-task shell architecture", () => {
  it("derives task chrome from the canonical app-screen registry", () => {
    const model = read("src/lib/v3-focused-task-chrome.ts");

    expect(model).toContain("resolveSolarisAppScreen");
    expect(model).toContain("screen.behavior.criticalTask");
    expect(model).toContain('screen.chrome.toolbar !== "focused"');
    expect(model).toContain('screen.chrome.tabbar !== "hidden"');
    expect(model).toContain("screen.hierarchy.parent");
  });

  it("keeps navigation-history authority outside the focused shell", () => {
    const component = read("src/components/v3/V3FocusedTaskShell.tsx");

    expect(component).toContain("chrome.backTo");
    expect(component).toContain("chrome.helpTo");
    expect(component).not.toContain("useNavigate");
    expect(component).not.toContain("useRouterState");
    expect(component).not.toContain("window.history");
    expect(component).not.toContain("popAppBackTarget");
    expect(component).not.toContain("peekAppBackTarget");
  });

  it("contains no global bottom navigation inside a critical task", () => {
    const component = read("src/components/v3/V3FocusedTaskShell.tsx");
    const css = read("src/styles/v3-focused-task-shell.css");

    expect(component).not.toContain("v3-bottom-nav");
    expect(component).not.toContain("Primary app navigation");
    expect(css).not.toContain("v3-bottom-nav");
  });

  it("preserves accessible Back and Help controls without stealing route heading or main ownership", () => {
    const component = read("src/components/v3/V3FocusedTaskShell.tsx");

    expect(component).toContain('aria-label={`Back to ${chrome.backLabel}`}');
    expect(component).toContain('aria-label={`Help for ${chrome.title}`}');
    expect(component).toContain("v3-focused-task-toolbar__title");
    expect(component).not.toMatch(/<h1[^>]*v3-focused-task-toolbar__title/);
    expect(component).toContain("data-v3-critical-task-content");
    expect(component).not.toMatch(/<main[^>]*v3-focused-task-content/);
  });

  it("keeps touch targets, safe areas and reduced-transparency fallback explicit", () => {
    const css = read("src/styles/v3-focused-task-shell.css");

    expect(css).toContain("min-width: 2.75rem");
    expect(css).toContain("min-height: 2.75rem");
    expect(css).toContain("env(safe-area-inset-top, 0px)");
    expect(css).toContain("env(safe-area-inset-bottom, 0px)");
    expect(css).toContain("prefers-reduced-transparency: reduce");
    expect(css).toContain("backdrop-filter: none");
  });

  it("blocks service-worker activation only while the critical shell is mounted", () => {
    const component = read("src/components/v3/V3FocusedTaskShell.tsx");

    expect(component).toContain("setAppUpdateBlocker");
    expect(component).toContain("clearAppUpdateBlocker");
    expect(component).toContain('const updateBlockerId = `v3-focused-task:${chrome.screenId}`');
    expect(component).toContain("return () => clearAppUpdateBlocker(updateBlockerId)");
  });

  it("keeps mutation, receipt and workflow truth outside shell presentation", () => {
    const component = read("src/components/v3/V3FocusedTaskShell.tsx");
    const model = read("src/lib/v3-focused-task-chrome.ts");
    const combined = `${component}\n${model}`;

    for (const forbidden of [
      "@supabase",
      "createClient(",
      "supabase.",
      "fetch(",
      "useMutation(",
      "useQuery(",
      "submitConfirmation",
      "submit_country_jury_ballot",
      "submit_vote_checked",
      "authoritativeReceipts",
      "idempotencyKey",
      "Date.now(",
    ]) {
      expect(combined).not.toContain(forbidden);
    }
  });

  it("does not introduce browser-local rollout or task eligibility decisions", () => {
    const combined = `${read("src/components/v3/V3FocusedTaskShell.tsx")}\n${read("src/lib/v3-focused-task-chrome.ts")}`;

    expect(combined).not.toContain("localStorage");
    expect(combined).not.toContain("sessionStorage");
    expect(combined).not.toContain("evaluateV3Rollout");
    expect(combined).not.toContain("capabilities.includes");
  });
});
