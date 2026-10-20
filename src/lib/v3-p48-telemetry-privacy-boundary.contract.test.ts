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
  it("registers the migration through the canonical S13 contract", () => {
    const sql = migration();

    expect(sql).toContain("public.v3_register_migration_contract(");
    expect(sql).toContain("20261020063841_v3_p48_telemetry_privacy_boundary");
    expect(sql).toContain("'forward_fix_only'");
  });

  it("owns one reusable privacy-safe route invariant", () => {
    const sql = migration();

    expect(sql).toContain("public.studio2_telemetry_path_is_safe");
    expect(sql).toContain("p_value !~ '[?#]'");
    expect(sql).toContain("[0-9a-f]{8}-[0-9a-f]{4}");
    expect(sql).toContain("[A-Za-z0-9_-]{32,}");
    expect(sql).toContain("[^/]*@[^/]*");
    expect(sql).toContain("set search_path = ''");
  });

  it("applies the invariant to every public route-bearing telemetry field", () => {
    const sql = migration();

    expect(sql).toContain("public_ux_events_path_privacy_check");
    expect(sql).toContain("public_ux_events_target_privacy_check");
    expect(sql).toContain("public_ux_events_start_route_privacy_check");
    expect(sql).toContain("public_web_vitals_path_privacy_check");
    expect(sql).toContain("metadata ->> 'start_route'");
    expect(sql).toContain("public.studio2_telemetry_target_is_safe(target)");
  });

  it("sanitizes historical route identity before validating constraints", () => {
    const sql = migration();
    const firstBackfill = sql.indexOf("update public.public_ux_events");
    const firstConstraint = sql.indexOf("add constraint public_ux_events_path_privacy_check");
    const firstValidation = sql.indexOf("validate constraint public_ux_events_path_privacy_check");

    expect(firstBackfill).toBeGreaterThan(-1);
    expect(firstConstraint).toBeGreaterThan(firstBackfill);
    expect(firstValidation).toBeGreaterThan(firstConstraint);
    expect(sql).toContain("v_segment := ':id'");
    expect(sql).toContain("v_segment := ':token'");
    expect(sql).toContain("v_segment := ':value'");
    expect(sql).toContain("set target = private.v3_p48_sanitize_telemetry_target(target)");
  });

  it("keeps the public telemetry write grants and organizer read model intact", () => {
    const sql = migration();

    expect(sql).not.toContain("revoke insert on table public.public_ux_events");
    expect(sql).not.toContain("revoke insert on table public.public_web_vitals");
    expect(sql).not.toContain("drop policy \"Public UX events can be recorded\"");
    expect(sql).not.toContain("drop policy \"Public web vitals can be recorded\"");
    expect(sql).not.toContain("admin_public_ux_metrics");
    expect(sql).not.toContain("admin_public_web_vitals");
  });

  it("proves handcrafted public inserts are rejected in an isolated-local rehearsal", () => {
    const script = rehearsal();

    expect(script).toContain('endpoint.hostname !== "127.0.0.1"');
    expect(script).toContain('endpoint.hostname !== "localhost"');
    expect(script).toContain("Refusing P48 telemetry privacy rehearsal against non-local Supabase");
    expect(script).toContain("expectRejected(");
    expect(script).toContain("UX pathname query/fragment");
    expect(script).toContain("UX pathname UUID");
    expect(script).toContain("UX pathname secret-shaped segment");
    expect(script).toContain("UX pathname e-mail segment");
    expect(script).toContain("UX route target query/fragment");
    expect(script).toContain("UX metadata start_route identifier");
    expect(script).toContain("Web Vitals raw route identifier");
    expect(script).toContain("Web Vitals raw secret route");
    expect(script).toContain("expectAccepted(");
    expect(script).not.toContain(".supabase.co");
  });
});
