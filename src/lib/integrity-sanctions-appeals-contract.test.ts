import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260911160000_integrity_sanctions_and_appeals.sql"),
  "utf8",
);
const reporterMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260911160100_integrity_reporter_appeals.sql"),
  "utf8",
);
const extensionMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260911160200_integrity_appeal_extensions.sql"),
  "utf8",
);
const queueMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260911160300_integrity_appeal_queue.sql"),
  "utf8",
);
const portal = readFileSync(
  resolve(process.cwd(), "src/lib/integrity-portal.ts"),
  "utf8",
);
const organizerRoute = readFileSync(
  resolve(process.cwd(), "src/routes/_authenticated/admin/integrity-resolution.$caseId.tsx"),
  "utf8",
);
const investigationsRoute = readFileSync(
  resolve(process.cwd(), "src/routes/_authenticated/admin/integrity-investigations.tsx"),
  "utf8",
);
const appealsQueueRoute = readFileSync(
  resolve(process.cwd(), "src/routes/_authenticated/admin/integrity-appeals.tsx"),
  "utf8",
);
const protectedAppealRoute = readFileSync(
  resolve(process.cwd(), "src/routes/integrity/appeal.$caseId.tsx"),
  "utf8",
);
const appealsLandingRoute = readFileSync(
  resolve(process.cwd(), "src/routes/integrity/appeals.tsx"),
  "utf8",
);
const anonymousAppealRoute = readFileSync(
  resolve(process.cwd(), "src/routes/integrity/anonymous-appeal.tsx"),
  "utf8",
);
const integrityIndex = readFileSync(
  resolve(process.cwd(), "src/routes/integrity/index.tsx"),
  "utf8",
);
const adminNav = readFileSync(
  resolve(process.cwd(), "src/components/admin/AdminNav.tsx"),
  "utf8",
);

const EXPECTED_LEVELS = [
  "Official Warning",
  "Loss of 50% of Bonus Points",
  "No Bonus Points Awarded",
  "−5 Contest Points",
  "−25 Contest Points",
  "−50 Contest Points",
  "−100 Contest Points",
  "Disqualification",
  "Disqualification + One-Edition Ban",
  "Lifetime Ban",
];

