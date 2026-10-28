import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const lifecycle = source("supabase/migrations/20261027211500_v3_show_runtime_authority.sql");
const definition = source("supabase/migrations/20261027213000_v3_show_definition_authority.sql");
const replay = source("supabase/migrations/20261027215000_v3_show_operation_replay_order.sql");
const grants = source("supabase/migrations/20261027214000_v3_show_writer_privilege_cutover.sql");
const runtime = source("src/lib/show-runtime-command.ts");
const companion = source("src/lib/show-mode.ts");

describe("V3 canonical show lifecycle authority", () => {
  it("revalidates session and capability before cue receipt replay and keeps mutable state out of request identity", () => {
    const cue = source("supabase/migrations/20261027204600_v3_show_cue_authority.sql");
    for (const name of ["v3_save_show_rundown", "v3_set_show_rundown_lock", "v3_transition_show_cue"]) {
      const body = cue.split(`create or replace function public.${name}(`)[1].split("$command$;")[0];
      expect(body.indexOf("perform private.v3_require_active_auth_session()")).toBeGreaterThan(-1);
      expect(body.indexOf("private.studio2_can_manage_broadcast(auth.uid(), v_edition_id)")).toBeLessThan(body.indexOf("v_claim :="));
    }
    const transition = cue.split("create or replace function public.v3_transition_show_cue(")[1];
    const request = transition.split("v_claim := private.studio2_claim_operation(")[1].split("if coalesce")[0];
    expect(request).not.toContain("v_from_status");
    expect(request).toContain("p_expected_revision");
    expect(transition).toContain("'fromStatus', v_from_status");
  });
  it("constrains shows.status to the canonical V3 lifecycle vocabulary", () => {
    for (const state of ["scheduled", "preparing", "delayed", "live", "paused", "ended", "cancelled"]) {
      expect(lifecycle).toContain(`'${state}'`);
    }
    expect(lifecycle).toContain("shows_v3_lifecycle_status_check");
    expect(lifecycle).toContain("UNKNOWN_SHOW_LIFECYCLE_STATE");
    expect(lifecycle).toContain("alter table public.shows alter column status set default 'scheduled'");
  });

  it("keeps results_in_progress as a live subphase rather than a second lifecycle status", () => {
    expect(lifecycle).toContain("when 'results_in_progress' then 'live'");
    expect(lifecycle).toContain("when p_target_state = 'results_in_progress' then 'results_in_progress'");
    expect(source("src/lib/show-lifecycle.ts")).toContain('export type ShowRuntimeTarget = ShowLifecycleState | "results_in_progress"');
    expect(runtime).toContain('export type { ShowLifecycleState, ShowRuntimeTarget } from "@/lib/show-lifecycle"');
    expect(companion).toContain('config.phase === "results_in_progress"');
  });

  it("enforces legal transitions and stale lifecycle/runtime CAS server-side", () => {
    expect(lifecycle).toContain("v_show.status <> p_expected_status");
    expect(lifecycle).toContain("v_current_revision <> p_expected_revision");
    expect(lifecycle).toContain("message = 'STATE_CHANGED'");
    expect(lifecycle).toContain("message = 'ILLEGAL_SHOW_TRANSITION'");
    expect(lifecycle).toContain("v_current_state = 'scheduled' and p_target_state in ('preparing','delayed','live','cancelled')");
    expect(lifecycle).toContain("v_current_state = 'live' and p_target_state in ('paused','results_in_progress','ended','cancelled')");
    expect(lifecycle).toContain("v_current_state = 'paused' and p_target_state in ('live','ended','cancelled')");
  });

  it("guards both lifecycle and Show Mode metadata behind the same canonical operation", () => {
    expect(lifecycle).toContain("receipt.command = 'show.transition'");
    expect(lifecycle).toContain("before update of status, broadcast_config on public.shows");
    expect(lifecycle).toContain("message = 'SHOW_RUNTIME_AUTHORITY'");
    expect(lifecycle).toContain("set_config('app.v3_show_runtime_operation_id'");
    expect(lifecycle).toContain("status = v_next_status");
    expect(lifecycle).toContain("broadcast_config = jsonb_set(v_config, '{showMode}', v_next, true)");
  });

  it("persists show.changed atomically with the governed lifecycle operation and receipt", () => {
    expect(lifecycle).toContain("private.studio2_claim_operation(");
    expect(lifecycle).toContain("'show.transition'");
    expect(lifecycle).toContain("'show.changed'");
    expect(lifecycle).toContain("'lifecycle_transitioned'");
    expect(lifecycle).toContain("private.studio2_complete_operation(p_operation_id, v_result)");
    expect(runtime).toContain("response = await client.rpc(\"v3_apply_show_runtime_change\", args)");
  });

  it("claims stable operation identity before row-state CAS so response-lost retries reconcile", () => {
    const runtimeClaim = replay.indexOf("v_claim := private.studio2_claim_operation(");
    const runtimeLock = replay.indexOf("select show_row.*");
    expect(runtimeClaim).toBeGreaterThan(0);
    expect(runtimeLock).toBeGreaterThan(runtimeClaim);
    expect(replay).toContain("if v_claim ->> 'status' = 'succeeded' then return v_claim -> 'result'; end if;");
    expect(replay).toContain("'show.transition'");
    expect(replay).toContain("'show.definition.update'");
    expect(replay).toContain("'show.delete'");
    expect(replay).toContain("jsonb_build_object('showId', p_show_id)");
  });

  it("removes API-role raw show create/delete/whole-row update authority", () => {
    expect(grants).toContain("revoke insert, update, delete, truncate on table public.shows");
    expect(grants).toContain("from anon, authenticated, service_role");
    expect(grants).toContain("grant update (theme_id, broadcast_config, voting_config, qualifier_count, lineup_stage)");
    expect(grants).not.toContain("grant update on table public.shows to authenticated");
  });

  it("keeps show definition CRUD inside governed commands", () => {
    expect(definition).toContain("public.v3_create_show(");
    expect(definition).toContain("public.v3_update_show_definition(");
    expect(definition).toContain("public.v3_delete_show(");
    expect(definition).toContain("'show.create'");
    expect(definition).toContain("'show.definition.update'");
    expect(definition).toContain("'show.delete'");
    expect(definition).toContain("'show.changed'");
    expect(definition).toContain("message = 'SHOW_HAS_DURABLE_HISTORY'");
  });

  it("does not grant raw service-role mutation as a substitute for authority", () => {
    expect(grants).not.toContain("to service_role");
    expect(lifecycle).toContain("from public, anon, service_role");
    expect(definition).toContain("from public, anon, service_role");
  });
});
