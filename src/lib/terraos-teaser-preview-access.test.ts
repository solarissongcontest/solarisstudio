import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  isNotFound,
} from "@tanstack/react-router";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { requireTerraOsTeaserMaintenance } from "./terraos-teaser-preview-access";

describe("maintenance-only teaser route authority", () => {
  it("allows the fixture renderer while maintenance is active", () => {
    expect(requireTerraOsTeaserMaintenance(true)).toBeUndefined();
  });

  it("throws the router's actual 404 boundary after launch rather than exposing fixtures", () => {
    let rejected = false;
    try {
      requireTerraOsTeaserMaintenance(false);
    } catch (error) {
      rejected = true;
      expect(isNotFound(error)).toBe(true);
    }
    expect(rejected).toBe(true);
  });

  it("produces an actual router 404 before loading any fixture after launch", async () => {
    let fixtureLoaded = false;
    const root = createRootRoute();
    const route = createRoute({
      getParentRoute: () => root,
      path: "/terraos-teaser-preview",
      beforeLoad: () => requireTerraOsTeaserMaintenance(false),
      loader: () => {
        fixtureLoaded = true;
      },
    });
    const router = createRouter({
      routeTree: root.addChildren([route]),
      history: createMemoryHistory({ initialEntries: ["/terraos-teaser-preview"] }),
    });
    await router.load();
    expect(router.state.statusCode).toBe(404);
    expect(fixtureLoaded).toBe(false);
  });

  it.each(["VITE_SUPABASE_URL", "LOCAL_SUPABASE_URL"])(
    "rejects inherited hosted %s before loading the built Worker",
    (key) => {
      const result = spawnSync(
        process.execPath,
        ["--env-file=/dev/null", "run", "scripts/check-v3-teaser-cutover.ts"],
        {
          encoding: "utf8",
          env: { ...process.env, [key]: "https://hosted.invalid" },
        },
      );
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("Refusing release preflight against missing/non-local API");
      expect(result.stdout).not.toContain('"passed": true');
    },
  );
});
