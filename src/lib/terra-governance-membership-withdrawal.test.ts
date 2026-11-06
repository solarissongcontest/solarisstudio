import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  membershipWithdrawalError,
  parseMembershipWithdrawalProjection,
  parseMembershipWithdrawalReceipt,
} from "./terra-governance-membership-withdrawal";

const migration = readFileSync(
  resolve(process.cwd(),"supabase/migrations/20261107001500_v3_tg5_voluntary_withdrawal.sql"),"utf8"
);
const route = readFileSync(
  resolve(process.cwd(),"src/routes/_authenticated/world/membership/withdraw.tsx"),"utf8"
);

const country = "1f70325e-8f0d-42bf-8b4a-d97df8e590b4";
const guard = "4b1b6b2e-8e90-4d6a-a5a9-9b9c3b3a8a8a";
const memberId = "0297e0e8-f9a5-4ff8-b063-c6eeb2b87581";
const operationId = "93bd0b76-4089-4c8b-b80b-cbd47f859bd8";

const member = {
  organizationId: guard,
  organizationSlug: "guard",
  organizationName: "GUARD",
  membershipId: memberId,
  membershipStatus: "member",
  membershipType: "member",
  joinedAt: "2026-11-05T15:00:00+00:00",
  endedAt: null,
  revision: 3,
  requiresOfficeTransition: false,
  canWithdraw: true,
};