describe("Integrity sanctions and appeals contract", () => {
  it("stores structured sanctions separately from findings", () => {
    expect(migration).toContain("create table if not exists public.integrity_case_sanctions");
    expect(migration).toContain("finding_id uuid not null references public.integrity_case_findings");
    expect(migration).toContain("typical_level integer");
    expect(migration).toContain("final_level integer not null");
    expect(migration).toContain("aggravating_factors text[]");
    expect(migration).toContain("mitigating_factors text[]");
    expect(migration).toContain("target_type text not null");
  });

  it("maps every canonical sanction level to the exact SSC label", () => {
    EXPECTED_LEVELS.forEach((label, index) => {
      expect(migration).toContain(`when ${index + 1} then '${label}'`);
      expect(organizerRoute).toContain(`"${label}"`);
    });
    expect(migration).toContain("sanction_label_matches_level");
  });

  it("requires a confirmed violation finding before imposing a sanction", () => {
    expect(migration).toContain("Finding does not belong to this case");
    expect(migration).toContain("A sanction requires a confirmed violation finding");
    expect(migration).toContain("where id = _finding_id and case_id = _case_id");
    expect(organizerRoute).toContain('finding.outcome === "violation"');
  });

  it("records both the normal starting level and the final human decision", () => {
    expect(migration).toContain("_typical_level integer");
    expect(migration).toContain("_final_level integer");
    expect(migration).toContain("Sanction rationale must be between 20 and 12000 characters");
    expect(organizerRoute).toContain("Typical starting level");
    expect(organizerRoute).toContain("Final level");
    expect(organizerRoute).toContain("Aggravating factors");
    expect(organizerRoute).toContain("Mitigating factors");
  });

  it("implements the 48-hour appeal deadline for protected and anonymous reporters", () => {
    expect(migration.match(/interval '48 hours'/g)?.length).toBeGreaterThanOrEqual(2);
    expect(migration).toContain("reporter_submit_integrity_appeal");
    expect(migration).toContain("public_submit_anonymous_integrity_appeal");
    expect(migration).toContain("recovery_secret_hash = v_hash");
    expect(migration).toContain("case when v_timely then 'submitted' else 'rejected_late' end");
    expect(reporterMigration).toContain("'appeal_deadline', s.effective_at + interval '48 hours'");
  });

  it("allows exceptional late-appeal extensions only through an audited organizer action", () => {
    expect(extensionMigration).toContain("admin_grant_integrity_appeal_extension");
    expect(extensionMigration).toContain("Only an appeal rejected as late can receive an exceptional deadline extension");
    expect(extensionMigration).toContain("Extended deadline must cover the already-submitted appeal");
    expect(extensionMigration).toContain("Exceptional appeal extensions cannot exceed 14 days without a rulebook change");
    expect(extensionMigration).toContain("extension_granted_by = auth.uid()");
    expect(extensionMigration).toContain("'appeal.extension_granted'");
    expect(extensionMigration).toContain("visible_to_reporter");
    expect(appealsQueueRoute).toContain("Exceptional extension");
    expect(appealsQueueRoute).toContain("admin_grant_integrity_appeal_extension");
  });

  it("gives protected and anonymous reporters narrow APIs and discoverable pages to inspect and submit appeals", () => {
    expect(reporterMigration).toContain("reporter_integrity_case_resolution");
    expect(reporterMigration).toContain("public_get_anonymous_integrity_resolution");
    expect(portal).toContain("getProtectedIntegrityResolution");
    expect(portal).toContain("submitProtectedIntegrityAppeal");
    expect(portal).toContain("getAnonymousIntegrityResolution");
    expect(portal).toContain("submitAnonymousIntegrityAppeal");
    expect(protectedAppealRoute).toContain("submitProtectedIntegrityAppeal");
    expect(protectedAppealRoute).toContain("48 hours");
    expect(anonymousAppealRoute).toContain("submitAnonymousIntegrityAppeal");
    expect(anonymousAppealRoute).toContain("recovery key");
    expect(appealsLandingRoute).toContain('to="/integrity/appeal/$caseId"');
    expect(appealsLandingRoute).toContain('to="/integrity/anonymous-appeal"');
    expect(integrityIndex).toContain('to="/integrity/appeals"');
    expect(integrityIndex).toContain('to="/integrity/anonymous-appeal"');
  });

  it("prevents duplicate reporter appeals for one sanction", () => {
    expect(reporterMigration).toContain("integrity_case_one_reporter_appeal_per_sanction_idx");
    expect(reporterMigration).toContain("where submitted_via in ('protected_reporter', 'anonymous_recovery')");
  });

  it("requires a fresh appeal reviewer rather than the original finding or sanction decision-maker", () => {
    expect(reporterMigration).toContain("The original sanction decision-maker cannot be the appeal reviewer");
    expect(reporterMigration).toContain("The original finding author cannot be the appeal reviewer");
    expect(migration).toContain("Only the assigned appeal reviewer may decide this appeal");
    expect(migration).toContain("'appeal_reviewer'");
    expect(organizerRoute).toContain("Fresh appeal reviewer");
  });

  it("preserves the original sanction when an appeal changes the level", () => {
    expect(migration).toContain("supersedes_sanction_id");
    expect(migration).toContain("modified_on_appeal");
    expect(migration).toContain("replacement_sanction_id");
    expect(migration).toContain("update public.integrity_case_sanctions set status = 'overturned'");
  });

  it("keeps sanction and appeal tables inaccessible through direct client table access", () => {
    expect(migration).toContain("alter table public.integrity_case_sanctions enable row level security");
    expect(migration).toContain("alter table public.integrity_case_appeals enable row level security");
    expect(migration).toContain("revoke all on public.integrity_case_sanctions from anon, authenticated");
    expect(migration).toContain("revoke all on public.integrity_case_appeals from anon, authenticated");
  });

  it("exposes an organizer appeal queue through an organizer-gated RPC and dedicated navigation", () => {
    expect(queueMigration).toContain("admin_integrity_appeals");
    expect(queueMigration).toContain("if not public.integrity_is_organizer()");
    expect(queueMigration).toContain("join public.integrity_case_sanctions");
    expect(appealsQueueRoute).toContain("admin_integrity_appeals");
    expect(appealsQueueRoute).toContain('to="/admin/integrity-resolution/$caseId"');
    expect(adminNav).toContain('label: "Appeals"');
    expect(adminNav).toContain('to: "/admin/integrity-appeals"');
  });

  it("exposes organizer resolution data through a narrow organizer-gated RPC and visible workspace", () => {
    expect(migration).toContain("admin_integrity_case_resolution");
    expect(migration).toContain("if not public.integrity_is_organizer() then raise exception 'Organizer access required'");
    expect(migration).toContain("'sanctions'");
    expect(migration).toContain("'appeals'");
    expect(organizerRoute).toContain("admin_integrity_case_resolution");
    expect(organizerRoute).toContain("admin_record_integrity_sanction");
    expect(organizerRoute).toContain("admin_assign_integrity_appeal_reviewer");
    expect(organizerRoute).toContain("admin_decide_integrity_appeal");
    expect(investigationsRoute).toContain('to="/admin/integrity-resolution/$caseId"');
  });
});
