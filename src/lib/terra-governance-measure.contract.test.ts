import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { SOLARIS_CAPABILITIES } from "./permissions-v2";
import { TERRA_GOVERNANCE_TG7 } from "./terra-governance-measure-registry";

const sql = readFileSync(resolve(process.cwd(), "supabase/migrations", TERRA_GOVERNANCE_TG7.migration), "utf8");
function body(name: string, tag: string) {
  const start = sql.indexOf(`create or replace function public.${name}(`);
  const stop = sql.indexOf(`$${tag}$;`, start);
  if (start < 0 || stop < start) throw new Error(`Missing ${name}`);
  return sql.slice(start, stop);
}

describe("TG7 versioned measures + procedural registration", () => {
  it("reuses TG2 scoped country, organization and TG6 organ/session identity", () => {
    for (const table of TERRA_GOVERNANCE_TG7.canonicalTables) {
      expect(sql).toContain(`create table ${table}`);
      expect(sql).toContain(`alter table ${table} enable row level security`);
    }
    expect(sql).toMatch(/foreign key\(organ_id,organization_id\)/);
    expect(sql).toMatch(/references public\.world_organization_organs\(id,organization_id\)/);
    expect(sql).toMatch(/session_id uuid references public\.world_sessions\(id\)/);
    expect(sql).toMatch(/references public\.countries\(id\)/);
    expect(sql).not.toMatch(/create table public\.world_organizations/);
  });

  it("makes direct table reads and writes unavailable even to privileged API roles", () => {
    expect(sql).toMatch(/revoke all on public\.world_measures,public\.world_measure_versions,\s*public\.world_measure_categories,public\.world_measure_procedural_reviews\s*from public,anon,authenticated,service_role/);
    expect(sql).not.toMatch(/grant (select|insert|update|delete|all) on public\.world_measures/i);
    for (const name of ["world_measure_public_list_v1", "world_measure_public_detail_v1"]) {
      expect(body(name, name.endsWith("list_v1") ? "measure_list" : "measure_detail"))
        .toMatch(/security definer set search_path=pg_catalog/);
    }
  });

  it("proves category and identifier boundaries without inventing GUARD topic codes", () => {
    expect(sql).toMatch(/primary key \(organization_id,code\)/);
    expect(sql).toMatch(/world_measures_category_fk foreign key\(organization_id,category_code\)/);
    expect(sql).toMatch(/GAG\\\.\[0-9\]\{4\}/);
    expect(body("world_measure_review_v1", "measure_review")).toContain("INVALID_GAG_IDENTIFIER");
    expect(sql).not.toContain("INSERT FAKE GUARD CODES");
  });

  it("preserves a private append-only procedural review log across corrections", () => {
    expect(sql).toContain("create table public.world_measure_procedural_reviews");
    expect(sql).toContain("create trigger world_measure_review_history_immutable");
    expect(sql).toContain("IMMUTABLE_MEASURE_REVIEW");
    expect(sql).toMatch(/reviewer_user_id uuid,/);
    expect(sql).not.toMatch(/reviewer_user_id uuid references auth\.users/);
    expect(sql).toMatch(/created_by_person_id uuid references public\.delegation_people\(id\) on delete restrict/);
    const reviewer = body("world_measure_review_v1", "measure_review");
    const manager = body("world_measure_manage_v1", "measure_manage");
    expect(reviewer).toContain("insert into public.world_measure_procedural_reviews");
    expect(reviewer).toContain("auth.uid()");
    expect(manager).toContain("'reviews'");
    expect(manager).toContain("r.note");
    expect(body("world_measure_public_list_v1", "measure_list"))
      .not.toContain("world_measure_procedural_reviews");
    expect(body("world_measure_public_detail_v1", "measure_detail"))
      .not.toContain("world_measure_procedural_reviews");
  });

  it("makes registered identifiers and institution ownership immutable", () => {
    const guard = body("world_measure_identity_guard_v1", "measure_identity");
    expect(guard).toContain("IMMUTABLE_MEASURE_IDENTITY");
    expect(guard).toContain("IMMUTABLE_MEASURE_IDENTIFIER");
    expect(guard).toContain("IMMUTABLE_MEASURE_REGISTRATION");
    expect(sql).toMatch(/create trigger world_measure_identity_guard/);
  });

  it("keeps all versions immutable apart from the one-way publication state", () => {
    expect(sql).toMatch(/unique\(measure_id,version_number\)/);
    expect(sql).toMatch(/foreign key\(current_version_id,id\) references public\.world_measure_versions\(id,measure_id\)/);
    expect(sql).toMatch(/foreign key\(supersedes_version_id,measure_id\)/);
    const immutability = body("world_measure_version_immutable_v1", "immutable");
    expect(immutability).toContain("IMMUTABLE_MEASURE_VERSION");
    expect(immutability).toMatch(/old\.publication_state='draft' and new\.publication_state='published'/);
    expect(immutability).toMatch(/to_jsonb\(new\) - 'publication_state'/);
  });

  it("does not leak pre-registration or unapproved version content publicly", () => {
    for (const projection of [
      body("world_measure_public_list_v1", "measure_list"),
      body("world_measure_public_detail_v1", "measure_detail"),
    ]) {
      expect(projection).toMatch(/visibility='public'/);
      expect(projection).toMatch(/registered_at is not null/);
      expect(projection).toMatch(/publication_state='published'/);
      expect(projection).toMatch(/public_visibility='public'/);
      expect(projection).toMatch(/g\.visibility='public'/);
    }
    expect(body("world_measure_public_list_v1", "measure_list")).toMatch(/least\(coalesce\(p_limit,30\),50\)/);
    expect(body("world_measure_public_detail_v1", "measure_detail")).toMatch(/limit 25/);
    expect(body("world_measure_manage_v1", "measure_manage")).toMatch(/world_access_allowed\(/);
  });

  it("registers capabilities with scoped permissions rather than office title checks", () => {
    for (const capability of TERRA_GOVERNANCE_TG7.capabilities) {
      expect(SOLARIS_CAPABILITIES).toContain(capability);
      expect(sql).toContain(`'${capability}'`);
    }
    expect(sql).toContain("('guard','chairperson')");
    expect(sql).toContain("('unity','secretary-general')");
    expect(sql).toContain("world_country_controller_capabilities");
    expect(sql).toMatch(/world_access_allowed\(/);
  });

  it("rejects ineligible sponsors and invalid organs before writing a proposal", () => {
    const submit = body("world_measure_submit_v1", "measure_submit");
    expect(submit).toContain("SPONSOR_NOT_MEMBER");
    expect(submit).toMatch(/membership\.status='member'/);
    expect(submit).toMatch(/membership\.ended_at is null/);
    expect(submit).toContain("INVALID_ORGAN");
    expect(submit).toMatch(/g\.organization_id=p_organization_id/);
    expect(submit).toMatch(/category\.active/);
    expect(submit).toContain("world.measure.submitted");
    expect(submit).toMatch(/'submitted','members'/);
  });

  it("uses receipt/replay authority before executing revisions and state transitions", () => {
    for (const [command, tag] of [
      ["world_measure_submit_v1", "measure_submit"],
      ["world_measure_review_v1", "measure_review"],
      ["world_measure_resubmit_v1", "measure_resubmit"],
    ]) {
      const source = body(command, tag);
      expect(source).toContain("private.studio2_claim_operation");
      expect(source).toContain("private.studio2_complete_operation");
      expect(source).toContain("public.studio2_reconcile_operation");
      expect(source).toContain("private.v3_emit_domain_event");
      expect(source).toMatch(/v_claim->>'replayed'/);
      if (command !== "world_measure_submit_v1") {
        expect(source.indexOf("v_claim->>'replayed'")).toBeLessThan(source.indexOf("VERSION_CONFLICT"));
      }
    }
  });

  it("limits procedural review to correction, review and registration, never political veto", () => {
    const review = body("world_measure_review_v1", "measure_review");
    expect(review).toContain("world.measure.review_procedural");
    expect(review).toMatch(/'procedural_review','needs_correction','registered'/);
    expect(review).not.toMatch(/p_target_state='rejected'/);
    expect(review).toMatch(/publication_state='published'/);
    expect(review).toContain("world.measure.correction_requested");
    expect(review).toContain("world.measure.registered");
    expect(review).toContain("SPONSOR_NOT_MEMBER");
    expect(review).toContain("INVALID_ORGAN");
    expect(review).toContain("INVALID_CATEGORY");
    expect(review).toMatch(/message='VERSION_CONFLICT'/);
  });

  it("resubmission preserves previous immutable drafts and revision CAS", () => {
    const resubmit = body("world_measure_resubmit_v1", "measure_resubmit");
    expect(resubmit).toMatch(/v_measure\.state<>'needs_correction'/);
    expect(resubmit).toMatch(/supersedes_version_id,content_hash/);
    expect(resubmit).toMatch(/max\(version_number\)/);
    expect(resubmit).toContain("world.measure.resubmitted");
    expect(resubmit).toMatch(/coalesce\(btrim\(p_summary\),''\)/);
    expect(resubmit).toContain("world.measure.submit");
  });

  it("is honest about future voting, external intakes and publishing work", () => {
    expect(TERRA_GOVERNANCE_TG7.status).toBe("implementation");
    expect(TERRA_GOVERNANCE_TG7.notYetImplemented).toContain(
      "amendment incorporation, official voting and resolution certification",
    );
    expect(sql).not.toMatch(/create table public\.world_votes/);
    expect(sql).not.toMatch(/create table public\.world_resolutions/);
    expect(sql).toMatch(/v3\.tg7\.world-measure-submissions/);
  });
});



