import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const route = () => read("src/routes/fantasy/index.tsx");
const projection = () => read("src/lib/v3-fantasy.ts");
const screen = () => read("src/components/v3/V3FantasyScreen.tsx");

describe("V3 Fantasy participant consumer", () => {
  it("uses one canonical participant projection instead of direct private team reads", () => {
    const text = route();
    expect(text).toContain('.rpc("v3_fantasy_game"');
    expect(text).toContain('["fantasy-v3-game", activeGameSeed?.id]');
    expect(text).toContain("fantasyProjection.data?.effectiveState");
    expect(text).toContain("fantasyProjection.data?.canEdit === true");
    expect(text).not.toContain('.from("fantasy_teams")');
    expect(text).not.toContain('.from("fantasy_team_entries")');
    expect(text).not.toContain('.from("fantasy_game_entries")');
  });

  it("does not let the device clock decide whether the roster is actionable", () => {
    const text = route();
    expect(text).not.toContain("Date.now()");
    expect(text).not.toContain("setInterval(");
    expect(text).not.toContain("resolveV3FantasyState(");
    expect(text).toContain("fantasyBoundaryRefreshDelayMs(fantasyProjection.data)");

    const model = projection();
    expect(model).toContain("const serverMs = Date.parse(projection.serverTime)");
    expect(model).toContain("nextBoundary - serverMs + 250");
  });

  it("submits with the authoritative expected revision and one stable operation identity", () => {
    const text = route();
    expect(text).toContain('.rpc("v3_submit_fantasy_team"');
    expect(text).toContain("p_expected_revision: fantasyProjection.data.stateVersion");
    expect(text).toContain("p_operation_id: operationId");
    expect(text).toContain("p_idempotency_key: operationId");
    expect(text).not.toContain('.rpc("submit_fantasy_team"');
  });

  it("reconciles an ambiguous submission rather than blindly creating another team operation", () => {
    const text = route();
    expect(text).toContain('"studio2_reconcile_operation"');
    expect(text).toContain('recovery?.status === "succeeded"');
    expect(text).not.toContain("localStorage");
    expect(text).not.toContain("sessionStorage");
  });

  it("keeps the installed-app cutover reversible while System authority is unavailable", () => {
    const text = route();
    expect(text).toContain("useV3RolloutProbe(platformResolved && isAppMode)");
    expect(text).toContain("rollout.data?.enabled === true");
    expect(text).toContain("feature.data === true");
    expect(text).toContain("<V3FantasyScreen");
    expect(text).toContain("<AppShell>");
  });

  it("keeps validation and scoring authority visibly server-owned", () => {
    const text = screen();
    expect(text).toContain("server lock");
    expect(text).toContain("authoritative scoring workflow");
  });
});
