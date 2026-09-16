import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationName = readdirSync(resolve(process.cwd(), "supabase/migrations")).find((name) =>
  name.endsWith("_permission_engine_v2_transition_approval_rpc_cutover.sql"),
);
if (!migrationName) throw new Error("transition approval RPC cutover migration missing");

const migration = readFileSync(resolve(process.cwd(), "supabase/migrations", migrationName), "utf8");

function block(qualifiedName: string) {
  const marker = `create or replace function ${qualifiedName}`;
  const lower = migration.toLowerCase();
  const start = lower.indexOf(marker);
  expect(start).toBeGreaterThanOrEqual(0);
  const next = lower.indexOf("create or replace function", start + marker.length);
  return migration.slice(start, next === -1 ? migration.length : next);
}

describe("transition approval Permission Engine RPC cutover", () => {
  it("moves request/list approval paths to non-strict edition.manage", () => {
    for (const name of [
      "public.studio2_request_transition_approval",
      "public.studio2_list_transition_approvals",
    ]) {
      const fn = block(name);
      expect(fn).toContain("studio2_access_allowed('edition.manage', p_edition_id, false)");
      expect(fn).not.toContain("has_role");
    }
  });

  it("moves approval authorization to the request edition and preserves hardened lock order", () => {
    const fn = block("public.studio2_approve_transition");
    expect(fn).toContain("studio2_access_allowed('edition.manage', v_request.edition_id, false)");
    expect(fn).not.toContain("has_role");

    const scopeRead = fn.indexOf("where id = p_request_id;");
    const authorization = fn.indexOf("studio2_access_allowed('edition.manage', v_request.edition_id, false)");
    const runtimeLock = fn.indexOf("for share;");
    const requestLock = fn.indexOf("where id = p_request_id\n  for update;");
    expect(scopeRead).toBeGreaterThanOrEqual(0);
    expect(authorization).toBeGreaterThan(scopeRead);
    expect(runtimeLock).toBeGreaterThan(authorization);
    expect(requestLock).toBeGreaterThan(runtimeLock);

    expect(fn).toContain("A transition requester cannot approve their own request");
    expect(fn).toContain("Transition approval request is no longer active");
    expect(fn).toContain("Edition state changed; this approval request is stale");
    expect(fn).toContain("edition.transition_approval_granted");
  });

  it("keeps dynamic edition.manage / edition.archive authorization for transition execution", () => {
    const fn = block("public.studio2_transition_edition_v2");
    expect(fn).toContain("when p_to = 'archived' then 'edition.archive'");
    expect(fn).toContain("else 'edition.manage'");
    expect(fn).toContain("studio2_access_allowed(v_required_capability, p_edition_id, false)");
    expect(fn).not.toContain("has_role");
  });

  it("preserves the genuine two-person critical-transition contract", () => {
    const fn = block("public.studio2_transition_edition_v2");
    expect(fn).toContain("p_approval_request_id");
    expect(fn).toContain("v_approval.requested_by <> v_actor");
    expect(fn).toContain("v_approval.approved_by is null");
    expect(fn).toContain("v_approval.approved_by = v_actor");
    expect(fn).toContain("v_approval.consumed_at is not null");
    expect(fn).toContain("v_approval.expires_at <= now()");
    expect(fn).toContain("v_approval.reason <> v_reason");
    expect(fn).toContain("set consumed_at = now()");
    expect(fn).toContain("edition.state_changed");
  });

  it("keeps all four browser RPCs authenticated/service-role only", () => {
    expect(migration.match(/from public, anon;/g)?.length).toBeGreaterThanOrEqual(4);
    expect(migration.match(/to authenticated, service_role;/g)?.length).toBeGreaterThanOrEqual(4);
  });

  it("does not reintroduce the already-cut transition approval read policy or enable Permission Engine v2", () => {
    expect(migration).not.toContain("create policy studio2_transition_approval");
    expect(migration).not.toContain("update public.studio2_feature_flags");
    expect(migration).not.toContain("insert into public.studio2_feature_flags");
  });
});
