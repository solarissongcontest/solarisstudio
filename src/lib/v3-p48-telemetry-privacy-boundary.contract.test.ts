import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const migration = () =>
  source("supabase/migrations/20261020063841_v3_p48_telemetry_privacy_boundary.sql");
const rehearsal = () => source("scripts/rehearse-v3-p48-telemetry-privacy.mjs");

describe("System V3 P48 telemetry database privacy boundary", () => {
  it("uses valid semantic S13 migration/backfill keys", () => {
    const sql = migration();
    expect(sql).toContain("'v3.p48.telemetry-privacy-boundary'");
    expect(sql).toContain("'v3.p48.telemetry-route-sanitization'");
    expect(sql).toContain("'forward_fix_only'");
    expect(sql).not.toContain("'20261020063841_v3_p48_telemetry_privacy_boundary'");
  });

  it("rejects unsafe stored identities including encoded segments and absolute target URLs", () => {
    const sql = migration();
    expect(sql).toContain("p_value !~ '[?#%]'");
    expect(sql).toContain("p_value !~* '^[a-z][a-z0-9+.-]*://'");
    expect(sql).toContain("position('%' in p_value) = 0");
    expect(sql).toContain("[0-9a-f]{8}-[0-9a-f]{4}");
    expect(sql).toContain("[A-Za-z0-9_-]{32,}");
    expect(sql).toContain("[^/]*@[^/]*");
  });

  it("normalizes existing client route shapes before CHECK enforcement", () => {
    const sql = migration();
    expect(sql).toContain("private.v3_p48_normalize_public_ux_event()");
    expect(sql).toContain("private.v3_p48_normalize_public_web_vital()");
    expect(sql).toContain("before insert or update of pathname, target, metadata");
    expect(sql).toContain("before insert or update of pathname on public.public_web_vitals");
    expect(sql).toContain("split_part(split_part(v_path, '#', 1), '?', 1)");
    expect(sql).toContain("position('%' in v_segment) > 0");
    expect(sql).toContain("':id'");
    expect(sql).toContain("':token'");
    expect(sql).toContain("':value'");
    expect(sql).toContain("regexp_replace(v_target, '^[a-z][a-z0-9+.-]*://[^/]*'");
  });

  it("protects every route-bearing telemetry field", () => {
    const sql = migration();
    expect(sql).toContain("public_ux_events_path_privacy_check");
    expect(sql).toContain("public_ux_events_target_privacy_check");
    expect(sql).toContain("public_ux_events_start_route_privacy_check");
    expect(sql).toContain("public_web_vitals_path_privacy_check");
    expect(sql).toContain("metadata ->> 'start_route'");
  });

  it("avoids an unbounded deployment-time historical rewrite", () => {
    const sql = migration();
    const backfill = sql.indexOf("admin_run_p48_telemetry_privacy_backfill_batch");
    expect(backfill).toBeGreaterThan(-1);
    expect(sql.slice(0, backfill)).not.toMatch(/update public\.public_(ux_events|web_vitals)/i);
    expect(sql).toContain("public.v3_claim_backfill(");
    expect(sql).toContain("public.v3_checkpoint_backfill(");
    expect(sql).toContain("p_batch_size not between 1 and 1000");
    expect(sql).toContain("limit p_batch_size");
    expect(sql).not.toContain("validate constraint public_ux_events_path_privacy_check");
  });

  it("keeps public writes and organizer read models intact", () => {
    const sql = migration();
    expect(sql).not.toContain("revoke insert on table public.public_ux_events");
    expect(sql).not.toContain("revoke insert on table public.public_web_vitals");
    expect(sql).not.toContain("admin_public_ux_metrics");
    expect(sql).not.toContain("admin_public_web_vitals");
  });

  it("ships an isolated-local public-boundary rehearsal", () => {
    const script = rehearsal();
    expect(script).toContain('endpoint.hostname !== "127.0.0.1"');
    expect(script).toContain('endpoint.hostname !== "localhost"');
    expect(script).toContain("Refusing P48 telemetry privacy rehearsal against non-local Supabase");
    expect(script).toContain("expectAccepted(");
    expect(script).toContain("rpcBoolean(");
    expect(script).toContain("Encoded raw UUID path is unsafe at rest");
    expect(script).toContain("Absolute diagnostic target is unsafe at rest");
    expect(script).not.toContain(".supabase.co");
  });
});
