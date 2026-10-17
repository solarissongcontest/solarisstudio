import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const participationShell = () => read("src/components/ParticipationServiceShell.tsx");
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

    expect(source).toContain("useV3RolloutProbe(platformResolved && focusedTaskCandidate)");
    expect(source).toContain("rollout.data?.enabled === true");
    expect(source).toContain("rollout.data.confirmationEnabled === true");
    expect(source).toContain("rollout.data.juryEnabled === true");
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

  it("removes duplicate global toolbar chrome only after focused chrome mounts", () => {
    const css = focusedCss();

    expect(css).toContain('body:has([data-v3-focused-task-shell]) .solaris-app-toolbar');
    expect(css).toContain("display: none");
    expect(css).not.toContain('body:has([data-v3-focused-task-boot]) .solaris-app-toolbar');
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
    const combined = `${participationShell()}\n${focusedShell()}\n${focusedCss()}`;
    expect(combined).not.toMatch(/https:\/\/[^\s"']+\.supabase\.co/i);
  });
});
