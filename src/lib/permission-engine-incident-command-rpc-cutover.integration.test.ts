import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationName = readdirSync(resolve(process.cwd(), "supabase/migrations")).find((name) =>
  name.endsWith("_permission_engine_v2_incident_command_rpc_cutover.sql"),
);
if (!migrationName) throw new Error("incident command RPC cutover migration missing");

const migration = readFileSync(resolve(process.cwd(), "supabase/migrations", migrationName), "utf8");

function block(name: string) {
  const marker = `create or replace function public.${name}`;
  const lower = migration.toLowerCase();
  const start = lower.indexOf(marker);
  expect(start).toBeGreaterThanOrEqual(0);
  const next = lower.indexOf("create or replace function", start + marker.length);
  return migration.slice(start, next === -1 ? migration.length : next);
}

describe("incident command Permission Engine RPC cutover", () => {
  const editionParamFunctions = ["studio2_create_incident", "studio2_create_incident_v2"] as const;
  const incidentScopedFunctions = [
    "studio2_update_incident",
    "studio2_acknowledge_incident",
    "studio2_declare_incident_crisis",
    "studio2_add_incident_timeline_event",
    "studio2_transition_incident",
  ] as const;

  it("moves all seven incident mutators to non-strict incident.manage", () => {
    for (const name of editionParamFunctions) {
      const fn = block(name);
      expect(fn).toContain("studio2_access_allowed('incident.manage', p_edition_id, false)");
      expect(fn).not.toContain("has_role");
      expect(fn).not.toContain("studio2_user_has_capability");
    }

    for (const name of incidentScopedFunctions) {
      const fn = block(name);
      expect(fn).toContain("studio2_access_allowed('incident.manage', v_incident.edition_id, false)");
      expect(fn).not.toContain("has_role");
      expect(fn).not.toContain("studio2_user_has_capability");
    }
  });

  it("preserves incident lookup before authorization on incident-id operations", () => {
    for (const name of incidentScopedFunctions) {
      const fn = block(name);
      expect(fn).toContain("Incident not found:");
      expect(fn.indexOf("Incident not found:")).toBeLessThan(fn.indexOf("studio2_access_allowed('incident.manage'"));
    }
  });

  it("preserves lifecycle, validation and audit event behavior", () => {
    const create = block("studio2_create_incident_v2");
    expect(create).toContain("Unknown incident category:");
    expect(create).toContain("'incident.created'");
    expect(create).toContain("'affectedSystems', v_incident.affected_systems");

    const update = block("studio2_update_incident");
    expect(update).toContain("v_before := v_incident");
    expect(update).toContain("'action', 'details_updated'");

    expect(block("studio2_acknowledge_incident")).toContain("'action', 'acknowledged'");
    expect(block("studio2_declare_incident_crisis")).toContain("'action', 'crisis_declared'");
    expect(block("studio2_add_incident_timeline_event")).toContain("'action', 'timeline_note'");

    const transition = block("studio2_transition_incident");
    expect(transition).toContain("studio2_incident_transition_allowed(v_incident.status, p_to)");
    expect(transition).toContain("'action', case when v_from = 'resolved' then 'reopened' else 'status_changed' end");
    expect(transition).toContain("'category', v_incident.category");
  });

  it("keeps all seven RPCs authenticated/service-role only", () => {
    expect(migration.match(/from public, anon;/g)?.length).toBeGreaterThanOrEqual(7);
    expect(migration.match(/to authenticated, service_role;/g)?.length).toBeGreaterThanOrEqual(7);
  });

  it("does not enable Permission Engine v2", () => {
    expect(migration).not.toContain("update public.studio2_feature_flags");
    expect(migration).not.toContain("insert into public.studio2_feature_flags");
  });
});
