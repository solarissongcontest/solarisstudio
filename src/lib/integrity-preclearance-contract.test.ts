import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const rulingMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260911161700_integrity_preclearance_rulings.sql"),
  "utf8",
);
const sourceMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260911161800_rule_interpretation_case_sources.sql"),
  "utf8",
);
const api = readFileSync(resolve(process.cwd(), "src/lib/integrity-preclearance.ts"), "utf8");
const adminRoute = readFileSync(
  resolve(process.cwd(), "src/routes/_authenticated/admin/integrity-preclearance.tsx"),
  "utf8",
);
const reporterRoute = readFileSync(
  resolve(process.cwd(), "src/routes/integrity/preclearance.tsx"),
  "utf8",
);

describe("Integrity pre-clearance rulings", () => {
  it("stores structured organizer rulings behind RLS instead of using mutable chat text as policy", () => {
    expect(rulingMigration).toContain("create table if not exists public.integrity_preclearance_rulings");
    expect(rulingMigration).toContain("allowed', 'not_allowed', 'needs_more_information', 'guidance_only");
    expect(rulingMigration).toContain("constraint integrity_preclearance_has_rules");
    expect(rulingMigration).toContain("alter table public.integrity_preclearance_rulings enable row level security");
    expect(rulingMigration).toContain("revoke all on public.integrity_preclearance_rulings from anon, authenticated");
  });

  it("only allows organizers to rule on protected private rule-question cases", () => {
    expect(rulingMigration).toContain("if not public.integrity_is_organizer()");
    expect(rulingMigration).toContain("Pre-clearance rulings are only available for private rule questions");
    expect(rulingMigration).toContain("perform public.integrity_validate_rule_ids(_rule_ids)");
    expect(rulingMigration).toContain("Pre-clearance summary must be between 5 and 500 characters");
    expect(rulingMigration).toContain("Pre-clearance rationale must be between 20 and 12000 characters");
  });

  it("limits participant retrieval to the account that owns the protected case", () => {
    expect(rulingMigration).toContain("reporter_integrity_preclearance_rulings");
    expect(rulingMigration).toContain("c.id = _case_id and c.reporter_user_id = auth.uid()");
    expect(rulingMigration).toContain("Case not available");
  });

  it("keeps interpretation source provenance internal and separate from public interpretation records", () => {
    expect(sourceMigration).toContain("create table if not exists public.ssc_rule_interpretation_sources");
    expect(sourceMigration).toContain("alter table public.ssc_rule_interpretation_sources enable row level security");
    expect(sourceMigration).toContain("revoke all on public.ssc_rule_interpretation_sources from anon, authenticated");
    expect(sourceMigration).toContain("admin_rule_interpretation_sources");
    expect(sourceMigration).not.toContain("grant execute on function public.admin_rule_interpretation_sources(uuid) to anon");
  });

  it("promotes only an organizer-authored ruling from the same private case into an unpublished interpretation draft", () => {
    expect(sourceMigration).toContain("admin_create_rule_interpretation_from_integrity_case");
    expect(sourceMigration).toContain("where r.id = _ruling_id and r.case_id = _case_id");
    expect(sourceMigration).toContain("v_created := public.admin_create_rule_interpretation");
    expect(sourceMigration).toContain("v_ruling.summary");
    expect(sourceMigration).not.toContain("c.details");
    expect(sourceMigration).toContain("preclearance.interpretation_draft_created");
    expect(sourceMigration).toMatch(/'preclearance\.interpretation_draft_created'[\s\S]*false,[\s\S]*auth\.uid\(\)/);
  });

  it("exposes narrow client helpers for organizer and reporter flows", () => {
    expect(api).toContain("admin_integrity_preclearance_rulings");
    expect(api).toContain("admin_record_integrity_preclearance_ruling");
    expect(api).toContain("reporter_integrity_preclearance_rulings");
    expect(api).toContain("admin_create_rule_interpretation_from_integrity_case");
  });

  it("gives organizers a structured ruling workspace and only creates interpretation drafts", () => {
    expect(adminRoute).toContain("recordAdminPreclearanceRuling");
    expect(adminRoute).toContain("createInterpretationDraftFromPreclearance");
    expect(adminRoute).toContain("Create unpublished Official Interpretation draft");
    expect(adminRoute).toContain("Creating this does not publish anything");
    expect(adminRoute).not.toContain("admin_publish_rule_interpretation");
  });

  it("gives participants read access to their rulings without organizer RPCs", () => {
    expect(reporterRoute).toContain("getReporterPreclearanceRulings");
    expect(reporterRoute).toContain("My rule rulings");
    expect(reporterRoute).not.toContain("admin_integrity_preclearance_rulings");
    expect(reporterRoute).not.toContain("admin_record_integrity_preclearance_ruling");
  });
});
