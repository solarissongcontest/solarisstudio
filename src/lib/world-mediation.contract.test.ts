import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  MEDIATION_NEXT, allowedMediationTargets, mediationReasonRequired,
  parseMediationCase, parseMediationHistory, mediationError,
} from "./world-mediation";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const sql = () => read("supabase/migrations/20261107003000_v3_tg13_mediation.sql");
const validId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

describe("TG13 mediation state and private evidence", () => {
  it("matches a consent-first state machine and makes terminal closure final", () => {
    expect(MEDIATION_NEXT.requested).toEqual(["accepted", "failed"]);
    expect(MEDIATION_NEXT.accepted).toEqual(["open", "failed"]);
    expect(MEDIATION_NEXT.open).toEqual(["negotiating", "failed"]);
    expect(MEDIATION_NEXT.negotiating).toEqual(["settled", "failed", "referred_to_court"]);
    expect(MEDIATION_NEXT.settled).toEqual(["closed"]);
    expect(MEDIATION_NEXT.failed).toEqual(["closed"]);
    expect(MEDIATION_NEXT.referred_to_court).toEqual(["closed"]);
    expect(MEDIATION_NEXT.closed).toEqual([]);
    expect(allowedMediationTargets("requested", false, true)).toEqual([]);
    expect(allowedMediationTargets("requested", true, false)).toEqual(["accepted", "failed"]);
    expect(allowedMediationTargets("negotiating", true, false)).toEqual([]);
    expect(allowedMediationTargets("negotiating", false, true)).toEqual(["settled", "failed", "referred_to_court"]);
    for (const terminal of ["settled", "failed", "referred_to_court", "closed"] as const) {
      expect(mediationReasonRequired(terminal)).toBe(true);
    }
    expect(mediationReasonRequired("accepted")).toBe(false);
  });

  it("rejects unverifiable server revisions/states and never invents missing cases", () => {
    const row = {
      id: validId,
      organization_id: validId,
      requester_country_id: validId,
      respondent_country_id: validId,
      issue_summary: "An official mediation dispute.",
      state: "requested",
      revision: 1,
      submitted_at: "2026-11-07T00:00:00Z",
      updated_at: "2026-11-07T00:00:00Z",
      closed_at: null,
      closure_reason: null,
    };
    expect(parseMediationCase(row).state).toBe("requested");
    expect(() => parseMediationCase({ ...row, revision: 0 })).toThrow();
    expect(() => parseMediationCase({ ...row, state: "judgment_issued" })).toThrow();
    expect(() => parseMediationCase({ ...row, id: "not-an-id" })).toThrow();
    expect(() => parseMediationHistory({ id: validId, from_state: null,
      to_state: "requested", revision: 1, occurred_at: "2026-11-07", reason: null })).not.toThrow();
    expect(mediationError({ message: "VERSION_CONFLICT" })).toMatch(/Refresh/);
    expect(mediationError({ message: "AUTHORIZATION" })).toMatch(/authorization/);
  });

  it("keeps direct table mutation disabled and defaults to private-only read", () => {
    const source = sql();
    for (const fragment of [
      "alter table public.world_mediation_cases enable row level security",
      "alter table public.world_mediation_history enable row level security",
      "revoke all on public.world_mediation_cases, public.world_mediation_history",
      "grant select on public.world_mediation_cases, public.world_mediation_history to authenticated",
      "world_mediation_participant_read",
      "world_mediation_history_participant_read",
      "ca.status = 'active'",
      "ca.user_id = auth.uid()",
      "world.mediation.manage",
      "world.mediation.respond",
      "world.mediation.request",
      "visibility text not null default 'private'",
    ]) expect(source).toContain(fragment);
    expect(source).not.toMatch(/grant (insert|update|delete|all) on public\.world_mediation_cases[^;]*to authenticated/i);
    expect(source).not.toMatch(/create policy [^;]+to anon/i);
  });

  it("requires server authority, CAS, locks, idempotent receipts and event history", () => {
    const source = sql();
    for (const fragment of [
      "create function public.world_request_mediation_v1",
      "create function public.world_transition_mediation_v1",
      "private.studio2_claim_operation",
      "private.studio2_complete_operation",
      "public.studio2_reconcile_operation",
      "private.v3_emit_domain_event",
      "p_expected_revision is null",
      "v_case.revision is distinct from p_expected_revision",
      "from public.world_mediation_cases where id = p_case_id for update",
      "for share;",
      "unique (case_id, revision)",
      "operation_id uuid not null unique",
      "and not v_respondent",
      "and not v_manager",
    ]) expect(source).toContain(fragment);
    expect(source).toContain("p_target_state in ('accepted','failed')");
    expect(source).toContain("and p_target_state = 'closed'");
  });

  it("does not disclose the private case in the public gate or browser-side writes", () => {
    const adapter = read("src/lib/world-mediation.ts");
    const component = read("src/components/world/WorldMediationWorkspace.tsx");
    const route = read("src/routes/world/mediation/index.tsx");
    expect(route).toContain("<WorldPublicGate verifyOnMount>");
    expect(route).toContain('noindex,nofollow');
    expect(adapter).toContain('supabase.auth.getUser()');
    expect(adapter).toContain('.from("world_mediation_cases")');
    expect(adapter).toContain('.from("world_mediation_history")');
    expect(adapter).toContain('world_request_mediation_v1');
    expect(adapter).toContain('world_transition_mediation_v1');
    expect(adapter).toContain('if (!isObject(input) || input.ok !== true)');
    expect(component).toContain('crypto.randomUUID()');
    expect(component).toContain('previous?.fingerprint === fingerprint');
    expect(component).toContain('new Map(');
    for (const source of [adapter, component]) {
      expect(source).not.toMatch(/\.from\("world_mediation_(?:cases|history)"\)\s*\.\s*(?:insert|upsert|update|delete)\s*\(/);
      expect(source).not.toContain('service_role');
    }
  });
});
