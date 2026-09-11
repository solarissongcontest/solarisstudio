import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260910214000_rulebook_governance.sql"),
  "utf8",
);
const chainMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260910214500_rulebook_release_chain.sql"),
  "utf8",
);
const validationMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260910215000_rulebook_release_validation.sql"),
  "utf8",
);
const ancestryMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260910215500_rulebook_ancestry_integrity.sql"),
  "utf8",
);
const publicationHardening = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260911161300_rulebook_publication_state_hardening.sql"),
  "utf8",
);
const runtime = readFileSync(
  resolve(process.cwd(), "src/lib/rules-governance.ts"),
  "utf8",
);
const contextualGuide = readFileSync(
  resolve(process.cwd(), "src/components/rules/ContextualRuleGuide.tsx"),
  "utf8",
);
const ruleContext = readFileSync(
  resolve(process.cwd(), "src/lib/rule-context.ts"),
  "utf8",
);
const decisionStrip = readFileSync(
  resolve(process.cwd(), "src/components/rules/RuleDecisionStrip.tsx"),
  "utf8",
);
const confirmationReceipt = readFileSync(
  resolve(process.cwd(), "src/components/ConfirmationFormWithReceipt.tsx"),
  "utf8",
);
const televotingReceipt = readFileSync(
  resolve(process.cwd(), "src/components/televoting/TelevotingBoothWithReceipt.tsx"),
  "utf8",
);
const investigations = readFileSync(
  resolve(process.cwd(), "src/routes/_authenticated/admin/integrity-investigations.tsx"),
  "utf8",
);
const navigation = readFileSync(
  resolve(process.cwd(), "src/components/GlobalRulesNavigationAddon.tsx"),
  "utf8",
);

describe("rulebook governance contract", () => {
  it("stores releases, rule-level snapshots and an audit trail", () => {
    expect(migration).toContain("create table if not exists public.ssc_rulebook_releases");
    expect(migration).toContain("create table if not exists public.ssc_rulebook_change_items");
    expect(migration).toContain("before_snapshot jsonb");
    expect(migration).toContain("after_snapshot jsonb");
    expect(migration).toContain("create table if not exists public.ssc_rulebook_events");
  });

  it("keeps direct rulebook-governance tables closed and exposes narrow RPCs", () => {
    expect(migration).toContain("alter table public.ssc_rulebook_releases enable row level security");
    expect(migration).toContain("revoke all on public.ssc_rulebook_releases from anon, authenticated");
    expect(migration).toContain("public_current_rulebook_release");
    expect(migration).toContain("public_rulebook_release_history");
    expect(migration).toContain("admin_rulebook_releases");
    expect(migration).toContain("admin_create_rulebook_release");
    expect(migration).toContain("admin_upsert_rulebook_change");
    expect(migration).toContain("admin_publish_rulebook_release");
  });

  it("allows only one published rulebook to be marked current", () => {
    expect(migration).toContain("ssc_rulebook_one_current_idx");
    expect(migration).toMatch(/where is_current = true/i);
    expect(migration).toContain("not is_current or status = 'published'");
    expect(migration).toContain("update public.ssc_rulebook_releases set is_current = false where is_current = true");
  });

  it("makes published releases immutable through the editor RPCs", () => {
    expect(migration).toMatch(/if v_status <> 'draft' then raise exception 'Only draft releases can be edited'/i);
    expect(validationMigration).toMatch(/if v_status <> 'draft' then\s+raise exception 'Only draft releases can be published'/i);
    expect(chainMigration).toContain("Published rulebook history cannot be archived");
  });

  it("requires explicit rationale and preserves a public version history", () => {
    expect(migration).toContain("Rationale must be between 5 and 4000 characters");
    expect(migration).toContain("where r.status = 'published'");
    expect(migration).toContain("'rationale', c.rationale");
  });

  it("validates release ancestry even when governance RPCs are called directly", () => {
    expect(validationMigration).toContain("Base rulebook version must be a published release");
    expect(validationMigration).toContain("A rulebook release cannot inherit from itself");
    expect(ancestryMigration).toContain("with recursive ancestry as");
    expect(ancestryMigration).toContain("Rulebook release ancestry contains a cycle");
    expect(ancestryMigration).toContain("Rulebook release ancestry contains a missing or unpublished base version");
    expect(ancestryMigration).toContain("Rulebook release ancestry exceeds the supported depth");
  });

  it("does not let a stale branch silently replace changes from the current release", () => {
    expect(publicationHardening).toContain("Draft base is no longer the current rulebook release; create or rebase the draft before publishing");
    expect(publicationHardening).toContain("v_base_version is distinct from v_current_version");
    expect(publicationHardening).toContain("A new rulebook version must be greater than its base version");
  });

  it("never makes a future-effective release current before its effective time", () => {
    expect(publicationHardening).toContain("A rulebook release can only be published once its effective time has arrived");
    expect(publicationHardening).toContain("_effective_from > now()");
    expect(publicationHardening).toContain("r.effective_from <= now()");
    expect(publicationHardening).toContain("Repair any legacy state where a future-effective release was marked current");
  });

  it("resolves inherited rule changes across a version chain", () => {
    expect(chainMigration).toContain("with recursive current_release as");
    expect(chainMigration).toContain("release_chain as");
    expect(chainMigration).toContain("partition by c.rule_id");
    expect(chainMigration).toContain("'effective_changes'");
    expect(runtime).toContain("release.effective_changes ?? release.changes ?? []");
  });

  it("applies only safe existing-rule changes at runtime", () => {
    expect(runtime).toContain('change.change_kind !== "modified" && change.change_kind !== "interpretation"');
    expect(runtime).toContain("resetRulebookBaseline");
    expect(runtime).toContain("SSC_RULES.find");
    expect(runtime).toContain("SSC_RULE_CHAPTERS");
    expect(runtime).toContain("public_current_rulebook_release");
  });

  it("resets to bundled v4 when no current published release remains", () => {
    expect(runtime).toContain("if (!release?.version)");
    expect(runtime).toContain("if (appliedReleaseVersion !== null)");
    expect(runtime).toContain("appliedReleaseVersion = null");
  });

  it("puts contextual rules inside the workflows where decisions happen", () => {
    expect(contextualGuide).toContain('getRuleContext');
    expect(contextualGuide).toContain('Rules for this page');
    expect(ruleContext).toContain('/confirmations');
    expect(ruleContext).toContain('/televoting');
    expect(ruleContext).toContain('/admin/friend-voting');
    expect(ruleContext).toContain('/admin/integrity');
    expect(decisionStrip).toContain("RuleChip");
    expect(decisionStrip).toContain("Rules at this decision");
    expect(confirmationReceipt).toContain("Confirmation fairness & submission rules");
    expect(confirmationReceipt).toContain('["4.3", "4.4", "4.6", "4.7", "20.1"]');
    expect(televotingReceipt).toContain("Independent voting & integrity");
    expect(televotingReceipt).toContain('["10.1", "11.1", "11.2", "11.4", "11.5", "11.7"]');
    expect(investigations).toContain("Evidence, findings & investigator independence");
    for (const ruleId of ["16.1", "16.2", "16.3", "16.4", "16.5", "16.6", "17.1", "17.7", "18.3"])
      expect(investigations).toContain(`"${ruleId}"`);
    expect(navigation).toContain('<ContextualRuleGuide />');
    expect(navigation).toContain('/rules/changes');
  });
});