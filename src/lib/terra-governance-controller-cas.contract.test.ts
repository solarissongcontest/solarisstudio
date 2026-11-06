import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20261107002000_v3_tg1_controller_binding_expected_actor.sql"),
  "utf8",
);

const bind = migration.split(
  "create or replace function public.world_bind_country_controller_person_v1(",
)[1]?.split("end\n$bind$;")[0];

const projection = migration.split(
  "create or replace function public.world_country_identity_v1(",
)[1]?.split("$projection$;")[0];

describe("WORLD-01 TG1 controller-person CAS and effective identity", () => {
  it("requires a non-null expected controller before any operation is claimed", () => {
    expect(bind).toBeDefined();
    expect(bind).toContain("if p_expected_current_user_id is null then");
    expect(bind).toContain("message = 'EXPECTED_CONTROLLER_REQUIRED'");
    expect(bind!.indexOf("EXPECTED_CONTROLLER_REQUIRED"))
      .toBeLessThan(bind!.indexOf("v_claim := private.studio2_claim_operation("));
    expect(bind).not.toContain("p_expected_current_user_id is not null and");
  });

  it("compares the caller's expected actor to a locked active country account", () => {
    expect(bind).toMatch(
      /select ca\.user_id into v_current_user_id\s+from public\.country_accounts ca\s+where ca\.country_id = p_country_id\s+and ca\.status = 'active'\s+for update;/,
    );
    expect(bind).toContain(
      "if v_current_user_id is distinct from p_expected_current_user_id then",
    );
    expect(bind).toContain("message = 'VERSION_CONFLICT'");
    expect(bind).not.toMatch(/(?:insert into|update|delete from)\s+public\.country_accounts/i);
  });

  it("preserves historical bindings, durable person identity, audit and receipt authority", () => {
    expect(bind).toContain("private.studio2_claim_operation(");
    expect(bind).toContain("private.studio2_complete_operation(");
    expect(bind).toContain("public.studio2_reconcile_operation(");
    expect(bind).toContain("private.v3_emit_domain_event(");
    expect(bind).toContain("'world.country_control_linked'");
    expect(bind).toContain("public.world_country_control_terms");
    expect(bind).toContain("v_existing.user_id is not distinct from v_current_user_id");
    expect(bind).not.toContain("create table public.country_accounts");
  });

  it("publishes current political identity only for effective terms matching the real owner", () => {
    expect(projection).toBeDefined();
    expect(projection).toContain("left join public.country_accounts current_account");
    expect(projection).toContain("current_account.status = 'active'");
    expect(projection).toContain("term.user_id = current_account.user_id");
    expect(projection).toContain("term.ended_at is null");
    expect(projection).toContain("term.started_at <= now()");
    expect(projection).toContain("person.display_name");
    expect(projection).not.toMatch(/select\s+[^;]*current_account\.user_id/i);
  });

  it("uses a distinct forward contract and retains least-privilege RPC grants", () => {
    expect(migration).toContain("'v3.tg1.world-controller-binding-expected-actor'");
    expect(migration).toContain("'forward_fix_only'");
    expect(migration).toContain("grant execute on function public.world_country_identity_v1(uuid)");
    expect(migration).toContain("to anon, authenticated, service_role;");
    expect(migration).toContain("grant execute on function public.world_bind_country_controller_person_v1(");
    expect(migration).toContain("to authenticated, service_role;");
    expect(migration).not.toMatch(/grant\s+all\s+on\s+table/i);
  });
});
