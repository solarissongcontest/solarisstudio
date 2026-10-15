import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { V3_DOMAIN_CONSEQUENCE_REGISTRY } from "./v3-domain-consequence-registry";

const migration = readFileSync(
  "supabase/migrations/20261015183000_v3_s5_confirmation_consequences.sql",
  "utf8",
);
const submitRuntime = readFileSync(
  "supabase/migrations/20261015183100_v3_confirmation_submit_runtime_replay_restore.sql",
  "utf8",
);
const submitDependencies = readFileSync(
  "supabase/migrations/20261015183200_v3_confirmation_submit_runtime_dependencies_restore.sql",
  "utf8",
);
const rehearsal = readFileSync(
  ".github/scripts/v3-s5-confirmation-consequences-rehearsal.sh",
  "utf8",
);

describe("System V3 S5 Confirmation consequences", () => {
  it("bridges only successful new V3 submissions into the shared S2 receipt", () => {
    expect(migration).toContain("private.v3_confirmation_operations");
    expect(migration).toContain("v3_bridge_confirmation_submission_operation");
    expect(migration).toContain("if not coalesce((new.result ->> 'ok')::boolean, false)");
    expect(migration).toContain("'confirmation.submit'");
    expect(migration).toContain("private.studio2_request_fingerprint");
    expect(migration).not.toContain("create or replace function public.v3_submit_confirmation");
    expect(migration).not.toMatch(/insert\s+into\s+private\.v3_confirmation_operations/i);
  });

  it("restores clean-replay submit parity without reopening the legacy command bypass", () => {
    expect(submitRuntime).toContain("create or replace function public.submit_confirmation(payload jsonb)");
    expect(submitRuntime).toContain("public.round_availability(r.id)");
    expect(submitRuntime).toContain("public.find_entry_duplicate(");
    expect(submitRuntime).toContain("insert into public.submission_versions");
    expect(submitRuntime).toContain("revoke all on function public.submit_confirmation(jsonb)");
    expect(submitRuntime).toContain("from public, anon, authenticated, service_role");
    expect(submitRuntime).toContain("has_function_privilege('anon', 'public.submit_confirmation(jsonb)', 'EXECUTE')");
    expect(submitRuntime).toContain("public.v3_submit_confirmation(jsonb,uuid,text,text)");
  });

  it("restores every deployed helper and trigger required by the legacy submit implementation", () => {
    for (const signature of [
      "public.normalize_entry_text(value text)",
      "public.find_entry_duplicate(",
      "public.round_availability(_round_id uuid)",
      "public.generate_recovery_code()",
      "public.ensure_submission_recovery_code()",
      "public.register_submission_browser()",
      "public.sync_round_stats()",
    ]) {
      expect(submitDependencies).toContain(`create or replace function ${signature}`);
    }

    expect(submitDependencies).toContain("create trigger ensure_submission_recovery_code_trg");
    expect(submitDependencies).toContain("create trigger register_submission_browser_trg");
    expect(submitDependencies).toContain("create trigger submissions_stats_trg");
    expect(submitDependencies).toContain(
      "revoke all on function public.find_entry_duplicate(uuid, uuid, text, text, text)",
    );
    expect(submitDependencies).toContain(
      "grant execute on function public.round_availability(uuid)",
    );
  });

  it("emits completed facts from the common S2 success boundary", () => {
    expect(migration).toContain("v3_emit_confirmation_operation_event");
    expect(migration).toContain("after update of status on public.studio2_operation_receipts");
    expect(migration).toContain("new.status = 'succeeded'");
    expect(migration).toContain("'confirmation.submitted'");
    expect(migration).toContain("'confirmation.window_changed'");
    expect(migration).toContain("'confirmation_submission'");
    expect(migration).toContain("'confirmation_round'");
    expect(migration).toContain("array['confirmation.tasks', 'confirmation.notifications']::text[]");
    expect(migration).toContain("private.v3_emit_domain_event");
  });

  it("executes idempotent existing consequence engines under the S4 lease", () => {
    expect(migration).toContain("studio2_process_confirmation_domain_event");
    expect(migration).toContain("private.studio2_reconcile_confirmation_requirement_tasks");
    expect(migration).toContain("private.studio2_reconcile_confirmation_sync_tasks");
    expect(migration).toContain("private.studio2_sync_task_notifications");
    expect(migration).toContain("private.studio2_prune_stale_task_notifications");
    expect(migration).toContain("public.solaris_enqueue_app_notifications(now())");
    expect(migration).toContain("public.studio2_complete_domain_event_delivery");
    expect(migration).toContain("v_delivery.lease_owner is distinct from p_worker_id");
    expect(migration).toContain("v_delivery.lease_expires_at <= now()");
  });

  it("marks only the migrated Confirmation facts as event-backed", () => {
    const eventBacked = V3_DOMAIN_CONSEQUENCE_REGISTRY
      .filter((consequence) => consequence.implementationState === "event-backed")
      .map((consequence) => consequence.eventType)
      .sort();

    expect(eventBacked).toEqual([
      "confirmation.submitted",
      "confirmation.window_changed",
    ]);

    for (const eventType of eventBacked) {
      const consequence = V3_DOMAIN_CONSEQUENCE_REGISTRY.find(
        (item) => item.eventType === eventType,
      );
      expect(consequence?.evidence).toContain(
        "supabase/migrations/20261015183000_v3_s5_confirmation_consequences.sql",
      );
      expect(consequence?.evidence).toContain(
        ".github/scripts/v3-s5-confirmation-consequences-rehearsal.sh",
      );
    }
  });

  it("keeps the hostile consequence proof local-only", () => {
    expect(rehearsal).toContain("Refusing hosted Supabase rehearsal");
    expect(rehearsal).toContain("Refusing non-local database rehearsal");
    expect(rehearsal).toContain("confirmation.submitted");
    expect(rehearsal).toContain("confirmation.window_changed");
    expect(rehearsal).toContain("confirmation.tasks");
    expect(rehearsal).toContain("confirmation.notifications");
  });
});
