import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const participationShell = () => read("src/components/ParticipationServiceShell.tsx");
const appToolbar = () => read("src/components/app/AppToolbar.tsx");
const focusedChrome = () => read("src/lib/v3-focused-task-chrome.ts");
const focusedShell = () => read("src/components/v3/V3FocusedTaskShell.tsx");
const focusedCss = () => read("src/styles/v3-focused-task-shell.css");
const registry = () => read("src/lib/app-screen-registry.ts");

describe("V3 focused participation shell adoption", () => {
  it("derives focused-task eligibility from the canonical screen registry", () => {
    const source = participationShell();

    expect(source).toContain("resolveSolarisAppScreen(pathname)");
    expect(source).toContain("screen.behavior.criticalTask");
    expect(source).toContain("resolveV3FocusedTaskChrome(pathname)");
    expect(source).not.toContain("pathname.startsWith(\"/jury-voting\")");
    expect(source).not.toContain("pathname.startsWith(\"/televoting\")");
    expect(source).not.toContain("pathname.startsWith(\"/next-in-line\")");
  });

  it("keeps the rollout fail-closed while preserving the legacy shell", () => {
    const source = participationShell();
    const rolloutAuthority = focusedChrome();

    expect(source).toContain("useV3RolloutProbe(platformResolved && focusedTaskCandidate)");
    expect(source).toContain("v3FocusedParticipationRouteEnabled(pathname, rollout.data)");
    expect(rolloutAuthority).toContain("rollout?.enabled !== true");
    expect(rolloutAuthority).toContain("rollout.confirmationEnabled === true");
    expect(rolloutAuthority).toContain("rollout.juryEnabled === true");
    expect(source).toContain('aria-label="Participation task navigation"');
    expect(source).toContain('className="participation-service-nav');
    expect(source).toContain("<PageHeader");
  });

  it("adopts focused chrome without moving workflow or mutation authority", () => {
    const source = participationShell();

    expect(source).toContain("<V3FocusedTaskShell chrome={chrome}>");
    expect(source).toContain('data-v3-participation-task-route={service}');
    expect(source).toContain("<V3ScreenHeader");
    expect(source).not.toContain("useMutation(");
    expect(source).not.toContain("supabase.");
    expect(source).not.toContain("submitCountry");
    expect(source).not.toContain("submitVote");
    expect(source).not.toContain("idempotencyKey");
  });

  it("does not introduce a nested main landmark inside the compatibility AppShell", () => {
    const source = participationShell();

    expect(source).toContain('className="v3-screen v3-participation-task-route-screen"');
    expect(source).not.toContain("<V3Screen className=\"v3-participation-task-route-screen\"");
    expect(source).not.toMatch(/<main[^>]*v3-participation-task-route-screen/);
  });

  it("removes duplicate global toolbar chrome through the same rollout authority", () => {
    const toolbar = appToolbar();
    const shell = participationShell();
    const css = focusedCss();

    expect(toolbar).toContain('screen.id === "participation.task" && screen.chrome.toolbar === "focused"');
    expect(toolbar).toContain("useV3RolloutProbe(participationFocusedTask)");
    expect(toolbar).toContain("v3FocusedParticipationRouteEnabled(");
    expect(shell).toContain("v3FocusedParticipationRouteEnabled(pathname, rollout.data)");
    expect(toolbar).toContain("participationRouteOwnsFocusedToolbar");
    expect(toolbar).toContain("if (routeOwnsFocusedToolbar) return null");
    expect(css).not.toContain(".solaris-app-toolbar");
  });

  it("preserves wide operational layouts while Entry can remain compact", () => {
    const shell = focusedShell();
    const css = focusedCss();

    expect(shell).toContain('contentWidth?: "standard" | "wide"');
    expect(shell).toContain('contentWidth = "standard"');
    expect(shell).toContain("data-v3-focused-task-width={contentWidth}");
    expect(css).toContain('data-v3-focused-task-width="wide"');
    expect(css).toContain(":has([data-v3-confirmation-route])");
    expect(css).toContain(":has([data-v3-participation-task-route])");
    expect(css).toContain("width: min(100%, 80rem)");
  });

  it("keeps all four canonical participation routes classified as focused tasks", () => {
    const source = registry();

    expect(source).toContain('/^\\/(confirmations|jury-voting|televoting|next-in-line)(\\/|$)/');
    expect(source).toContain('toolbar: "focused"');
    expect(source).toContain('tabbar: "hidden"');
    expect(source).toContain('offline: "online-required"');
    expect(source).toContain("criticalTask: true");
  });

  it("does not add a hosted Supabase endpoint to navigation presentation", () => {
    const combined = `${participationShell()}\n${appToolbar()}\n${focusedChrome()}\n${focusedShell()}\n${focusedCss()}`;
    expect(combined).not.toMatch(/https:\/\/[^\s"']+\.supabase\.co/i);
  });
});
