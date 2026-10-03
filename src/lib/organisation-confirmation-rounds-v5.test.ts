import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("Organisation OS V5 confirmation round operations", () => {
  const migration = source(
    "supabase/migrations/20261003018000_organisation_os_v5_confirmation_round_operations.sql",
  );
  const client = source("src/integrations/confirmations/admin.ts");
  const route = source("src/routes/confirmations/admin/rounds.tsx");
  const schema = source(
    "supabase/migrations/20260816200158_integrate_confirmations_schema.sql",
  );

  it("versions both round configuration and its response truth", () => {
    expect(migration).toContain(
      "create table if not exists public.studio2_confirmation_round_versions",
    );
    expect(migration).toContain(
      "private.studio2_touch_confirmation_round_version",
    );
    expect(migration).toContain(
      "after insert or update on public.submission_rounds",
    );
    expect(migration).toContain(
      "after insert or update or delete on public.submissions",
    );
    expect(migration).toContain(
      "public.studio2_confirmation_round_versions.version + 1",
    );
  });

  it("requires preview, one replay identity and the expected round version", () => {
    expect(migration).toContain(
      "public.studio2_confirmation_round_change_preview",
    );
    expect(migration).toContain(
      "public.studio2_apply_confirmation_round_change",
    );
    expect(migration).toContain("private.studio2_claim_operation");
    expect(migration).toContain("private.studio2_complete_operation");
    expect(migration).toContain("p_operation_id");
    expect(migration).toContain("p_idempotency_key");
    expect(migration).toContain("p_expected_version");
    expect(migration).toContain(
      "Confirmation round changed since this preview was loaded. Refresh before continuing.",
    );
    expect(migration).toContain("using errcode = '40001'");
  });

  it("keeps round windows separate from edition confirmation requirements", () => {
    expect(migration).toContain("'requirementsCreated', 0");
    expect(route).toContain("Confirmation requirements created");
    expect(route).toContain("zero new requirements");
    expect(route).toContain(
      "Existing confirmation responses remain recorded and the round&apos;s"
    );
    expect(migration).not.toContain(
      "insert into public.studio2_confirmation_requirements",
    );
  });

  it("reopens a stale round safely without resurrecting an expired deadline", () => {
    expect(migration).toContain(
      "when v_target_status = 'open' and (opens_at is null or opens_at > now()) then now()",
    );
    expect(migration).toContain(
      "when v_target_status = 'open' and closes_at is not null and closes_at <= now() then null",
    );
    expect(migration).toContain(
      "Increase the response limit before reopening this full round",
    );
    expect(route).toContain("willClearExpiredClosingTime");
    expect(route).toContain("willMoveOpeningTimeToNow");
  });

  it("keeps corrections separate and previews the exact response impact", () => {
    expect(migration).toContain("p_change_kind = 'editing'");
    expect(migration).toContain(
      "submission.editing_allowed is distinct from v_target_editing",
    );
    expect(migration).toContain("get diagnostics v_affected_responses = row_count");
    expect(route).toContain("Response access changed");
    expect(route).toContain(
      "It does not open or close new submissions.",
    );
  });

  it("blocks deletion of a used round before the cascading foreign key can erase responses", () => {
    expect(schema).toContain(
      "round_id uuid not null references public.submission_rounds(id) on delete cascade",
    );
    expect(migration).toContain(
      "A round with responses cannot be deleted. Keep it closed for historical integrity.",
    );
    expect(migration).toContain("v_risk := 'R3'");
    expect(route).toContain(
      "Deletion is allowed only while this round has",
    );
    expect(route).toContain('confirmationText={');
  });

  it("closes every authenticated legacy round-mutation bypass", () => {
    for (const signature of [
      "admin_confirmation_set_round_status(uuid, text)",
      "admin_confirmation_set_round_editing(uuid, boolean)",
      "admin_confirmation_save_round(jsonb)",
      "admin_confirmation_delete_round(uuid)",
    ]) {
      expect(migration).toContain(
        `revoke execute on function public.${signature}`,
      );
    }
    expect(migration).toContain("from authenticated");
    expect(migration).toContain(
      "grant execute on function public.admin_confirmation_save_round(jsonb)\n  to service_role",
    );
    expect(migration).toContain(
      "before insert or update on public.submission_rounds",
    );
    expect(migration).toContain(
      "before delete on public.submission_rounds",
    );
    expect(migration).toContain(
      "Confirmation round changes must use the Organisation OS operation contract.",
    );
  });

  it("removes direct legacy mutations from the Organizer page", () => {
    expect(client).toContain(
      'rpc("studio2_confirmation_round_change_preview"',
    );
    expect(client).toContain(
      'rpc("studio2_apply_confirmation_round_change"',
    );

    for (const legacy of [
      "saveConfirmationRound",
      "deleteConfirmationRound",
      "setConfirmationRoundStatus",
      "setConfirmationRoundEditing",
    ]) {
      expect(route).not.toContain(legacy);
    }

    expect(route).toContain("createOrganisationCommand");
    expect(route).toContain("operationId: pending.operationId");
    expect(route).toContain("idempotencyKey: pending.idempotencyKey");
    expect(route).toContain(
      "expectedVersion: pending.preview.expectedVersion",
    );
    expect(route).toContain("AdminConfirmSheet");
    expect(route).toContain("confirmDisabled");
    expect(route).toContain("RoundImpactPreview");
    expect(route).toContain("Review changes");
  });
});
