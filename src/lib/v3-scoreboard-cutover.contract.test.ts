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
const presentation = () => read("src/components/v3/V3ScoreboardPresentation.tsx");

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

  it("limits V3 scoreboard presentation to installed-app show detail routes", () => {
    const source = stage();

    expect(source).toContain("useSolarisApp");
    expect(source).toContain("useV3RolloutProbe");
    expect(source).toContain("isPublicShowRoute");
    expect(source).toContain("/^\\/shows\\/[^/]+\\/?$/");
    expect(source).toContain("platformResolved && isAppMode && isPublicShowRoute");
    expect(source).toContain("rollout.data?.scoreboardEnabled === true");
    expect(source).toContain("<V3ScoreboardPresentation");
  });

  it("preserves the proven scoreboard as the fail-closed fallback", () => {
    const source = stage();

    expect(source).toContain("<CountryCard");
    expect(source).toContain("resolveScoreboard");
    expect(source).toContain("prepareCardForPublicSurface");
    expect(source).toContain("broadcastRows");
  });

  it("keeps V3 presentation downstream of canonical ranking data", () => {
    const source = presentation();

    expect(source).toContain('import type { Standing } from "@/lib/analysis"');
    expect(source).toContain('import type { Country, Participant } from "@/lib/data"');
    expect(source).toContain("standings: readonly Standing[]");
    expect(source).not.toContain("useResults(");
    expect(source).not.toContain("useAllResults(");
    expect(source).not.toContain("useQuery(");
    expect(source).not.toContain("supabase");
    expect(source).not.toContain("createServerFn");
  });

  it("does not expose a browser-controlled scoreboard rollout escape hatch", () => {
    const combined = [migration(), probe(), stage(), presentation()].join("\n");

    expect(combined).not.toContain("VITE_SOLARIS_APP_V3_SCOREBOARD");
    expect(combined).not.toContain("localStorage");
    expect(migration()).not.toContain("sessionStorage");
  });
});
