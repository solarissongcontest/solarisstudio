import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { SOLARIS_CAPABILITIES } from "./permissions-v2";
import { TERRA_GOVERNANCE_TG6 } from "./terra-governance-session-registry";

const sql = readFileSync(resolve(process.cwd(),
  "supabase/migrations/20261104114000_v3_tg6_world_session_agenda.sql"), "utf8");

function functionBody(name: string, endTag: string) {
  const marker = "create or replace function public." + name + "(";
  const start = sql.indexOf(marker);
  const end = sql.indexOf("$" + endTag + "$;", start);
  if (start < 0 || end < start) throw new Error("Missing " + name + " migration function");
  return sql.slice(start, end);
}

describe("TG6 institutional session/agenda authority contracts", () => {
  it("reuses TG2 organization/organ identity with a composite FK and RLS", () => {
    expect(sql).toMatch(/create table public\.world_sessions/);
    expect(sql).toMatch(/create table public\.world_agenda_items/);
    expect(sql).toMatch(/foreign key\(organ_id, organization_id\)/);
    expect(sql).toMatch(/references public\.world_organization_organs\(id, organization_id\)/);
    expect(sql).toMatch(/alter table public\.world_sessions enable row level security/);
    expect(sql).toMatch(/alter table public\.world_agenda_items enable row level security/);
    expect(sql).toMatch(/revoke all on public\.world_sessions, public\.world_agenda_items from service_role/);
    expect(sql).not.toMatch(/grant (?:select|insert|update|delete|all) on public\.world_sessions.* to (?:anon|authenticated)/);
  });

  it("protects public projection visibility and excludes agenda drafts", () => {
    expect(functionBody("world_session_schedule_v1", "schedule"))
      .toMatch(/s\.visibility = 'public'/);
    const detail = functionBody("world_session_detail_v1", "detail");
    expect(detail).toMatch(/o\.public_visibility = 'public'/);
    expect(detail).toMatch(/g\.visibility = 'public'/);
    expect(detail).toMatch(/a\.state in \('scheduled','active','postponed','completed'\)/);
    expect(detail).toMatch(/s\.visibility = 'public'/);
    expect(detail).toMatch(/'externalUrl',null/);
    expect(detail).not.toMatch(/'externalUrl',s\.external_url/);
    expect(functionBody("world_session_manage_v1", "manage"))
      .toMatch(/'externalUrl',v_session\.external_url/);
    expect(functionBody("world_session_manage_v1", "manage"))
      .toMatch(/world_access_allowed\(/);
    expect(sql).toMatch(/grant execute on function public\.world_session_schedule_v1/);
  });

  it("uses the existing capability engine and explicit organ authority", () => {
    // Office capability bundles must not grant every future similarly-named
    // chairperson/deputy in any unrecognized institution blanket authority.
    expect(sql).toContain("('guard','chairperson')");
    expect(sql).toContain("('unity','secretary-general')");
    expect(sql).not.toMatch(/where office_row\.slug in \(/);
    for (const capability of TERRA_GOVERNANCE_TG6.capabilities) {
      expect(SOLARIS_CAPABILITIES).toContain(capability);
      expect(sql).toContain("'" + capability + "'");
    }
    for (const rpcName of TERRA_GOVERNANCE_TG6.commands) {
      const name = rpcName.replace("public.", "");
      expect(sql).toContain("create or replace function public." + name);
    }
    expect(functionBody("world_session_create_v1", "create"))
      .toMatch(/world_access_allowed\(\s*'world\.session\.create'/);
    expect(functionBody("world_agenda_append_v1", "append"))
      .toMatch(/world_access_allowed\(\s*'world\.agenda\.manage'/);
    expect(functionBody("world_agenda_reorder_v1", "reorder"))
      .toMatch(/world_access_allowed\(\s*'world\.agenda\.manage'/);
  });

  it("serializes session sequence numbers and returns durable operation receipts", () => {
    const command = functionBody("world_session_create_v1", "create");
    expect(command).toMatch(/for update/);
    expect(command).toMatch(/organ_row\.status='active'/);
    expect(command).toMatch(/organization_row\.status='active'/);
    expect(command).toMatch(/private\.studio2_claim_operation\(/);
    expect(command).toMatch(/private\.studio2_complete_operation\(/);
    expect(command).toMatch(/studio2_reconcile_operation\(/);
    expect(command).toMatch(/private\.v3_emit_domain_event\(/);
    expect(command).toMatch(/world\.session\.created/);
    expect(command).toMatch(/v_claim ->> 'replayed'/);
  });

  it("replays the same agenda operation before stale-state checks", () => {
    for (const [name, endTag] of [
      ["world_agenda_append_v1", "append"],
      ["world_agenda_reorder_v1", "reorder"],
    ]) {
      const body = functionBody(name, endTag);
      const replay = body.indexOf("v_claim ->> 'replayed'");
      const stale = body.indexOf("message='VERSION_CONFLICT'");
      expect(replay).toBeGreaterThan(0);
      expect(stale).toBeGreaterThan(replay);
      expect(body).toMatch(/private\.studio2_complete_operation/);
      expect(body).toMatch(/private\.v3_emit_domain_event/);
    }
    const reorder = functionBody("world_agenda_reorder_v1", "reorder");
    expect(reorder.indexOf("INVALID_AGENDA_ORDER"))
      .toBeGreaterThan(reorder.indexOf("v_claim ->> 'replayed'"));
    expect(reorder).toMatch(/p_expected_revision/);
    expect(sql).toMatch(/deferrable initially deferred/);
  });

  it("keeps lifecycle transitions and draft publishing canonical and reviewed", () => {
    const lifecycle = functionBody("world_session_transition_v1", "transition");
    const publish = functionBody("world_agenda_publish_v1", "publish");
    expect(lifecycle).toMatch(/world_access_allowed\(\s*'world\.session\.manage'/);
    expect(lifecycle).toMatch(/'scheduled' and p_target_status in \('open','cancelled'\)/);
    expect(lifecycle).toMatch(/'recessed' and p_target_status in \('open','concluded'\)/);
    expect(lifecycle).toMatch(/world\.session\.opened/);
    expect(lifecycle).toMatch(/world\.session\.closed/);
    expect(publish).toMatch(/world_access_allowed\(\s*'world\.agenda\.manage'/);
    expect(publish).toMatch(/v_item\.state <> 'draft'/);
    expect(publish).toMatch(/world\.agenda\.published/);
    for (const body of [lifecycle, publish]) {
      expect(body.indexOf("v_claim ->> 'replayed'"))
        .toBeLessThan(body.indexOf("message='VERSION_CONFLICT'"));
      expect(body).toMatch(/studio2_reconcile_operation/);
      expect(body).toMatch(/private\.studio2_complete_operation/);
      expect(body).toMatch(/private\.v3_emit_domain_event/);
    }
    expect(sql).toMatch(/grant execute on function public\.world_session_manage_v1/);
    expect(sql).toMatch(/public\.world_session_transition_v1\(uuid,text,bigint,uuid,text,uuid\)/);
    expect(sql).toMatch(/public\.world_agenda_publish_v1\(uuid,uuid,bigint,uuid,text,uuid\)/);
  });

  it("makes TG6 limitations explicit instead of claiming attendance/voting parity", () => {
    expect(TERRA_GOVERNANCE_TG6.notYetImplemented).toContain(
      "attendance and representative/proxy roll call",
    );
    expect(TERRA_GOVERNANCE_TG6.status).toBe("implementation");
  });
});
