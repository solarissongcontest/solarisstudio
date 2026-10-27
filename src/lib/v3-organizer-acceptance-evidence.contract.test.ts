import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync("src/routes/_authenticated/admin/beta-test.tsx", "utf8");
const client = readFileSync("src/integrations/v3/organizer-acceptance-evidence.ts", "utf8");
const compatibilityExport = readFileSync("src/lib/v3-organizer-acceptance-evidence.ts", "utf8");
const migration = readFileSync("supabase/migrations/20261027153000_v3_admin_beta_acceptance_submission.sql", "utf8");
const rehearsal = readFileSync(".github/scripts/v3-admin-beta-acceptance-rehearsal.sh", "utf8");

describe("V3 governed Organizer acceptance evidence", () => {
  it("removes direct browser table writes and preserves stable submit identity", () => {
    expect(route).toContain("submitOrganizerAcceptanceEvidence");
    expect(route).toContain("submissionOperationRef");
    expect(route).toContain("idempotencyKey");
    expect(route).not.toContain('.from("admin_beta_test_submissions"');
    expect(route).not.toContain(".insert(payload as never)");
    expect(compatibilityExport).toContain("@/integrations/v3/organizer-acceptance-evidence");
    expect(compatibilityExport).not.toContain("integrations/supabase");
  });

  it("authorizes, scopes and classifies the migration contract on the server", () => {
    expect(migration).toContain("v3_register_migration_contract(");
    expect(migration).toContain("'v3.organizer.admin-beta-acceptance-submission'");
    expect(migration).toContain("'forward_fix_only'");
    expect(migration).toContain("studio2_access_allowed('rollout.manage', p_edition_id, false)");
    expect(migration).toContain("p_answers ->> 'organizerEditionId'");
    expect(migration).toContain("edition_id uuid references public.editions");
    expect(migration).toContain("submitted_by uuid references auth.users");
    expect(migration).toContain('revoke insert on table public.admin_beta_test_submissions from authenticated');
    expect(migration).toContain('drop policy if exists "Organizers can submit admin beta feedback"');
  });

  it("uses the canonical receipt envelope rather than blind retry", () => {
    expect(migration).toContain("private.studio2_claim_operation(");
    expect(migration).toContain("'qa.acceptance.submit'");
    expect(migration).toContain("private.studio2_complete_operation(p_operation_id, v_result)");
    expect(client).toContain('client.rpc("studio2_reconcile_operation"');
    expect(client).toContain("A lost response must never create a replacement mutation");
    expect(client).not.toContain("while (");
  });

  it("keeps destructive runtime proof isolated to loopback Supabase", () => {
    expect(rehearsal).toContain("Refusing hosted Supabase rehearsal");
    expect(rehearsal).toContain("Refusing non-local database rehearsal");
    expect(rehearsal).toContain("direct authenticated table insert");
    expect(rehearsal).toContain("changed semantic replay");
    expect(rehearsal).toContain("foreign caller");
  });
});
