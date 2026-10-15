import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { v3DomainConsequence } from "./v3-domain-consequence-registry";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("System V3 S2 Entry correction vertical slice", () => {
  const migration = source(
    "supabase/migrations/20261015040000_v3_s2_entry_correction_operation.sql",
  );
  const route = source("src/routes/confirmations/admin/responses/$id.tsx");
  const tasks = source("src/lib/participation-os.ts");

  it("claims the existing receipt ledger with the semantic request and server actor", () => {
    expect(migration).toContain("private.studio2_claim_operation(");
    expect(migration).toContain("coalesce(p_correlation_id, p_operation_id)");
    expect(migration).toContain("'entry.request_changes'");
    expect(migration).toContain("'expectedEntryVersion', p_expected_entry_version");
    expect(migration).toContain("'reason', v_reason");
    expect(migration).not.toContain("p_actor_id");
  });

  it("keeps authorization, exact revision CAS, mutation, audit and receipt atomic", () => {
    expect(migration).toContain("studio2_access_allowed('confirmation.manage'");
    expect(migration).toContain("message = 'VERSION_CONFLICT'");
    expect(migration).toContain("for update");
    expect(migration).toContain("insert into public.submission_review_history");
    expect(migration).toContain("private.studio2_complete_operation");
    expect(migration).toContain("public.studio2_reconcile_operation(v_operation_id)");
    expect(migration).not.toContain("insert into public.domain_events");
    expect(migration).not.toContain("insert into public.outbox");
  });

  it("returns the original receipt on replay and rejects changed semantic reuse", () => {
    expect(migration).toContain("if coalesce((v_claim ->> 'replayed')::boolean, false)");
    expect(migration).toContain("jsonb_build_object('replayed', true)");
    expect(migration).toContain("jsonb_build_object('replayed', false)");
    expect(migration).toContain("'reviewState', case");
    expect(migration).toContain("'changes_requested'");
  });

  it("carries correlation through the Organizer command and exposes recovery evidence", () => {
    expect(route).toContain("command:");
    expect(route).toContain('"entry.request_changes"');
    expect(route).toContain("p_correlation_id: command.correlationId");
    expect(route).toContain("reconcileSystemOperation");
    expect(route).toContain("normalizeSystemReceipt(mutation.data)");
    expect(route).toContain("Operation receipt");
  });

  it("projects the authoritative declined state into the existing participant task", () => {
    expect(tasks).toContain("id: `entry-declined:${response.submission_id}`");
    expect(tasks).toContain('title: "Your entry needs changes"');
    expect(tasks).toContain('reviewStatus(response.internal_entry.review_status) === "declined"');
    expect(v3DomainConsequence("entry.changes_requested")?.implementationState).toBe("declared");
  });
});
