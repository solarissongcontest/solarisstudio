import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("V3 Results production cutover", () => {
  it("decides the V3 route before legacy archive-wide hooks can mount", () => {
    const route = source("src/routes/results/index.tsx");

    expect(route).toContain("V3ResultsRouteGate");
    expect(route).toContain("legacy={<LegacyResultsOverviewPage />}");
    expect(route).toContain("function LegacyResultsOverviewPage() {");
    expect(route.indexOf("function LegacyResultsOverviewPage() {")).toBeLessThan(
      route.indexOf("const editionsQuery = useEditions()"),
    );
  });

  it("requires app mode, the server Results flag and Results shell ownership", () => {
    const gate = source("src/components/v3/V3ResultsRouteGate.tsx");

    expect(gate).toContain("platformResolved && isAppMode");
    expect(gate).toContain("rollout.data?.resultsEnabled === true");
    expect(gate).toContain('shell.rootTab !== "results"');
    expect(gate).toContain('activeArea="results"');
    expect(gate).toContain("data-v3-results-boot");
  });

  it("uses one bounded server projection and resolves private disclosure server-side", () => {
    const server = source("src/integrations/v3/results-source.server.ts");

    expect(server).toContain('rpc("v3_public_results_root")');
    expect(server).toContain('.from("notification_preferences")');
    expect(server).toContain('.select("spoiler_free")');
    expect(server).toContain('.from("country_accounts")');
    expect(server).toContain('context.hideSpoilers ? "withheld" : "revealed"');
    expect(server).not.toMatch(/useAllResults|useAllShows|useAllParticipants|useCountries/);
  });

  it("ships the Results rollout disabled and keeps publication filtering in Postgres", () => {
    const migration = source(
      "supabase/migrations/20261013140000_v3_results_root_cutover.sql",
    );

    expect(migration).toContain("'solaris_app_v3_results'");
    expect(migration).toMatch(/'solaris_app_v3_results',\s*false,/s);
    expect(migration).toContain("create or replace function public.v3_public_results_root()");
    expect(migration).toContain("where s.published = true");
    expect(migration).toContain("where cs.results_published = true");
    expect(migration).toContain("'withdrawn', 'disqualified'");
    expect(migration).toContain("grant execute on function public.v3_public_results_root() to anon, authenticated");
  });

  it("preserves the permanent local-Supabase Browser Audit isolation guards", () => {
    const playwright = source("playwright.config.ts");
    const workflow = source(".github/workflows/browser-audit.yml");

    expect(playwright).toContain("assertPlaywrightSupabaseIsolation()");
    expect(playwright).toContain("Refusing non-local Supabase endpoint");
    expect(workflow).toContain("Start isolated local Supabase for browser audit");
    expect(workflow).toContain("E2E_SUPABASE_URL");
  });
});
