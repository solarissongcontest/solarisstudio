import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const migration = () => read("supabase/migrations/20261026190000_v3_anniversary_date_operation.sql");
const route = () => read("src/routes/_authenticated/admin/anniversary-dates.tsx");
const client = () => read("src/lib/v3-anniversary-dates.ts");

function functionBody(source: string, name: string) {
  const marker = `create or replace function ${name}`;
  const start = source.indexOf(marker);
  expect(start).toBeGreaterThanOrEqual(0);
  const next = source.indexOf("\nrevoke all on function", start);
  expect(next).toBeGreaterThan(start);
  return source.slice(start, next);
}

describe("System #633 governed anniversary edition-date operation", () => {
  it("registers the non-trivial migration with the S13 adoption framework", () => {
    const sql = migration();
    expect(sql).toContain("public.v3_register_migration_contract(");
    expect(sql).toContain("'v3.storytelling.anniversary-date-operation'");
    expect(sql).toContain("'forward_fix_only'");
  });

  it("makes every event-date mutation advance the canonical edition CAS token", () => {
    const sql = migration();
    const body = functionBody(sql, "private.v3_bump_edition_anniversary_date_revision");

    expect(body).toContain("new.event_date is distinct from old.event_date");
    expect(body).toContain("new.data_revision := old.data_revision + 1");
    expect(sql).toContain("before update of event_date on public.editions");
  });

  it("previews exact-edition impact under canonical Storytelling authorization", () => {
    const body = functionBody(migration(), "public.studio2_anniversary_date_preview");

    expect(body).toContain("auth.uid()");
    expect(body).toContain("private.studio2_can_manage_storytelling(v_actor, p_edition_id)");
    expect(body).toContain("where edition.id = p_edition_id");
    expect(body).toContain("'expectedVersion', v_edition.data_revision");
    expect(body).toContain("extract(year from p_event_date)::integer");
  });

  it("claims one stable operation before CAS and returns durable readback", () => {
    const body = functionBody(migration(), "public.studio2_apply_anniversary_date");
    const claim = body.indexOf("private.studio2_claim_operation");
    const lock = body.indexOf("for update");
    const cas = body.indexOf("VERSION_CONFLICT");
    const write = body.indexOf("update public.editions");
    const history = body.indexOf("insert into public.studio2_anniversary_date_history");
    const complete = body.indexOf("private.studio2_complete_operation");
    const reconcile = body.lastIndexOf("public.studio2_reconcile_operation");

    expect(body).toContain("'story.anniversary_date.set'");
    expect(body).toContain("'R2'");
    expect(body).toContain("private.studio2_can_manage_storytelling(v_actor, p_edition_id)");
    expect(body).toContain("v_before.data_revision is distinct from p_expected_version");
    expect(claim).toBeGreaterThanOrEqual(0);
    expect(lock).toBeGreaterThan(claim);
    expect(cas).toBeGreaterThan(lock);
    expect(write).toBeGreaterThan(cas);
    expect(history).toBeGreaterThan(write);
    expect(complete).toBeGreaterThan(history);
    expect(reconcile).toBeGreaterThan(complete);
  });

  it("keeps immutable before/after audit history outside browser table authority", () => {
    const sql = migration();

    expect(sql).toContain("studio2_anniversary_date_history_immutable");
    expect(sql).toContain("raise exception 'Anniversary date history is immutable'");
    expect(sql).toContain("revoke all on table public.studio2_anniversary_date_history from public, anon, authenticated");
    expect(sql).toContain("previous_event_date");
    expect(sql).toContain("previous_version");
    expect(sql).toContain("reason text not null");
  });

  it("cuts the Organizer editor over from direct editions writes to preview/apply/reconcile", () => {
    const routeSource = route();
    const clientSource = client();

    expect(routeSource).toContain("previewAnniversaryDate");
    expect(routeSource).toContain("applyAnniversaryDate");
    expect(routeSource).not.toContain('.from("editions")');
    expect(routeSource).not.toContain(".update({");
    expect(routeSource).toContain("auditReason");
    expect(routeSource).toContain("pendingReview.operationId");
    expect(clientSource).toContain('rpc("studio2_anniversary_date_preview"');
    expect(clientSource).toContain('rpc("studio2_apply_anniversary_date"');
    expect(clientSource).toContain('rpc("studio2_reconcile_operation"');
    expect(clientSource).toContain('command: "story.anniversary_date.set"');
  });

  it("does not accidentally widen RPC access to anonymous callers", () => {
    const sql = migration();

    expect(sql).toContain(
      "revoke all on function public.studio2_apply_anniversary_date(\n  uuid, date, bigint, uuid, text, text, uuid\n) from public, anon, authenticated;",
    );
    expect(sql).toContain(
      "grant execute on function public.studio2_apply_anniversary_date(\n  uuid, date, bigint, uuid, text, text, uuid\n) to authenticated, service_role;",
    );
  });
});
