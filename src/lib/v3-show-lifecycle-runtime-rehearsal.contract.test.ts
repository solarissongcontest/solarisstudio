import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const commands = source("supabase/migrations/20261024203500_v3_show_lifecycle_commands.sql");
const events = source("supabase/migrations/20261024203600_v3_show_lifecycle_events.sql");
const r3Evidence = source(
  "supabase/migrations/20261024203700_v3_show_lifecycle_r3_receipt_evidence.sql",
);
const rehearsal = source("scripts/rehearse-v3-show-lifecycle.sh");

describe("System V3 governed Show lifecycle runtime rehearsal", () => {
  it("hardens R3 receipts with the exact fresh Auth session evidence used at commit", () => {
    expect(r3Evidence).toContain("'v3.o6.show-lifecycle-r3-receipt-evidence'");
    expect(r3Evidence).toContain("'forward_fix_only'");
    expect(r3Evidence).toContain("v_auth_evidence := private.studio2_require_fresh_auth(300)");
    expect(r3Evidence).toContain("actor_session_id = v_auth_evidence ->> 'sessionId'");
    expect(r3Evidence).toContain("auth_freshness_evidence = v_auth_evidence");
    expect(r3Evidence).toContain("and status = 'processing'");
    expect(r3Evidence.indexOf("if coalesce((v_claim ->> 'replayed')::boolean, false) then")).toBeLessThan(
      r3Evidence.indexOf("private.studio2_require_fresh_auth(300)"),
    );
    expect(r3Evidence.indexOf("auth_freshness_evidence = v_auth_evidence")).toBeLessThan(
      r3Evidence.indexOf("private.studio2_complete_operation(v_operation_id, v_result)"),
    );
  });

  it("retains canonical command and show.changed ownership rather than adding a test-only writer", () => {
    for (const rpc of [
      "studio2_create_show_v3",
      "studio2_update_show_v3",
      "studio2_update_show_mode_v3",
      "studio2_delete_show_v3",
    ]) {
      expect(commands).toContain(`public.${rpc}`);
      expect(rehearsal).toContain(rpc);
    }
    expect(events).toContain("'show.changed'");
    expect(rehearsal).not.toContain("insert into private.v3_domain_events");
    expect(rehearsal).not.toContain("insert into public.studio2_operation_receipts");
  });

  it("uses a real local Auth session and exact-edition capability boundary", () => {
    expect(rehearsal).toContain("/auth/v1/admin/users");
    expect(rehearsal).toContain("/auth/v1/token?grant_type=password");
    expect(rehearsal).toContain("jwt_claim \"$TOKEN\" session_id");
    expect(rehearsal).toContain("from auth.sessions");
    expect(rehearsal).toContain("'edition.manage'");
    expect(rehearsal).toContain("unauthorized Show create");
    expect(rehearsal.indexOf("unauthorized Show create")).toBeLessThan(
      rehearsal.indexOf("insert into public.studio2_capability_grants"),
    );
  });

  it("proves replay, CAS, dependency blocking, Show Mode and permanent deletion in one lifecycle", () => {
    expect(rehearsal).toContain("exact create replay");
    expect(rehearsal).toContain("stale Show update");
    expect(rehearsal).toContain("governed Show Mode update");
    expect(rehearsal).toContain("v3_show_lifecycle_rehearsal_dependency");
    expect(rehearsal).toContain("dependency-blocked R3 Show delete");
    expect(rehearsal).toContain("drop table public.v3_show_lifecycle_rehearsal_dependency");
    expect(rehearsal).toContain("governed R3 Show delete");
    expect(rehearsal).toContain("exact Show delete replay");
    expect(rehearsal).toContain("auth_freshness_evidence->>'fresh'='true'");
    expect(rehearsal).toContain('EVENT_VERSIONS');
    expect(rehearsal).toContain('"1,2,3,5"');
  });

  it("proves compatibility writers still participate in Show CAS without fabricating events", () => {
    expect(rehearsal).toContain("update public.shows set name=name");
    expect(rehearsal).toContain("Compatibility update did not advance version 4");
    expect(rehearsal).toContain("compatibility-version gap");
    expect(rehearsal).toContain("aggregate_version=5");
    expect(rehearsal).toContain("show_id is null");
  });

  it("fails closed against hosted Supabase with no production escape hatch", () => {
    expect(rehearsal).toContain("http://127.0.0.1:*");
    expect(rehearsal).toContain("http://localhost:*");
    expect(rehearsal).toContain("Refusing hosted Supabase rehearsal");
    expect(rehearsal).toContain("Refusing non-local database rehearsal");
    expect(rehearsal).not.toContain(".supabase.co");
    expect(rehearsal).not.toContain("ALLOW_PRODUCTION");
  });
});
