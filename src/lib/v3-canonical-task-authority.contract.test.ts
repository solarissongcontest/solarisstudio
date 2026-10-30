import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../..");
const migration = readFileSync(
  resolve(root, "supabase/migrations/20261030092000_v3_canonical_task_read_projection.sql"),
  "utf8",
);
const adminTasks = readFileSync(resolve(root, "src/lib/admin-tasks-v5.ts"), "utf8");
const bootstrap = readFileSync(resolve(root, "src/lib/v3-bootstrap.ts"), "utf8");
const participate = readFileSync(resolve(root, "src/components/v3/V3ParticipateScreen.tsx"), "utf8");

describe("V3 canonical Task authority contract", () => {
  it("reconciles Organizer task truth through the single existing Task Engine owner before reads", () => {
    expect(migration).toContain("perform private.studio2_reconcile_all_organizer_tasks(p_edition_id)");
    expect(migration).toContain("from public.studio2_organizer_tasks task");
    expect(migration).toContain("'authoritativeSource', 'studio2_organizer_tasks'");
    expect(migration).toContain("'reconciled', true");
  });

  it("does not introduce a second direct writer for the Organizer task projection", () => {
    expect(migration).not.toMatch(/insert\s+into\s+public\.studio2_organizer_tasks/i);
    expect(migration).not.toMatch(/update\s+public\.studio2_organizer_tasks/i);
    expect(migration).not.toMatch(/delete\s+from\s+public\.studio2_organizer_tasks/i);
    expect(migration).not.toContain("create or replace function public.studio2_runtime_contract");
  });

  it("keeps Organizer authorization, bounds and server-time classification inside the canonical RPC", () => {
    expect(migration).toContain("public.studio2_access_allowed('edition.read', p_edition_id, false)");
    expect(migration).toContain("v_limit < 1 or v_limit > 200");
    expect(migration).toContain("v_offset < 0 or v_offset > 5000");
    expect(migration).toContain("v_now timestamptz := now()");
    expect(migration).toContain("p_task.due_at <= p_now");
    expect(migration).toContain("grant execute on function public.admin_organizer_tasks_v3");
  });

  it("makes Organizer Tasks prefer the canonical V3 read and fail closed on real V3 errors", () => {
    expect(adminTasks).toContain('client.rpc("admin_organizer_tasks_v3"');
    expect(adminTasks).toContain("if (!isMissingV3TaskRpc(canonical.error))");
    expect(adminTasks).toContain("Organizer Tasks V3 did not prove canonical reconciliation");
  });

  it("normalizes participant task truth before Home, Journey, Attention and Participate consume it", () => {
    expect(bootstrap).toContain("canonicalizeParticipantTasks(source.tasks)");
    expect(bootstrap).toContain("projectParticipantTaskReadModel");
    expect(bootstrap).toContain("projectV3Actions(canonicalTasks");
    expect(bootstrap).toContain("projectV3Journey(canonicalTasks)");
  });

  it("keeps the V3 Participate component a renderer rather than another domain reader", () => {
    expect(participate).not.toContain("buildParticipationTasks");
    expect(participate).not.toContain("country_jury_voting_context");
    expect(participate).not.toContain("public_country_account_confirmation");
    expect(participate).not.toContain("televotingSupabase");
  });
});
