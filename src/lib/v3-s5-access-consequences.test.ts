import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { v3DomainConsequence } from "./v3-domain-consequence-registry";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const migration = source(
  "supabase/migrations/20261017100000_v3_s5_access_consequences.sql",
);
const rehearsal = source(
  ".github/scripts/v3-s5-access-consequences-rehearsal.sh",
);

describe("System V3 S5 membership/access consequences", () => {
  it("binds events to the canonical successful Permission Engine operation receipt", () => {
    expect(migration).toContain("on public.studio2_operation_receipts");
    expect(migration).toContain("after update of status, result");
    expect(migration).toContain("new.status <> 'succeeded'");
    expect(migration).toContain("old.status = 'succeeded'");
    expect(migration).toContain("new.operation_id");
    expect(migration).toContain("v_version <= v_previous_version");
  });

  it("emits membership plus permissions for role changes and permissions only for direct grants", () => {
    expect(migration).toContain("v_change_kind in ('assign_role', 'revoke_role')");
    expect(migration).toContain("'membership.changed'");
    expect(migration).toContain("'permissions.changed'");
    expect(migration).toContain("'membership'");
    expect(migration).toContain("'permission_subject'");
    expect(migration).toContain("'grant_capability'");
    expect(migration).toContain("'revoke_capability'");
  });

  it("does not fabricate events for no-op permission receipts or later receipt enrichment", () => {
    expect(migration).toContain("not coalesce((new.result ->> 'changed')::boolean, false)");
    expect(migration).toContain("if old.status = 'succeeded' then");
    expect(migration).toContain("Successful permission operation has incomplete or inconsistent event provenance");
  });

  it("keeps access-event payloads bounded to permission semantics", () => {
    expect(migration).toContain("'changeKind', v_change_kind");
    expect(migration).toContain("'previousVersion', v_previous_version");
    expect(migration).toContain("'globalScope', v_edition_id is null");
    expect(migration).not.toContain("'email'");
    expect(migration).not.toContain("'displayName'");
    expect(migration).not.toContain("raw_user_meta_data");
  });

  it("uses one replay-safe service-only task reconciliation consumer", () => {
    expect(migration).toContain("array['access.tasks']::text[]");
    expect(migration).toContain("private.v3_domain_event_consumer_receipts");
    expect(migration).toContain("v_delivery.lease_owner is distinct from p_worker_id");
    expect(migration).toContain("private.studio2_reconcile_permission_approval_tasks()");
    expect(migration).toContain("private.studio2_sync_task_notifications(null)");
    expect(migration).toContain("private.studio2_request_is_service_role()");
  });

  it("marks membership and permission change consequences event-backed", () => {
    expect(v3DomainConsequence("membership.changed")?.implementationState).toBe("event-backed");
    expect(v3DomainConsequence("permissions.changed")?.implementationState).toBe("event-backed");
    expect(v3DomainConsequence("membership.changed")?.ownerDomain).toBe("membership");
    expect(v3DomainConsequence("permissions.changed")?.ownerDomain).toBe("permissions");
  });

  it("rehearses the actual R3 two-operator path and refuses hosted targets", () => {
    expect(rehearsal).toContain("studio2_request_permission_change_approval");
    expect(rehearsal).toContain("studio2_approve_permission_change");
    expect(rehearsal).toContain("studio2_apply_permission_change_r3");
    expect(rehearsal).toContain("membership.changed event missing");
    expect(rehearsal).toContain("direct grant fabricated membership.changed");
    expect(rehearsal).toContain("Access consequence replay was not idempotent");
    expect(rehearsal).toContain("Refusing hosted Supabase rehearsal");
  });
});