describe("WORLD-03 TG5C voluntary membership withdrawal", () => {
  it("uses one typed, bounded and country-scoped actual membership projection", () => {
    const projection = { countryId:country, items:[member] };
    expect(parseMembershipWithdrawalProjection(projection,country)).toEqual(projection);
    expect(() => parseMembershipWithdrawalProjection({...projection,countryId:guard},country)).toThrow();
    expect(() => parseMembershipWithdrawalProjection({...projection,items:Array(3).fill(member)},country)).toThrow();
    expect(() => parseMembershipWithdrawalProjection({
      ...projection,items:[member,{...member,organizationSlug:"guard"}]
    },country)).toThrow();
    expect(() => parseMembershipWithdrawalProjection({
      ...projection,items:[{...member,membershipStatus:"unknown"}]
    },country)).toThrow();
    expect(() => parseMembershipWithdrawalProjection({
      ...projection,items:[{...member,revision:0}]
    },country)).toThrow();
    expect(() => parseMembershipWithdrawalProjection({
      ...projection,items:[{...member,organizationSlug:"imaginary"}]
    },country)).toThrow();
    expect(() => parseMembershipWithdrawalProjection({
      ...projection,items:[{...member,joinedAt:"bad timestamp"}]
    },country)).toThrow();
  });

  it("never presents future or concluded membership as a current actionable record", () => {
    expect(() => parseMembershipWithdrawalProjection({
      countryId:country,items:[{
        ...member, membershipStatus:"withdrawn",
        endedAt:"2026-11-07T12:00:00+00:00",canWithdraw:true,
      }],
    },country)).toThrow();
    expect(() => parseMembershipWithdrawalProjection({
      countryId:country,items:[{
        ...member, requiresOfficeTransition:true,canWithdraw:true,
      }],
    },country)).toThrow();
    const withdrawn = {
      ...member,membershipStatus:"withdrawn",
      endedAt:"2026-11-07T12:00:00+00:00",canWithdraw:false,
    };
    expect(parseMembershipWithdrawalProjection({
      countryId:country,items:[withdrawn],
    },country).items[0]).toEqual(withdrawn);
    const noMembership = {
      organizationId:guard,organizationSlug:"guard",organizationName:"GUARD",
      membershipId:null,membershipStatus:null,membershipType:null,
      joinedAt:null,endedAt:null,revision:null,
      requiresOfficeTransition:false,canWithdraw:false,
    };
    expect(parseMembershipWithdrawalProjection({
      countryId:country,items:[noMembership],
    },country).items[0].membershipId).toBeNull();
  });

  it("requires an exact R2 receipt, expected revision and scope", () => {
    const expected = {
      organizationId:guard,countryId:country,membershipId:memberId,
      revision:3,operationId,
    };
    const result = {
      ok:true,operationId,organizationId:guard,countryId:country,
      membershipId:memberId,status:"withdrawn",revision:4,
      endedAt:"2026-11-07T20:00:00+00:00",
      representationsEnded:1,proxiesRevoked:2,
    };
    const envelope = { status:"succeeded",operationId,result };
    expect(parseMembershipWithdrawalReceipt(envelope,expected)).toEqual({
      membershipId:memberId,organizationId:guard,countryId:country,
      revision:4,endedAt:result.endedAt,
      representationsEnded:1,proxiesRevoked:2,
    });
    expect(() => parseMembershipWithdrawalReceipt({
      ...envelope,status:"processing",
    },expected)).toThrow();
    expect(() => parseMembershipWithdrawalReceipt({
      ...envelope,result:{...result,operationId:country},
    },expected)).toThrow();
    expect(() => parseMembershipWithdrawalReceipt({
      ...envelope,result:{...result,countryId:guard},
    },expected)).toThrow();
    expect(() => parseMembershipWithdrawalReceipt({
      ...envelope,result:{...result,status:"expelled"},
    },expected)).toThrow();
    expect(() => parseMembershipWithdrawalReceipt({
      ...envelope,result:{...result,revision:3},
    },expected)).toThrow();
    expect(() => parseMembershipWithdrawalReceipt({
      ...envelope,result:{...result,proxiesRevoked:-1},
    },expected)).toThrow();
  });

  it("reuses canonical membership, representative and proxy truth; no extra country authority", () => {
    expect(migration).toContain("create or replace function public.world_withdraw_membership_v1");
    expect(migration).toContain("public.world_organization_memberships membership");
    expect(migration).toContain("public.world_organization_representations representation_row");
    expect(migration).toContain("public.world_representation_proxies proxy_row");
    expect(migration).toContain("status='withdrawn'");
    expect(migration).toContain("ended_at=v_effective_at");
    expect(migration).toContain("status='revoked',revoked_at=v_effective_at");
    expect(migration).toContain("greatest(v_effective_at,representation_row.starts_at)");
    expect(migration).toContain("termination_reason='voluntary_country_withdrawal'");
    expect(migration).not.toMatch(/create table public\.world_organization_memberships/i);
    expect(migration).not.toMatch(/create table public\.world_organization_representations/i);
    expect(migration).not.toMatch(/create table public\.world_representation_proxies/i);
    expect(migration).not.toMatch(/insert into public\.world_organization_memberships/i);
  });

  it("locks country controller and membership against concurrent changes, enforces CAS", () => {
    expect(migration).toContain("account_row.user_id=v_actor");
    expect(migration).toContain("account_row.status='active'");
    expect(migration).toContain("for share;");
    expect(migration).toContain("for update;");
    expect(migration).toContain("v_membership.revision <> p_expected_revision");
    expect(migration).toContain("where membership.id=v_membership.id");
    expect(migration).toContain("and membership.revision=p_expected_revision");
    expect(migration).toContain("v_membership.joined_at > v_effective_at");
    expect(migration).toContain("'world.membership.withdraw'");
    expect(migration).toContain("private.studio2_claim_operation(");
    expect(migration).toContain("private.studio2_complete_operation(");
    expect(migration).toContain("public.studio2_reconcile_operation(");
    expect(migration).toContain("private.v3_emit_domain_event(");
    expect(migration).toContain("'world.membership.withdrawn'");
    expect(migration).not.toMatch(/grant (insert|update|delete) on public\.world_organization_memberships to authenticated/i);
  });

  it("blocks institutional office orphaning, including scheduled and historical person links", () => {
    expect(migration).toContain("private.world_membership_has_office_transition_v1");
    expect(migration).toContain("term_row.status in ('active','scheduled')");
    expect(migration).toContain("term_row.actual_end_at is null");
    expect(migration).toContain("term_row.represented_country_id = p_country_id");
    expect(migration).toContain("controller_term.person_id = term_row.holder_person_id");
    expect(migration).toContain("controller_term.started_at <= now()");
    expect(migration).toContain("controller_term.ended_at is null");
    expect(migration).toContain("representation_row.starts_at <= now()");
    expect(migration).toContain("representation_row.ends_at is null");
    expect(migration).toContain("representation_row.person_id = term_row.holder_person_id");
    expect(migration).toContain("'OFFICE_TRANSITION_REQUIRED'");
    expect(migration).not.toMatch(/insert into public\.world_office_terms/i);
    expect(migration).not.toMatch(/update public\.world_office_terms/i);
  });

  it("does not leak auth/accounts, allow stale actor confirmation or fake a rejoin", () => {
    expect(route).toContain("useAuthenticatedUser");
    expect(route).toContain("account.data?.access.userId === user.id");
    expect(route).toContain('user.id, countryId]');
    expect(route).toContain("gcTime: 0");
    expect(route).toContain("currentActorScope.current = actorScope");
    expect(route).toContain("variables.actorScope !== currentActorScope.current");
    expect(route).toContain("I understand the immediate membership and access consequences");
    expect(route).toContain("Retry identical withdrawal");
    expect(route).toContain("noindex,nofollow");
    expect(route).toContain("UNITY membership will not automatically resume");
    expect(membershipWithdrawalError({message:"office SQL detail"})).not.toContain("SQL");
    expect(membershipWithdrawalError({message:"OFFICE_TRANSITION_REQUIRED"}))
      .toContain("succession");
  });
});
