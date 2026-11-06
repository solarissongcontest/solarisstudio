import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (file: string) =>
  readFileSync(resolve(process.cwd(), file), "utf8");

describe("Public Scorecharts published-data recovery", () => {
  it("renders a safe loading or unavailable state before the disabled-rollout fallback", () => {
    const gate = read("src/components/v3/V3ScorechartsGate.tsx");
    const errorBranch = gate.indexOf("if (loading || unavailable)");
    const explicitDisabledBranch = gate.indexOf(
      "if (rollout.data.enabled !== true || rollout.data.resultsEnabled !== true)",
    );

    expect(errorBranch).toBeGreaterThan(-1);
    expect(explicitDisabledBranch).toBeGreaterThan(errorBranch);
    expect(gate).toContain(
      "const unavailable = bundle.isError || !bundle.data || rollout.isError || !rollout.data",
    );
    expect(gate).toContain("data-v3-scorecharts-authority-unavailable={!loading");
    expect(gate).toContain("No voting breakdown is shown");
    expect(gate.match(/return <>{fallback}<\/>;/g)?.length).toBe(1);
  });

  it("retries only the failing canonical source, never an archive-wide query", () => {
    const gate = read("src/components/v3/V3ScorechartsGate.tsx");
    const runtime = read("src/lib/v3-scorecharts-runtime.ts");

    expect(gate).toContain("disabled={retrying}");
    expect(gate).toContain("if (bundle.isError || !bundle.data) void bundle.refetch()");
    expect(gate).toContain("else void rollout.refetch()");
    expect(gate).toContain("Retry official scorecharts");
    expect(gate).toContain("Retrying scorecharts…");
    expect(gate).not.toContain("useResults(");
    expect(gate).not.toContain("useAllResults(");
    expect(runtime).toContain("retry: false");
    expect(runtime).not.toContain("refetchInterval");
  });

  it("preserves server-owned Results rollout and published details navigation", () => {
    const gate = read("src/components/v3/V3ScorechartsGate.tsx");
    const screen = read("src/components/v3/V3ScorechartsScreen.tsx");
    const route = read("src/routes/scorecharts/index.tsx");

    expect(gate).toContain("useV3EditionRolloutProbe");
    expect(gate).toContain("useV3RolloutProbe");
    expect(gate).toContain("rollout.data.resultsEnabled !== true");
    expect(gate).toContain("return <>{fallback}</>");
    expect(gate).toContain("<V3ScorechartsScreen");
    expect(screen).toContain('to="/shows/$showId"');
    expect(route).toContain("isAppMode");
    expect(route).toContain("LegacyScorechartsPage");
  });
});
