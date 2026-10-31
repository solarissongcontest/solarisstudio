import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const migration = () =>
  source("supabase/migrations/20261020062000_v3_s12_feature_flag_snapshot.sql");
const rolloutProbe = () => source("src/integrations/v3/rollout-probe.server.ts");

describe("System V3 S12 bounded feature-flag snapshot", () => {
  it("registers through the strict S13 semantic migration contract", () => {
    const sql = migration();

    expect(sql).toContain("public.v3_register_migration_contract(");
    expect(sql).toContain("'v3.rollout.feature-flags-snapshot-v1'");
    expect(sql).not.toContain("'20261020062000_v3_s12_feature_flag_snapshot'");
    expect(sql).toContain("'forward_fix_only'");
  });

  it("keeps the public RPC bounded and metadata-minimal", () => {
    const sql = migration();

    expect(sql).toContain("returns table(flag_key text, enabled boolean)");
    expect(sql).toContain("if v_key_count > 50 then");
    expect(sql).toContain("length(btrim(raw_key)) > 128");
    expect(sql).toContain("group by normalized.requested_key");
    expect(sql).not.toContain("user_ids");
    expect(sql).not.toContain("edition_ids");
    expect(sql).not.toContain("admins_only");
  });

  it("reuses the canonical per-flag authorization decision instead of duplicating rollout truth", () => {
    const sql = migration();

    expect(sql).toContain("private.studio2_feature_enabled_for(");
    expect(sql).toContain("auth.uid(),");
    expect(sql).toContain("p_edition_id");
    expect(sql).toContain("security definer");
    expect(sql).toContain("set search_path = ''");
  });

  it("uses explicit execute grants for anonymous and authenticated server probes", () => {
    const sql = migration();

    expect(sql).toContain(
      "revoke all on function public.studio2_feature_flags_snapshot(text[], uuid)",
    );
    expect(sql).toContain("from public, anon, authenticated");
    expect(sql).toContain(
      "grant execute on function public.studio2_feature_flags_snapshot(text[], uuid)",
    );
    expect(sql).toContain("to anon, authenticated, service_role");
  });

  it("collapses the 16-key rollout decision into one Data API RPC", () => {
    const probe = rolloutProbe();

    expect(probe).toContain('client.rpc("studio2_feature_flags_snapshot"');
    expect(probe).toContain("p_keys: [...ROLLOUT_FEATURE_KEYS]");
    expect(probe).not.toContain('client.rpc("studio2_feature_enabled"');
    expect(probe.match(/studio2_feature_flags_snapshot/g)).toHaveLength(1);
  });

  it("fails closed on RPC errors, malformed rows, duplicates and incomplete snapshots", () => {
    const probe = rolloutProbe();

    expect(probe).toContain("if (snapshot.error) return disabledProbe({ editionId, userId })");
    expect(probe).toContain("if (!flags) return disabledProbe({ editionId, userId })");
    expect(probe).toContain("!requested.has(row.flag_key)");
    expect(probe).toContain("resolved.has(row.flag_key as RolloutFeatureKey)");
    expect(probe).toContain("resolved.size !== ROLLOUT_FEATURE_KEYS.length");
  });
});
