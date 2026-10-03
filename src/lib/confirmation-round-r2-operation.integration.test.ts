import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("Organisation OS V5 Confirmation round R2 contract", () => {
  const migration = source(
    "supabase/migrations/20261003014000_organisation_os_v5_confirmation_round_r2.sql",
  );
  const service = source("src/integrations/confirmations/admin.ts");
  const route = source("src/routes/confirmations/admin/rounds.tsx");
  const adminUi = source("src/components/admin/AdminUI.tsx");

  it("versions round configuration and response-count changes", () => {
    expect(migration).toContain(
      "add column if not exists operation_version bigint",
    );
    expect(migration).toContain(
      "studio2_confirmation_round_version_before_update",
    );
    expect(migration).toContain(
      "studio2_confirmation_submission_round_version",
    );
    expect(migration).toContain(
      "after insert or update of round_id or delete on public.submissions",
    );
  });

  it("keeps a submission round separate from edition confirmation requirements", () => {
    expect(migration).toContain(
      "public.studio2_confirmation_requirements requirement",
    );
    expect(migration).toContain(
      "requirement.superseded_at is null",
    );
    expect(migration).toContain(
      "'requiredRequirementCount'",
    );
    expect(migration).toContain(
      "'satisfiedRequirementCount'",
    );
    expect(migration).toContain(
      "'waivedRequirementCount'",
    );
    expect(migration).not.toContain(
      "insert into public.studio2_confirmation_requirements",
    );
    expect(route).toContain(
      "This opens a submission window only. It does not create a new confirmation requirement for anyone.",
    );
  });

  it("binds open and close to one R2 impact preview and operation receipt", () => {
    expect(migration).toContain(
      "public.admin_confirmation_round_status_preview",
    );
    expect(migration).toContain(
      "public.admin_confirmation_apply_round_status",
    );
    expect(migration).toContain(
      "private.studio2_claim_operation(",
    );
    expect(migration).toContain(
      "'confirmation.round.status.change'",
    );
    expect(migration).toContain("'R2'");
    expect(migration).toContain(
      "Confirmation round changed since this impact preview was loaded. Refresh before continuing.",
    );
    expect(migration).toContain("using errcode = '40001'");
    expect(migration).toContain(
      "private.studio2_complete_operation(v_operation_id, v_result)",
    );
    expect(service).toContain(
      '"admin_confirmation_round_status_preview"',
    );
    expect(service).toContain(
      '"admin_confirmation_apply_round_status"',
    );
    expect(route).toContain("operationId: crypto.randomUUID()");
    expect(route).toContain("idempotencyKey: crypto.randomUUID()");
    expect(route).toContain(
      "expectedVersion: pending.preview.expectedVersion",
    );
  });

  it("blocks reopening a full round and preserves existing reopen semantics", () => {
    expect(migration).toContain(
      "Increase the response limit before reopening this full round.",
    );
    expect(migration).toContain(
      "and (opens_at is null or opens_at > now())",
    );
    expect(migration).toContain(
      "and closes_at is not null",
    );
    expect(migration).toContain(
      "and closes_at <= now()",
    );
    expect(migration).toContain(
      "'expiredClosingTimeWillBeCleared'",
    );
    expect(migration).toContain(
      "'futureOpeningTimeWillBecomeNow'",
    );
  });

  it("prevents stale configuration saves from replaying an old operational status", () => {
    const saveFunction = migration.slice(
      migration.indexOf(
        "create or replace function public.admin_confirmation_save_round",
      ),
    );
    expect(saveFunction).toContain("'draft'");
    expect(saveFunction).not.toContain("set\n      status =");
    expect(service).not.toContain(
      'status: ConfirmationRound["status"];\n  opens_at',
    );
    expect(route).not.toContain("status: form.status");
  });

  it("removes the authenticated legacy status bypass and blocks raw table writes", () => {
    expect(migration).toContain(
      "revoke execute on function public.admin_confirmation_set_round_status(uuid, text)",
    );
    expect(migration).toContain("from authenticated;");
    expect(migration).toContain(
      "studio2_guard_confirmation_round_direct_write",
    );
    expect(migration).toContain(
      "Confirmation round changes must use the governed Organizer command.",
    );
  });

  it("shows blockers in the confirmation surface instead of allowing the button through", () => {
    expect(route).toContain(
      "confirmDisabled={Boolean(pendingStatus?.preview.blockers.length)}",
    );
    expect(route).toContain("This transition is blocked:");
    expect(adminUi).toContain(
      "disabled={busy || !allowed || confirmDisabled}",
    );
  });
});
