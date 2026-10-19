import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Public V3 P25 Scorecharts", () => {
  it("loads only publication-gated index metadata through a server boundary", () => {
    const source = read("src/integrations/v3/scorecharts-source.server.ts");
    const fn = read("src/lib/v3-scorecharts.functions.ts");

    expect(fn).toContain('createServerFn({ method: "GET" })');
    expect(fn).toContain("loadV3ScorechartsBundle");
    expect(source).toContain("createConfirmationPublicRuntimeClient");
    expect(source).toContain('.from("editions")');
    expect(source).toContain('.from("shows")');
    expect(source).toContain("resolveShowPublication(show).detailed_voting === true");
    expect(source).not.toContain('.from("results")');
    expect(source).not.toContain("jury_ballots");
    expect(source).not.toContain("televote_ballots");
  });

  it("keeps the public Scorecharts index strictly read-only", () => {
    const combined = [
      read("src/integrations/v3/scorecharts-source.server.ts"),
      read("src/lib/v3-scorecharts.functions.ts"),
      read("src/lib/v3-scorecharts-runtime.ts"),
      read("src/lib/v3-scorecharts.ts"),
    ].join("\n");

    expect(combined).not.toContain(".insert(");
    expect(combined).not.toContain(".update(");
    expect(combined).not.toContain(".delete(");
    expect(combined).not.toContain(".upsert(");
    expect(combined).not.toContain("service_role");
  });

  it("uses Results server rollout authority and fails closed to the established route", () => {
    const gate = read("src/components/v3/V3ScorechartsGate.tsx");
    const route = read("src/routes/scorecharts/index.tsx");

    expect(gate).toContain("useV3EditionRolloutProbe");
    expect(gate).toContain("useV3RolloutProbe");
    expect(gate).toContain("rollout.data.resultsEnabled !== true");
    expect(gate).toContain("return <>{fallback}</>");
    expect(route).toContain("isAppMode");
    expect(route).toContain("<V3ScorechartsGate fallback={<LegacyScorechartsPage />} />");
    expect(route).toContain("return <LegacyScorechartsPage />");
  });

  it("keeps detailed matrices on the established publication-aware show result route", () => {
    const screen = read("src/components/v3/V3ScorechartsScreen.tsx");

    expect(screen).toContain('to="/shows/$showId"');
    expect(screen).toContain('search={{ tab: "matrix", from: "results" }}');
    expect(screen).toContain('data-v3-scorecharts-empty=""');
    expect(screen).toContain("No published scorecharts yet");
    expect(screen).not.toContain("jury_points");
    expect(screen).not.toContain("televote_points");
  });

  it("does not expose a browser-controlled Scorecharts rollout escape hatch", () => {
    const combined = [
      read("src/components/v3/V3ScorechartsGate.tsx"),
      read("src/routes/scorecharts/index.tsx"),
      read("src/lib/v3-scorecharts-runtime.ts"),
    ].join("\n");

    expect(combined).not.toContain("localStorage");
    expect(combined).not.toContain("sessionStorage");
    expect(combined).not.toContain("VITE_SOLARIS_APP_V3_SCORECHARTS");
    expect(combined).not.toContain("window.location.search");
  });
});
