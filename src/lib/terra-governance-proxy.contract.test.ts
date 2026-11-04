import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const migration = source(
  "supabase/migrations/20261104123000_v3_tg6_proxy_request_decision.sql",
);
const tg2 = source(
  "supabase/migrations/20261102171500_v3_tg2_world_institution_core.sql",
);
const tg6 = source(
  "supabase/migrations/20261104114000_v3_tg6_world_session_agenda.sql",
);
const fixture = source("scripts/rehearse-v3-world-proxy-commands.sql");
const runner = source("scripts/rehearse-v3-world-proxy-commands.sh");

const request = migration.slice(
  migration.indexOf("create or replace function public.world_request_proxy_v1"),
  migration.indexOf("create or replace function public.world_approve_proxy_v1"),
);
const approval = migration.slice(
  migration.indexOf("create or replace function public.world_approve_proxy_v1"),
  migration.indexOf("create or replace function public.world_revoke_proxy_v1"),
);
const revocation = migration.slice(
  migration.indexOf("create or replace function public.world_revoke_proxy_v1"),
  migration.indexOf("create or replace function public.world_proxy_review_queue_v1"),
);

describe("TG6 institutional acting-proxy authorization", () => {
  it("extends TG2's one-representative durable identity and TG6's sessions", () => {
    expect(tg2).toContain("create table public.world_representation_proxies");
    expect(tg2).toContain("world_representation_proxies_rep_idx");
    expect(tg6).toContain("create table public.world_sessions");
    expect(migration).toContain("add column if not exists approved_at timestamptz");
    expect(migration).toContain("foreign key (session_id) references public.world_sessions(id)");
    expect(migration).toContain("world_proxy_representation_window_idx");
    expect(migration).toContain("'v3.tg6.world-proxy-request-decision'");
    expect(migration).toContain("'forward_fix_only'");
  });

  it("requires an authenticated active controller or representative and a world-scoped request capability", () => {
    expect(request).toContain("v_actor uuid := auth.uid()");
    expect(request).toContain("account_row.status='active'");
    expect(request).toContain("coalesce(v_rep.user_id = v_actor,false)");
    expect(request).toContain("'world.proxy.request'");
    expect(request).toContain("v_rep.organization_id,v_rep.country_id");
    expect(request).toContain("'representation',v_rep.id");
    expect(request).toContain("member_row.status='member'");
    expect(request).toContain("p_expected_representation_revision");
    expect(request).toContain("for update");
    expect(request).not.toContain("world_proxy_is_effective");
  });

  it("rejects cross-organization sessions, ineligible life cycles and excessive proxy windows", () => {
    expect(request).toContain("v_session.organization_id <> v_rep.organization_id");
    expect(request).toContain("v_session.status not in ('scheduled','open','recessed')");
    expect(request).toContain("p_valid_from < v_session.starts_at");
    expect(request).toContain("p_valid_until > v_session.ends_at");
    expect(request).toContain("p_valid_until <= now()");
    expect(request).toContain("interval '14 days'");
    expect(request).toContain("p_proxy_person_id = v_rep.person_id");
    expect(request).toContain("PROXY_ALREADY_PENDING");
  });

  it("does not take unproven login mappings or create an independent voting identity", () => {
    expect(request).toContain("term_row.person_id=p_proxy_person_id");
    expect(request).toContain("account_row.user_id=term_row.user_id");
    expect(request).toContain("term_row.ended_at is null");
    expect(request).toContain("v_proxy_user_id");
    expect(request).not.toContain("p_proxy_user_id");
    expect(request).not.toMatch(/\binsert into public\.world_organization_memberships\b/i);
    expect(request).not.toMatch(/\binsert into public\.world_organization_representations\b/i);
    expect(migration).not.toMatch(/grant\s+(all|insert|update|delete)\s+on\s+(table\s+)?public\.world_representation_proxies[\s\S]{0,100}\bto\s+(anon|authenticated)/i);
  });

  it("replays requests before rejecting changed membership, time, or revision", () => {
    const claim = request.indexOf("private.studio2_claim_operation");
    const replay = request.indexOf("if coalesce((v_operation->>'replayed')::boolean,false)");
    const eligibility = request.indexOf("if p_valid_until <= now()");
    const cas = request.indexOf("v_rep.revision is distinct from p_expected_representation_revision");
    expect(claim).toBeGreaterThan(0);
    expect(replay).toBeGreaterThan(claim);
    expect(eligibility).toBeGreaterThan(replay);
    expect(cas).toBeGreaterThan(replay);
    expect(request).toContain("private.studio2_complete_operation");
    expect(request).toContain("public.studio2_reconcile_operation");
    expect(request).toContain("private.v3_emit_domain_event");
  });

  it("allows approval only by institutional world proxy approvers and exactly once", () => {
    expect(approval).toContain("'world.proxy.approve'");
    expect(approval).toContain("'proxy',v_proxy.id");
    expect(approval).toContain("for update");
    expect(approval).toContain("p_target_status not in ('approved','rejected')");
    expect(approval).toContain("v_proxy.revision <> p_expected_revision");
    expect(approval).toContain("v_proxy.status <> 'requested'");
    expect(approval).toContain("v_proxy.valid_until <= now()");
    expect(approval).toContain("member_row.status='member'");
    expect(approval).toContain("other_proxy.status='approved'");
    expect(approval).toContain("OVERLAPPING_APPROVED_PROXY");
    expect(approval).toContain("approved_at=case when p_target_status='approved' then now() else null end");
  });

  it("supports immediate authorized revocation with receipt replay and no privileged NULL bypass", () => {
    expect(migration).toContain("add column if not exists revocation_reason text");
    expect(migration).toContain("create or replace function public.world_revoke_proxy_v1");
    expect(request).toContain("coalesce(v_rep.user_id = v_actor,false)");
    expect(revocation).toContain("coalesce(v_rep.user_id=v_actor,false)");
    expect(revocation).toContain("coalesce(v_allowed_by_country,false)");
    expect(revocation).toContain("coalesce(v_allowed_by_institution,false)");
    expect(revocation).toContain("'world.proxy.request'");
    expect(revocation).toContain("'world.proxy.approve'");
    expect(revocation).toContain("v_proxy.revision <> p_expected_revision");
    expect(revocation).toContain("v_proxy.status not in ('requested','approved')");
    expect(revocation).toContain("v_proxy.valid_until <= now()");
    expect(revocation).toContain("status='revoked',revoked_at=now()");
    expect(revocation).toContain("private.studio2_claim_operation");
    expect(revocation).toContain("public.studio2_reconcile_operation");
    expect(revocation).toContain("private.studio2_complete_operation");
    expect(revocation).toContain("'world.proxy.revoked'");
    expect(migration).toContain("revoke all on function public.world_revoke_proxy_v1");
    expect(fixture).toContain("TG6_PROXY_OUTSIDER_REVOCATION_ALLOWED");
    expect(fixture).toContain("TG6_PROXY_REVOCATION_RECEIPT_INVALID");
    expect(fixture).toContain("TG6_PROXY_REVOCATION_REPLAY_UNSTABLE");
    expect(fixture).toContain("TG6_PROXY_REPEATED_REVOCATION_ALLOWED");
    expect(fixture).toContain("TG6_PROXY_REVOKED_STILL_EFFECTIVE");
  });

  it("publishes no sensitive proxy reason or login in event payloads", () => {
    const requestEvent = request.slice(request.indexOf("perform private.v3_emit_domain_event"));
    const approvalEvent = approval.slice(approval.indexOf("perform private.v3_emit_domain_event"));
    for (const event of [requestEvent, approvalEvent]) {
      expect(event).toContain("organizationId");
      expect(event).toContain("representationId");
      expect(event).not.toContain("'reason',v_reason");
      expect(event).not.toContain("'proxyUserId'");
      expect(event).not.toContain("'proxyLogin'");
    }
    expect(migration).toContain("'world.proxy.requested'");
    expect(migration).toContain("'world.proxy.approved'");
    expect(migration).toContain("'world.proxy.rejected'");
  });

  it("lets exact-scope reviewers see pending rows without exposing another country or login ID", () => {
    expect(migration).toContain("private.world_proxy_review_read_allowed_v1");
    expect(migration).toContain("create policy world_proxies_reviewer_scoped_read");
    expect(migration).toContain("for select to authenticated");
    const helper = migration.slice(
      migration.indexOf("create or replace function private.world_proxy_review_read_allowed_v1"),
      migration.indexOf("drop policy if exists world_proxies_reviewer_scoped_read"),
    );
    expect(helper).toContain("security definer");
    expect(helper).toContain("p_representation_id");
    expect(helper).toContain("p_session_id");
    expect(helper).toContain("p_proxy_id");
    expect(helper).toContain("session_row.organization_id=rep_row.organization_id");
    expect(helper).toContain("'world.proxy.approve'");
    expect(helper).toContain("rep_row.country_id");
    expect(helper).toContain("'proxy',p_proxy_id");
    expect(helper).not.toContain("p_proxy_user_id");
  });

  it("bounds both reviewer and controller projections and filters authorized queue rows individually", () => {
    const review = migration.slice(
      migration.indexOf("create or replace function public.world_proxy_review_queue_v1"),
      migration.indexOf("create or replace function public.world_my_proxy_requests_v1"),
    );
    const controller = migration.slice(
      migration.indexOf("create or replace function public.world_my_proxy_requests_v1"),
      migration.indexOf("revoke all on function public.world_proxy_review_queue_v1"),
    );
    expect(review).toContain("auth.uid() is null");
    expect(review).toContain("security definer");
    expect(review).toContain("p.status='requested'");
    expect(review).toContain("'world.proxy.approve'");
    expect(review).toContain("rep.country_id,session_row.organ_id,'proxy',p.id");
    expect(review).toContain("limit 25");
    expect(review).not.toMatch(/proxy_user_id|holder_user_id|submitted_by_user_id/);
    expect(controller).toContain("account_row.user_id=auth.uid()");
    expect(controller).toContain("account_row.status='active'");
    expect(controller).toContain("rep.country_id=p_country_id");
    expect(controller).toContain("limit 20");
    expect(controller).toContain("'timeEffective'");
    expect(controller).not.toContain("'canCastBallot'");
    expect(controller).not.toMatch(/proxy_user_id|holder_user_id/);
    expect(migration).toContain("revoke all on function public.world_proxy_review_queue_v1");
    expect(migration).toContain("revoke all on function public.world_my_proxy_requests_v1");
    expect(fixture).toContain("TG6_PROXY_UNAUTHORIZED_REVIEW_READ");
    expect(fixture).toContain("TG6_PROXY_UNAUTHORIZED_COUNTRY_PROJECTION");
    expect(fixture).toContain("TG6_PROXY_CONTROLLER_PERSONAL_PROJECTION_MISSING");
    expect(fixture).toContain("TG6_PROXY_AUTHORIZED_REVIEW_QUEUE_MISSING");
  });

  it("returns only durable same-country candidates to a current authorized requester", () => {
    const candidateRpc = migration.slice(
      migration.indexOf("create or replace function public.world_my_proxy_candidates_v1"),
      migration.indexOf("revoke all on function public.world_my_proxy_candidates_v1"),
    );
    expect(candidateRpc).toContain("auth.uid()");
    expect(candidateRpc).toContain("account_row.status='active'");
    expect(candidateRpc).toContain("v_rep.country_id");
    expect(candidateRpc).toContain("'world.proxy.request'");
    expect(candidateRpc).toContain("'representation',v_rep.id");
    expect(candidateRpc).toContain("member_row.status='member'");
    expect(candidateRpc).toContain("assignment.country_id=v_rep.country_id");
    expect(candidateRpc).toContain("term_row.country_id=v_rep.country_id");
    expect(candidateRpc).toContain("person_row.id <> v_rep.person_id");
    expect(candidateRpc).toContain("limit 40");
    expect(candidateRpc).not.toContain("user_id',");
    expect(candidateRpc).not.toContain("'authUserId'");
    expect(migration).toContain("revoke all on function public.world_my_proxy_candidates_v1");
    expect(request).toContain("assignment.person_id=p_proxy_person_id");
    expect(request).toContain("term_row.person_id=p_proxy_person_id");
    expect(request).toContain("assignment.country_id=v_rep.country_id");
    expect(request).toContain("term_row.country_id=v_rep.country_id");
    expect(fixture).toContain("TG6_PROXY_UNAUTHORIZED_CANDIDATE_ROSTER_LEAK");
    expect(fixture).toContain("TG6_PROXY_VERIFIED_COUNTRY_CANDIDATE_MISSING");
    expect(fixture).toContain("TG6_PROXY_UNRELATED_PERSON_EXPOSED_AS_CANDIDATE");
    expect(fixture).toContain("TG6_PROXY_UNPROVEN_PERSON_ALLOWED");
  });

  it("rehearses negative authorization and replay in rollback-only local Postgres", () => {
    for (const failure of [
      "TG6_PROXY_ANON_REQUEST_ALLOWED",
      "TG6_PROXY_UNRELATED_REQUEST_ALLOWED",
      "TG6_PROXY_CROSS_ORG_SESSION_ALLOWED",
      "TG6_PROXY_REQUEST_RECEIPT_INCOMPLETE",
      "TG6_PROXY_REQUEST_REPLAY_UNSTABLE",
      "TG6_PROXY_OVERLAPPING_REQUEST_ALLOWED",
      "TG6_PROXY_UNAUTHORIZED_APPROVAL_ALLOWED",
      "TG6_PROXY_APPROVED_REOPEN_ALLOWED",
      "TG6_PROXY_OVERLAPPING_APPROVAL_ALLOWED",
      "TG6_PROXY_SERVER_TIME_EFFECTIVENESS_INVALID",
    ]) {
      expect(fixture).toContain(failure);
    }
    expect(fixture).toContain("rollback;");
    expect(runner).toContain("supabase status -o env");
    expect(runner).toContain("Refusing remote Supabase API");
    expect(runner).toContain("Refusing non-local database connection");
  });

  it("does not grant anonymous execution or expose server mutation tables", () => {
    expect(migration).toContain("revoke all on function public.world_request_proxy_v1");
    expect(migration).toContain("revoke all on function public.world_approve_proxy_v1");
    expect(migration).toContain("to authenticated,service_role");
    expect(migration).not.toContain("to anon,authenticated");
    expect(migration).not.toMatch(/grant\s+(insert|update|delete|all)[\s\S]{0,120}\bto\s+(anon|authenticated)/i);
  });
});
