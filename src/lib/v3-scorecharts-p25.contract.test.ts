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

  it("keeps edition and search filters shareable while constraining them to public index items", () => {
    const gate = read("src/components/v3/V3ScorechartsGate.tsx");
    const screen = read("src/components/v3/V3ScorechartsScreen.tsx");

    expect(gate).toContain("useRouterState");
    expect(gate).toContain("scorechartsSearchNomination(search)");
    expect(gate).toContain("validEditionSlugs.has(nomination.editionSlug)");
    expect(gate).toContain('to: "/scorecharts"');
    expect(gate).toContain("edition: editionSlug || undefined");
    expect(gate).toContain("q: bounded || undefined");
    expect(gate).toContain("replace: true");
    expect(screen).toContain('data-v3-scorecharts-filters=""');
    expect(screen).toContain("item.editionSlug !== selectedEditionSlug");
    expect(screen).toContain("No scorecharts match these filters");
    expect(screen).toContain("only narrow the already publication-approved scorechart index");
  });

  it("preserves spaces in the controlled URL search value and trims only for filtering", () => {
    const gate = read("src/components/v3/V3ScorechartsGate.tsx");
    const screen = read("src/components/v3/V3ScorechartsScreen.tsx");

    expect(gate).toContain("values.q.slice(0, MAX_SCORECHART_QUERY_LENGTH)");
    expect(gate).not.toContain("values.q.trim().slice");
    expect(screen).toContain("query.trim().toLocaleLowerCase()");
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
