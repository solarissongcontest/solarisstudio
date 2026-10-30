import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { v3AuthorizationRequirement } from "./v3-authorization-requirement-registry";

const lifecycle = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261003193000_organisation_os_v5_jury_ballot_lifecycle.sql",
  ),
  "utf8",
);
const lifecycleContract = readFileSync(
  resolve(process.cwd(), "src/lib/organisation-v5-jury-ballot-lifecycle.test.ts"),
  "utf8",
);

function body(marker: string, revokeMarker: string) {
  const start = lifecycle.indexOf(marker);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = lifecycle.indexOf(revokeMarker, start);
  expect(end).toBeGreaterThan(start);
  return lifecycle.slice(start, end);
}

describe("System V3 S7 Jury ballot authorization", () => {
  it("binds ballot review to the loaded ballot's authoritative edition", () => {
    expect(v3AuthorizationRequirement("jury.ballot_review")).toMatchObject({
      ownerDomain: "jury",
      state: "verified",
      authorizationModel: "capability",
      requiredCapability: "jury.ballots.manage",
      scope: "object",
      objectResolution: "ballot -> edition",
      serverBoundary: "public.studio2_apply_jury_ballot_review",
      serviceRoleAllowed: false,
    });

    const apply = body(
      "create or replace function public.studio2_apply_jury_ballot_review(",
      "\nrevoke all on function public.studio2_apply_jury_ballot_review(",
    );
    const load = apply.indexOf("from public.jury_ballot_submissions");
    const notFound = apply.indexOf("Jury ballot not found", load);
    const capability = apply.indexOf(
      "studio2_access_allowed('jury.ballots.manage', v_ballot.edition_id, false)",
      notFound,
    );

    expect(load).toBeGreaterThanOrEqual(0);
    expect(notFound).toBeGreaterThan(load);
    expect(capability).toBeGreaterThan(notFound);
  });

  it("keeps review version-bound, transition-validated, reasoned and idempotent", () => {
    const apply = body(
      "create or replace function public.studio2_apply_jury_ballot_review(",
      "\nrevoke all on function public.studio2_apply_jury_ballot_review(",
    );

    expect(apply).toContain("v_ballot.review_version is distinct from p_expected_version");
    expect(apply).toContain("Jury ballot review changed since this preview was loaded");
    expect(apply).toContain("studio2_jury_ballot_review_preview(p_ballot_id, v_target)");
    expect(apply).toContain("A reason is required for this jury ballot transition");
    expect(apply).toContain("private.studio2_claim_operation(");
    expect(apply).toContain("'jury.ballot.review.' || v_target");
    expect(apply).toContain("'editionId', v_ballot.edition_id");
    expect(apply).toContain("'expectedVersion', p_expected_version");
  });

  it("updates review lifecycle without rewriting submitted vote evidence", () => {
    const apply = body(
      "create or replace function public.studio2_apply_jury_ballot_review(",
      "\nrevoke all on function public.studio2_apply_jury_ballot_review(",
    );

    expect(apply).toContain("update public.jury_ballot_submissions");
    expect(apply).toContain("where id = p_ballot_id");
    expect(apply).not.toContain("update public.jury_votes");
    expect(apply).not.toContain("delete from public.jury_votes");
    expect(apply).toContain("'jury_ballot_review_transition'");
    expect(apply).toContain("private.studio2_complete_operation(v_operation_id, v_result)");
  });

  it("binds DNV authorization to the loaded show and exact jury identity", () => {
    expect(v3AuthorizationRequirement("jury.dnv")).toMatchObject({
      ownerDomain: "jury",
      state: "verified",
      authorizationModel: "capability",
      requiredCapability: "jury.ballots.manage",
      scope: "object",
      serverBoundary: "public.studio2_apply_jury_dnv",
      serviceRoleAllowed: true,
    });
    expect(v3AuthorizationRequirement("jury.dnv")?.objectResolution).toContain(
      "show + jury identity",
    );

    const apply = body(
      "create or replace function public.studio2_apply_jury_dnv(",
      "\nrevoke all on function public.studio2_apply_jury_dnv(",
    );
    const load = apply.indexOf("select * into v_show from public.shows where id = p_show_id");
    const notFound = apply.indexOf("Show not found", load);
    const capability = apply.indexOf(
      "studio2_access_allowed('jury.ballots.manage', v_show.edition_id, false)",
      notFound,
    );

    expect(load).toBeGreaterThanOrEqual(0);
    expect(notFound).toBeGreaterThan(load);
    expect(capability).toBeGreaterThan(notFound);
  });

  it("fails DNV closed on missing identity, saved votes, stale versions and missing reasons", () => {
    const preview = body(
      "create or replace function public.studio2_jury_dnv_preview(",
      "\nrevoke all on function public.studio2_jury_dnv_preview(",
    );
    const apply = body(
      "create or replace function public.studio2_apply_jury_dnv(",
      "\nrevoke all on function public.studio2_apply_jury_dnv(",
    );

    expect(preview).toContain("Jury identity is required");
    expect(preview).toContain("Clear saved jury scores before authorizing DNV");
    expect(preview).toContain("Unknown DNV action");
    expect(apply).toContain("A reason is required for DNV changes");
    expect(apply).toContain("coalesce(v_existing.version, 0) is distinct from p_expected_version");
    expect(apply).toContain("DNV state changed since this preview was loaded");
    expect(apply).toContain("public.studio2_jury_dnv_preview(");
  });

  it("binds DNV idempotency to show, edition, jury identity and expected version", () => {
    const apply = body(
      "create or replace function public.studio2_apply_jury_dnv(",
      "\nrevoke all on function public.studio2_apply_jury_dnv(",
    );

    expect(apply).toContain("private.studio2_claim_operation(");
    expect(apply).toContain("'jury.dnv.' || v_action");
    expect(apply).toContain("'showId', p_show_id");
    expect(apply).toContain("'editionId', v_show.edition_id");
    expect(apply).toContain("'voterId', p_voter_id");
    expect(apply).toContain("'voterCountryId', p_voter_country_id");
    expect(apply).toContain("'voterEntityId', p_voter_entity_id");
    expect(apply).toContain("'expectedVersion', p_expected_version");
    expect(apply).toContain("'jury_dnv_' || v_action");
  });

  it("denies anonymous RPC execution and closes the direct authenticated DNV bypass", () => {
    expect(lifecycle).toContain(
      "revoke all on function public.studio2_apply_jury_ballot_review(\n  uuid, text, text, uuid, text, bigint\n) from public, anon;",
    );
    expect(lifecycle).toContain(
      "grant execute on function public.studio2_apply_jury_ballot_review(\n  uuid, text, text, uuid, text, bigint\n) to authenticated, service_role;",
    );
    expect(lifecycle).toContain(
      "revoke all on function public.studio2_apply_jury_dnv(\n  uuid, uuid, uuid, uuid, text, text, uuid, text, bigint\n) from public, anon;",
    );
    expect(lifecycle).toContain(
      "grant execute on function public.studio2_apply_jury_dnv(\n  uuid, uuid, uuid, uuid, text, text, uuid, text, bigint\n) to authenticated, service_role;",
    );
    expect(lifecycle).toContain(
      "revoke insert, update, delete on public.jury_ballot_statuses from authenticated",
    );
  });

  it("retains the existing lifecycle, result-truth and task regression evidence", () => {
    expect(lifecycleContract).toContain(
      "validates every submitted-ballot review transition server-side",
    );
    expect(lifecycleContract).toContain(
      "makes review changes previewed, version-bound, idempotent and audited",
    );
    expect(lifecycleContract).toContain("models DNV separately because no ballot evidence exists");
    expect(lifecycleContract).toContain("makes ballot review state authoritative for canonical Results");
    expect(lifecycleContract).toContain("projects outstanding validation into canonical Tasks and Inbox");
  });
});
