import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = () =>
  readFileSync(
    resolve(process.cwd(), "src/routes/_authenticated/my-solaris/tasks.tsx"),
    "utf8",
  );

describe("Public V3 legacy task-route cutover", () => {
  it("hands installed-app V3 task ownership to Participate", () => {
    const route = source();

    expect(route).toContain('createFileRoute("/_authenticated/my-solaris/tasks")');
    expect(route).toContain("useSolarisApp()");
    expect(route).toContain("useV3RolloutProbe(platformResolved && isAppMode)");
    expect(route).toContain("rollout.data?.enabled === true");
    expect(route).toContain("<Navigate to={NAV_TARGETS.participate} replace />");
  });

  it("keeps the proven legacy task workspace when V3 is unavailable", () => {
    const route = source();

    expect(route).toContain("MySolarisTasksModule");
    expect(route).toContain("return <MySolarisTasksModule />");
    expect(route).not.toContain("beforeLoad");
  });

  it("fails safely before platform or app rollout ownership is resolved", () => {
    const route = source();

    expect(route).toContain("!platformResolved || (isAppMode && rollout.isLoading)");
    expect(route).toContain("Opening Participate…");
    expect(route).toContain('role="status"');
    expect(route).toContain('aria-live="polite"');
  });

  it("keeps the compatibility route private from indexing", () => {
    const route = source();

    expect(route).toContain('title: "Participant tasks — Solaris Studio"');
    expect(route).toContain('{ name: "robots", content: "noindex" }');
  });
});
