import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  DEFAULT_SOLARIS_FEATURE_RULES,
  SOLARIS_FEATURE_FLAGS,
} from "./feature-flags";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const migration = () =>
  read("supabase/migrations/20261013010000_v3_scoreboard_rollout_flag.sql");
const previousMigration = () =>
  read("supabase/migrations/20261012014000_v3_confirmation_rollout_flag.sql");
const probe = () => read("src/integrations/v3/rollout-probe.server.ts");
const stage = () => read("src/components/ScoreboardStage.tsx");
const presentation = () =>
  read("src/components/v3/V3ScoreboardPresentation.tsx");
const scoreboardSource = () =>
  read("src/integrations/v3/scoreboard-source.server.ts");
const scoreboardFunctions = () => read("src/lib/v3-scoreboard.functions.ts");
const scoreboardRuntime = () => read("src/lib/v3-scoreboard-runtime.ts");

function constrainedFlagKeys(source: string) {
  const constraint = source.match(
    /add constraint studio2_feature_flags_key_check check\s*\(\s*key in \(([\s\S]*?)\)\s*\)/,
  );
  if (!constraint) return [];
  return [...constraint[1].matchAll(/'([^']+)'/g)].map((match) => match[1]);
}

describe("V3 Scoreboard cutover", () => {
  it("registers an independent scoreboard flag and keeps it disabled by default", () => {
    expect(SOLARIS_FEATURE_FLAGS).toContain("solaris_app_v3_scoreboard");
    expect(DEFAULT_SOLARIS_FEATURE_RULES.solaris_app_v3_scoreboard).toEqual({
      enabled: false,
    });

    const sql = migration();
    expect(sql).toContain("'solaris_app_v3_scoreboard'");
    expect(sql).toContain("on conflict (key) do nothing");
    expect(sql.slice(sql.indexOf("values ("))).toContain("false,");
  });

  it("extends the persisted feature vocabulary without deleting an existing key", () => {
    const before = constrainedFlagKeys(previousMigration());
    const after = constrainedFlagKeys(migration());

    expect(before.length).toBeGreaterThan(0);
    expect(before.filter((key) => !after.includes(key))).toEqual([]);
    expect(after).toContain("solaris_app_v3");
    expect(after).toContain("solaris_app_v3_confirmation");
    expect(after).toContain("solaris_app_v3_scoreboard");
    expect(new Set(after).size).toBe(after.length);
  });

  it("evaluates scoreboard rollout on the server and fails the slice closed", () => {
    const source = probe();

    expect(source).toContain('p_key: "solaris_app_v3_scoreboard"');
    expect(source).toContain("scoreboardEnabled: false");
    expect(source).toContain(
      "enabled && !scoreboardFlag.error && scoreboardFlag.data === true",
    );
  });

  it("limits V3 scoreboard presentation to installed-app Show routes", () => {
    const source = stage();

    expect(source).toContain("useSolarisApp");
    expect(source).toContain("useV3RolloutProbe");
    expect(source).toContain("/^\\/shows\\/([^/]+)\\/?$/");
    expect(source).toContain("const publicShowId = showRouteMatch?.[1] ?? null");
    expect(source).toContain("rollout.data?.scoreboardEnabled === true");
    expect(source).toContain("useV3ScoreboardBundle(publicShowId, v3ScoreboardEnabled)");
    expect(source).toContain("<V3ScoreboardPresentation");
  });

  it("reads official V3 Scoreboard rank and scores only from the immutable published Result snapshot", () => {
    const source = scoreboardSource();

    expect(source).toContain("loadV3PublishedResultSnapshot(showId)");
    expect(source).toContain('publication: "hidden"');
    expect(source).toContain('publication: "published"');
    expect(source).toContain("row.totalPoints");
    expect(source).toContain("row.finalRank");
    expect(source).toContain("snapshot.availability.jury");
    expect(source).toContain("snapshot.availability.televote");
    expect(source).not.toContain('.from("results")');
    expect(source).not.toContain("public_safe_participants");
  });

  it("fails closed rather than manufacturing incomplete published split scores", () => {
    const source = scoreboardSource();

    expect(source).toContain("Published Scoreboard Jury split is incomplete");
    expect(source).toContain("Published Scoreboard Televote split is incomplete");
    expect(source).toContain("Published Scoreboard identity could not be resolved");
    expect(source).not.toContain("row.juryPoints ?? 0");
    expect(source).not.toContain("row.televotePoints ?? 0");
  });

  it("keeps the immutable Scoreboard query bounded and non-polling", () => {
    const functions = scoreboardFunctions();
    const runtime = scoreboardRuntime();

    expect(functions).toContain("z.string().uuid()");
    expect(functions).toContain("loadV3ScoreboardBundle(data.showId)");
    expect(runtime).toContain('["v3-scoreboard-bundle", showId ?? "none"]');
    expect(runtime).toContain("staleTime: 60_000");
    expect(runtime).toContain("refetchOnWindowFocus: false");
    expect(runtime).toContain("retry: false");
    expect(runtime).not.toMatch(/setInterval|refetchInterval/);
  });

  it("renders only immutable Scoreboard data after the V3 rollout gate opens", () => {
    const source = stage();

    expect(source).toContain("if (v3ScoreboardEnabled)");
    expect(source).toContain("standings={bundle?.standings ?? []}");
    expect(source).toContain("countries={v3Countries}");
    expect(source).toContain("The app will not substitute mutable archive rows");
    expect(source).not.toContain("standings={rows}\n        countries={countries}");
  });

  it("preserves the proven legacy scoreboard when V3 is not enabled", () => {
    const source = stage();

    expect(source).toContain("<CountryCard");
    expect(source).toContain("resolveScoreboard");
    expect(source).toContain("prepareCardForPublicSurface");
    expect(source).toContain("broadcastRows");
  });

  it("keeps V3 presentation downstream of server-resolved ranking data", () => {
    const source = presentation();

    expect(source).toContain('import type { Standing } from "@/lib/analysis"');
    expect(source).toContain(
      'import type { Country, Participant } from "@/lib/data"',
    );
    expect(source).toContain("standings: readonly Standing[]");
    expect(source).not.toContain("useResults(");
    expect(source).not.toContain("useAllResults(");
    expect(source).not.toContain("useQuery(");
    expect(source).not.toContain("supabase");
    expect(source).not.toContain("createServerFn");
  });

  it("renders an explicit empty state without inventing unpublished ranking data", () => {
    const source = presentation();

    expect(source).toContain('data-v3-scoreboard-empty=""');
    expect(source).toContain("No published ranking yet");
    expect(source).toContain(
      "canonical scoreboard does not currently contain any published entries",
    );
    expect(source).toContain("rows.length === 0");
  });

  it("preserves canonical tied placements without inventing a browser tie-break", () => {
    const source = presentation();

    expect(source).toContain("rankCounts");
    expect(source).toContain("tiedRanks");
    expect(source).toContain("rankCounts.get(1) === 1");
    expect(source).toContain("tiedRanks.has(standing.rank)");
    expect(source).toContain(">Tie</V3StatusChip>");
    expect(source).toContain("does not recalculate tie-breaks in the browser");
    expect(source).toContain('isTied ? ", tied" : ""');
    expect(source).not.toContain("b.total - a.total");
    expect(source).not.toContain("a.total - b.total");
    expect(source).not.toContain("b.jury - a.jury");
    expect(source).not.toContain("b.televote - a.televote");
  });

  it("uses only canonical projected qualification truth and never guesses from rank", () => {
    const source = presentation();

    expect(source).toContain("const isQualified = participant?.qualified ?? null");
    expect(source).not.toContain("hasQualifierCutoff");
    expect(source).not.toContain("standing.rank <= qualifiers");
    expect(source).not.toContain("participant?.qualified === true");
    expect(source).not.toContain("participant?.qualified === false");
  });

  it("fails unresolved country identity closed instead of exposing internal ids", () => {
    const source = presentation();

    expect(source).toContain(
      'const UNAVAILABLE_COUNTRY_LABEL = "Country unavailable"',
    );
    expect(source).toContain("Identity unavailable");
    expect(source).toContain("country?.name || UNAVAILABLE_COUNTRY_LABEL");
    expect(source).not.toContain("country?.name ?? standing.countryId");
    expect(source).not.toContain("country?.name || standing.countryId");
  });

  it("does not expose a browser-controlled scoreboard rollout escape hatch", () => {
    const combined = [
      migration(),
      probe(),
      stage(),
      presentation(),
      scoreboardSource(),
      scoreboardFunctions(),
      scoreboardRuntime(),
    ].join("\n");

    expect(combined).not.toContain("VITE_SOLARIS_APP_V3_SCOREBOARD");
    expect(combined).not.toContain("localStorage");
    expect(migration()).not.toContain("sessionStorage");
  });
});
