import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const authority = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261027211700_v3_integrity_case_appeal_authority.sql",
  ),
  "utf8",
);
const intake = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261027212500_v3_integrity_intake_event_provenance.sql",
  ),
  "utf8",
);
const privileges = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261027213100_v3_integrity_internal_writer_privileges.sql",
  ),
  "utf8",
);
const caseIntake = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261023214000_v3_integrity_participant_idempotency_current_main.sql",
  ),
  "utf8",
);

const combined = `${caseIntake}\n${authority}\n${intake}\n${privileges}`;

describe("V3 Integrity canonical case/appeal authority", () => {
  it("uses the repository-defined case and appeal lifecycle vocabulary", () => {
    for (const status of [
      "received",
      "awaiting_review",
      "under_review",
      "waiting_for_reporter",
      "investigation_opened",
      "action_taken",
      "closed_no_violation",
      "closed_insufficient_evidence",
      "closed_outside_jurisdiction",
      "closed_duplicate",
      "closed",
    ]) {
      expect(authority).toContain(`'${status}'`);
    }

    for (const status of [
      "submitted",
      "under_review",
      "upheld",
      "reduced",
      "increased",
      "overturned",
      "rejected_late",
      "rejected_ineligible",
    ]) {
      expect(authority).toContain(`'${status}'`);
    }

    expect(authority).toContain("v3_integrity_case_transition_allowed");
    expect(authority).toContain("v3_integrity_appeal_transition_allowed");
    expect(authority).toContain("Illegal Integrity case transition");
    expect(authority).toContain("Illegal Integrity appeal transition");
  });

  it("puts adjudication state under server-managed revisions and stale-write CAS", () => {
    expect(authority).toMatch(/alter table public\.integrity_cases[\s\S]*add column if not exists version bigint not null default 1/);
    expect(authority).toMatch(/alter table public\.integrity_case_appeals[\s\S]*add column if not exists version bigint not null default 1/);
    expect(authority).toContain("new.version := old.version + 1");
    expect(authority).toContain("Integrity case version is server-managed");
    expect(authority).toContain("Integrity appeal version is server-managed");
    expect(authority).toContain("v_case.version <> p_expected_version");
    expect(authority).toContain("v_appeal.version <> p_expected_version");
    expect(authority).toContain("using errcode = '40001'");
  });

  it("persists immutable case and appeal history plus canonical changed events", () => {
    expect(authority).toContain("create table if not exists public.integrity_adjudication_history");
    expect(authority).toContain("Integrity adjudication history is immutable");
    expect(authority).toContain("before update or delete on public.integrity_adjudication_history");
    expect(authority).toContain("'integrity.case_changed'");
    expect(authority).toContain("'integrity.appeal_changed'");
    expect(authority).toContain("operation_id uuid null");
    expect(authority).toContain("aggregate_version bigint null");
    expect(authority).toContain("unique (aggregate_type, aggregate_id, revision)");
  });

  it("makes critical organizer commands idempotent and receipted", () => {
    for (const command of [
      "studio2_integrity_case_transition",
      "studio2_integrity_assign_case_reviewer",
      "studio2_integrity_assign_appeal_reviewer",
      "studio2_integrity_resolve_appeal",
      "studio2_integrity_grant_appeal_extension",
    ]) {
      expect(authority).toContain(`function public.${command}`);
    }
    expect(authority.match(/private\.studio2_claim_operation/g)?.length).toBeGreaterThanOrEqual(5);
    expect(authority.match(/private\.studio2_complete_operation/g)?.length).toBeGreaterThanOrEqual(5);
    expect(authority).toContain("coalesce((v_claim ->> 'replayed')::boolean, false)");
  });

  it("enforces fresh appeal review and rationale at the database boundary", () => {
    expect(authority).toContain("The appeal submitter cannot review their own appeal");
    expect(authority).toContain("The original sanction decision-maker cannot be the appeal reviewer");
    expect(authority).toContain("The original finding decision-maker cannot be the appeal reviewer");
    expect(authority).toContain("Only the assigned appeal reviewer may decide this appeal");
    expect(authority).toContain("Appeal rationale must be between 20 and 12000 characters");
    expect(authority).toContain("A reduced appeal outcome must use a lower sanction level");
    expect(authority).toContain("An increased appeal outcome must use a higher sanction level");
  });

  it("closes duplicate appeal races and keeps sanction resolution atomic", () => {
    expect(authority).toContain("integrity_case_appeals_one_participant_per_sanction_idx");
    expect(authority).toContain("where submitted_via <> 'organizer'");
    expect(authority).toContain("for update");
    expect(authority).toContain("status = 'modified_on_appeal'");
    expect(authority).toContain("status = 'overturned'");
    expect(authority).toContain("replacement_sanction_id = v_replacement_id");
    const resolveStart = authority.indexOf(
      "create or replace function public.studio2_integrity_resolve_appeal",
    );
    const resolveEnd = authority.indexOf(
      "create or replace function public.studio2_integrity_grant_appeal_extension",
      resolveStart,
    );
    const resolveBody = authority.slice(resolveStart, resolveEnd);
    expect(resolveBody).not.toContain("update public.integrity_cases");
  });

  it("binds retry-safe case intake to the same operation identity as case_changed", () => {
    expect(caseIntake).toContain("v3_public_create_anonymous_integrity_case");
    expect(caseIntake).toContain("v3_create_protected_integrity_case");
    expect(caseIntake).toContain("IDEMPOTENCY_CONFLICT");
    expect(intake).toContain("set_config('app.integrity_operation_id', p_operation_id::text, true)");
    expect(intake).toContain("'integrity.case.create.anonymous'");
    expect(intake).toContain("'integrity.case.create.protected'");
  });

  it("gives protected and anonymous appeal submission stable retry authority", () => {
    expect(intake).toContain("function public.v3_submit_integrity_appeal");
    expect(intake).toContain("function public.v3_public_submit_anonymous_integrity_appeal");
    expect(intake).toContain("private.v3_anonymous_integrity_appeal_operations");
    expect(intake).toContain("'integrity.appeal.submit.protected'");
    expect(intake).toContain("'integrity.appeal.submit.anonymous'");
    expect(intake).toContain("IDEMPOTENCY_CONFLICT");
    expect(intake).toContain("'replayed', true");
  });

  it("removes raw API/service-role DML and internal implementation EXECUTE authority", () => {
    for (const table of [
      "public.integrity_cases",
      "public.integrity_case_appeals",
      "public.integrity_case_sanctions",
      "public.integrity_case_findings",
    ]) {
      expect(authority).toContain(
        `revoke insert, update, delete, truncate on table ${table} from anon, authenticated, service_role`,
      );
    }

    for (const internalWriter of [
      "public_create_anonymous_integrity_case_impl",
      "create_protected_integrity_case_impl",
      "v3_public_create_anonymous_integrity_case_impl",
      "v3_create_protected_integrity_case_impl",
      "reporter_submit_integrity_appeal_impl",
      "public_submit_anonymous_integrity_appeal_impl",
    ]) {
      expect(privileges).toContain(`function public.${internalWriter}`);
    }
    expect(privileges.match(/from public, anon, authenticated, service_role/g)?.length).toBeGreaterThanOrEqual(6);
  });

  it("documents every intentionally retained compatibility path with a sunset", () => {
    expect(combined).toContain("TEMPORARY COMPATIBILITY PATH");
    expect(privileges).toContain("Owner: Integrity authority");
    expect(privileges).toContain("Sunset:");
    expect(authority).toContain("Temporary compatibility shim; canonical implementation is studio2_integrity_case_transition");
    expect(authority).toContain("Temporary compatibility shim; canonical implementation is studio2_integrity_resolve_appeal");
  });
});