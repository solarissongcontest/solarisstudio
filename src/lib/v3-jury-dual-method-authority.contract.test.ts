import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20261121170000_v3_jury_dual_method_country_authority.sql"),
  "utf8",
);
const organizer = readFileSync(
  resolve(process.cwd(), "src/routes/_authenticated/admin/jury/$slug.tsx"),
  "utf8",
);
const part = (name: string) => {
  const start = migration.toLowerCase().indexOf(`function ${name.toLowerCase()}(`);
  expect(start, `missing SQL definition: ${name}`).toBeGreaterThan(0);
  const next = migration.toLowerCase().indexOf("create function ", start + 10);
  return migration.slice(start, next < 0 ? migration.length : next);
};

describe("SSC22 dual-method Jury authority (forward-only contract)", () => {
  it("requires the three immutable recovery cutovers, never reopens voting", () => {
    expect(migration).toContain("v3.jury.governed-submission-cutover");
    expect(migration).toContain("v3.jury.canonical-table-authority");
    expect(migration).toContain("v3.jury.r2-single-writer-retirement");
    expect(migration).not.toMatch(/update\s+public\.studio2_feature_flags/i);
    expect(migration).not.toMatch(/update\s+public\.jury_voting_windows/i);
    expect(migration).not.toContain("solaris_app_v3_jury");
  });

  it("uses one deterministic country/show transaction lock across both methods", () => {
    const lock = part("private.v3_jury_lock_country");
    const submit = part("public.v3_submit_jury_ballot");
    const apply = part("public.v3_organizer_jury_score_apply");
    expect(lock).toContain("pg_advisory_xact_lock");
    expect(lock).toContain("p_show_id::text || ':' || p_identity::text");
    expect(submit).toContain("private.v3_jury_lock_country(_show_id, v_account.country_id)");
    expect(submit).toContain("v3_jury_manual_scores draft");
    expect(apply).toContain("private.v3_jury_lock_country(p_show_id,v_identity)");
    expect(apply).toContain("private.v3_jury_resolve_voter");
    expect(apply).toContain("v_state.revision is distinct from p_expected_version");
  });

  it("recognizes older Organizer votes keyed only by voter or contest entity", () => {
    const account = part("public.v3_submit_jury_ballot");
    expect(account).toContain("j.ballot_submission_id is null");
    expect(account).toContain("where v.id=j.voter_id and v.country_id=v_account.country_id");
    expect(account).toContain("where ce.id=j.voter_entity_id and ce.country_id=v_account.country_id");
    expect(account).toContain("Organizer Jury scores already exist for this country");
    expect(account.indexOf("if found then")).toBeLessThan(
      account.indexOf("Organizer Jury scores already exist for this country")
    );
  });

  it("prevents an Organizer from modifying linked account evidence", () => {
    const guard = part("private.v3_jury_protect_submitted_vote");
    const apply = part("public.v3_organizer_jury_score_apply");
    expect(guard).toContain("old.ballot_submission_id is not null");
    expect(guard).toContain("new.ballot_submission_id is null");
    expect(apply).toContain("from public.jury_ballot_submissions b");
    expect(apply).toContain("Account-submitted Jury ballot is immutable");
    expect(migration).toContain("revoke all on function public.assign_jury_vote");
    expect(migration).toContain("revoke all on function public.clear_jury_point");
  });

  it("stores partial Organizer votes privately and publishes only complete ballots", () => {
    const apply = part("public.v3_organizer_jury_score_apply");
    expect(migration).toContain("create table private.v3_jury_manual_scores");
    expect(migration).toContain("create table private.v3_jury_manual_states");
    expect(migration).toContain("unique(show_id, voter_identity, points)");
    expect(migration).toContain("unique(show_id, voter_identity, recipient_identity)");
    expect(apply).toContain("v_complete:=v_count=cardinality(v_scale)");
    expect(apply).toContain("if v_complete then");
    expect(apply).toContain("insert into public.jury_votes(");
    expect(apply).toContain("delete from public.jury_votes j");
    expect(part("public.v3_organizer_jury_manual_snapshot")).toContain("not st.complete");
  });

  it("enforces server scoring and DNV integrity, without requiring ten points per click", () => {
    const apply = part("public.v3_organizer_jury_score_apply");
    expect(apply).toContain("voting_config->'juryPoints'");
    expect(apply).toContain("not p_points=any(v_scale)");
    expect(apply).toContain("v_capacity<v_count");
    expect(apply).toContain("Voting delegation is absent from the show-specific Jury roster");
    expect(apply).toContain("Jury self-voting is prohibited");
    expect(apply).toContain("Jury recipient is not eligible in this show");
    expect(part("private.v3_jury_protect_manual_dnv")).toContain("private.v3_jury_lock_country");
  });

  it("governs manual correction with revision, operation replay and audit", () => {
    const apply = part("public.v3_organizer_jury_score_apply");
    expect(apply).toContain("Correcting a complete Jury ballot requires an explicit reason");
    expect(apply).toContain("private.v3_jury_manual_operations");
    expect(apply).toContain("v_op.request is distinct from v_req");
    expect(apply).toContain("'replayed',true");
    expect(apply).toContain("insert into public.admin_audit_log");
    expect(apply).toContain("record_id,edition_id,country_id,before_data,after_data");
    expect(apply).toContain("v_identity::text,p_edition_id,v_country,v_before");
    expect(apply).toContain("studio2_access_allowed('jury.ballots.manage',p_edition_id,true)");
  });

  it("fails closed on drift in either retired Organizer command", () => {
    expect(migration).toContain("Legacy Organizer Jury command definition drift");
    expect(migration).toContain("7d4086203bb359201fe93523cf5a62d35fb5c9da22fc9d3f0845bc182d47d136");
    expect(migration).toContain("4acfeebd38bd85cc22c8bbbd01dd1023539f7e061e287eddc1aeaffee0f98d3a");
  });

  it("resolves DNV by actual country even when the status row stores only voter_id", () => {
    const account = part("public.v3_submit_jury_ballot");
    const manual = part("public.v3_organizer_jury_score_apply");
    expect(account).toContain("status.show_id,status.voter_id,status.voter_country_id,status.voter_entity_id");
    expect(manual).toContain("st.show_id,st.voter_id,st.voter_country_id,st.voter_entity_id");
    expect(account).toContain("=v_account.country_id");
    expect(manual).toContain("=v_identity");
  });

  it("detects a complete pre-cutover manual ballot in preview before asking for corrections", () => {
    const preview = part("public.v3_organizer_jury_score_preview");
    const apply = part("public.v3_organizer_jury_score_apply");
    expect(preview).toContain("v_legacy_complete");
    expect(preview).toContain("count(distinct j.points)=cardinality(v_scale)");
    expect(preview).toContain("'complete',coalesce(v_complete,false) or coalesce(v_legacy_complete,false)");
    expect(apply).toContain("Correcting a complete Jury ballot requires an explicit reason");
    expect(organizer).toContain('window.prompt("Reason for correcting this completed Organizer-entered Jury ballot:")');
  });

  it("never dereferences an absent OLD or NEW trigger row", () => {
    const guard = part("private.v3_jury_protect_submitted_vote");
    expect(guard).toContain("if tg_op in ('UPDATE','DELETE') then");
    expect(guard).toContain("if tg_op='DELETE' then return old; end if;");
    expect(guard).toContain("if new.ballot_submission_id is null");
  });

  it("retains the existing Organizer workflow with server-version preview, feedback and refresh", () => {
    expect(organizer).toContain('rpc("v3_organizer_jury_score_preview"');
    expect(organizer).toContain('rpc("v3_organizer_jury_score_apply"');
    expect(organizer).toContain('rpc("v3_organizer_jury_manual_snapshot"');
    expect(organizer).toContain("expectedVersion");
    expect(organizer).toContain("await refresh()");
    expect(organizer).not.toContain('rpc("assign_jury_vote"');
    expect(organizer).not.toContain('rpc("clear_jury_point"');
  });
});
