import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = () =>
  readFileSync(resolve(process.cwd(), "src/lib/v3-shell-route-boundary.ts"), "utf8");

describe("Solaris Studio V3 shell route architecture", () => {
  it("reuses the canonical rollout evaluator and app screen registry", () => {
    const boundary = source();

    expect(boundary).toContain("evaluateV3Rollout");
    expect(boundary).toContain("resolveSolarisAppScreen");
    expect(boundary).toContain('from "./v3-rollout"');
    expect(boundary).toContain('from "@/lib/app-screen-registry"');
  });

  it("owns shell choice only and cannot redirect or mutate route ownership", () => {
    const boundary = source();

    expect(boundary).not.toContain("redirect(");
    expect(boundary).not.toContain("navigate(");
    expect(boundary).not.toContain("router.navigate");
    expect(boundary).not.toContain("window.location");
    expect(boundary).not.toContain("history.pushState");
    expect(boundary).toContain("Chooses shell chrome only");
    expect(boundary).toContain("never redirects or changes route ownership");
  });

  it("does not create a browser-controlled rollout escape hatch", () => {
    const boundary = source();

    expect(boundary).not.toContain("localStorage");
    expect(boundary).not.toContain("sessionStorage");
    expect(boundary).not.toContain("import.meta.env");
    expect(boundary).not.toContain("VITE_SOLARIS_V3_PREVIEW");
  });

  it("cannot acquire database/network/polling ownership", () => {
    const boundary = source();

    for (const forbidden of [
      "@supabase",
      "createClient(",
      "supabase.",
      "fetch(",
      "useQuery(",
      "useMutation(",
      "useEffect(",
      "setInterval(",
      "setTimeout(",
    ]) {
      expect(boundary).not.toContain(forbidden);
    }
  });

  it("keeps critical and immersive routes on existing chrome until matching V3 variants exist", () => {
    const boundary = source();

    expect(boundary).toContain("screen.behavior.criticalTask");
    expect(boundary).toContain('reason: "critical_task"');
    expect(boundary).toContain("screen.behavior.immersive");
    expect(boundary).toContain('reason: "immersive_screen"');
    expect(boundary).toContain('screen.chrome.tabbar !== "full"');
    expect(boundary).toContain('reason: "unsupported_tabbar"');
  });

  it("fails closed on unknown, auth/control and preview routes", () => {
    const boundary = source();

    expect(boundary).toContain('screen.id === "fallback"');
    expect(boundary).toContain('"/v3-preview"');
    expect(boundary).toContain('"/auth"');
    expect(boundary).toContain('"/admin"');
    expect(boundary).toContain('"/organizer"');
    expect(boundary).toContain('"/maintenance"');
  });
});
