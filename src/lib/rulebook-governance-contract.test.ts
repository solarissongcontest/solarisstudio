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
const runtime = readFileSync(
  resolve(process.cwd(), "src/lib/rules-governance.ts"),
  "utf8",
);
const contextualGuide = readFileSync(
  resolve(process.cwd(), "src/components/rules/ContextualRuleGuide.tsx"),
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
    expect(validationMigration).toContain("with recursive ancestry as");
    expect(validationMigration).toContain("Rulebook release ancestry contains a cycle");
    expect(validationMigration).toContain("The draft base version is no longer a published rulebook release");
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

  it("puts contextual rules inside the workflows where decisions happen", () => {
    expect(contextualGuide).toContain('/confirmations');
    expect(contextualGuide).toContain('/televoting');
    expect(contextualGuide).toContain('/admin/friend-voting');
    expect(contextualGuide).toContain('/admin/integrity');
    expect(contextualGuide).toContain('Rules for this page');
    expect(decisionStrip).toContain("RuleChip");
    expect(decisionStrip).toContain("Rules at this decision");
    expect(confirmationReceipt).toContain("Confirmation fairness & submission rules");
    expect(confirmationReceipt).toContain('["4.3", "4.4", "4.6", "4.7", "20.1"]');
    expect(televotingReceipt).toContain("Independent voting & integrity");
    expect(televotingReceipt).toContain('["10.1", "10.2", "11.2", "11.4", "11.5", "11.7"]');
    expect(navigation).toContain('<ContextualRuleGuide />');
    expect(navigation).toContain('/rules/changes');
  });
});
