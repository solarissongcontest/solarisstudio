import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260911160400_rule_interpretations.sql"),
  "utf8",
);
const supersessionHardening = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260911161200_rule_interpretation_supersession_hardening.sql",
  ),
  "utf8",
);
const api = readFileSync(resolve(process.cwd(), "src/lib/rule-interpretations.ts"), "utf8");
const adminRoute = readFileSync(
  resolve(process.cwd(), "src/routes/_authenticated/admin/rule-interpretations.tsx"),
  "utf8",
);
const publicIndex = readFileSync(
  resolve(process.cwd(), "src/routes/rules/interpretations.tsx"),
  "utf8",
);
const publicPanel = readFileSync(
  resolve(process.cwd(), "src/components/rules/RuleInterpretationsPanel.tsx"),
  "utf8",
);
const rulePage = readFileSync(resolve(process.cwd(), "src/routes/rules/$ruleId.tsx"), "utf8");

describe("Official Interpretations governance", () => {
  it("stores interpretations independently from rulebook wording", () => {
    expect(migration).toContain("create table if not exists public.ssc_rule_interpretations");
    expect(migration).toContain("question text not null");
    expect(migration).toContain("interpretation text not null");
    expect(migration).toContain("rationale text not null");
    expect(migration).toContain("rule_ids text[] not null");
    expect(migration).toContain("status text not null default 'draft'");
  });

  it("keeps an exact server-side registry of current v4 rule IDs", () => {
    expect(migration).toContain("create table if not exists public.ssc_rule_registry");
    expect(migration).toContain("(6, 10)");
    expect(migration).toContain("(11, 8)");
    expect(migration).toContain("(17, 8)");
    expect(migration).toContain("(21, 4)");
    expect(migration).toContain("Unknown current SSC rule id");
    expect(migration).toContain(
      "select 1 from public.ssc_rule_registry where rule_id = v_normalized",
    );
  });

  it("keeps direct tables closed and exposes only narrow RPCs", () => {
    expect(migration).toContain(
      "alter table public.ssc_rule_interpretations enable row level security",
    );
    expect(migration).toContain(
      "revoke all on public.ssc_rule_interpretations from anon, authenticated",
    );
    expect(migration).toContain("revoke all on public.ssc_rule_registry from anon, authenticated");
    expect(migration).toContain("admin_rule_interpretations");
    expect(migration).toContain("admin_create_rule_interpretation");
    expect(migration).toContain("admin_update_rule_interpretation");
    expect(migration).toContain("admin_publish_rule_interpretation");
    expect(migration).toContain("admin_supersede_rule_interpretation");
    expect(migration).toContain("public_rule_interpretations");
  });

  it("makes published interpretation wording immutable", () => {
    expect(migration).toContain(
      "Published interpretations are immutable; supersede them with a new interpretation",
    );
    expect(migration).toContain("Only draft interpretations can be published");
    expect(adminRoute).toContain("Published interpretations are immutable");
    expect(adminRoute).toContain("publishRuleInterpretation");
  });

  it("requires explicit supersession instead of overwriting public history", () => {
    expect(migration).toContain(
      "superseded_by uuid null references public.ssc_rule_interpretations",
    );
    expect(migration).toContain("An interpretation cannot supersede itself");
    expect(migration).toContain("Replacement interpretation must already be published");
    expect(migration).toContain(
      "Replacement interpretation must address at least one of the same rules",
    );
    expect(adminRoute).toContain("supersedeRuleInterpretation");
    expect(publicIndex).toContain("Show superseded");
    expect(publicPanel).toContain("superseded interpretation");
  });

  it("does not retire current guidance before its replacement is actually effective", () => {
    expect(supersessionHardening).toContain(
      "Replacement interpretation must already be effective before superseding public guidance",
    );
    expect(supersessionHardening).toContain("v_new_effective > now()");
    expect(supersessionHardening).toContain(
      "Replacement interpretation cannot predate the interpretation it supersedes",
    );
    expect(supersessionHardening).toContain("v_new_published < v_old_published");
  });

  it("publishes only effective interpretations to participants", () => {
    expect(migration).toContain("where i.status in ('published', 'superseded')");
    expect(migration).toContain("i.effective_from <= now()");
    expect(migration).toContain(
      "grant execute on function public.public_rule_interpretations(text) to anon, authenticated",
    );
    expect(api).toContain("getPublicRuleInterpretations");
  });

  it("survives organizer-account deletion without invalidating published history", () => {
    expect(migration).toContain(
      "published_by uuid null references auth.users(id) on delete set null",
    );
    expect(migration).not.toContain(
      "status = 'published' and published_at is not null and published_by is not null",
    );
    expect(migration).not.toContain(
      "status = 'superseded' and published_at is not null and published_by is not null",
    );
  });

  it("shows interpretations on both permanent rule pages and a searchable public archive", () => {
    expect(rulePage).toContain("<RuleInterpretationsPanel ruleId={rule.id} />");
    expect(publicPanel).toContain("How TSBC has formally applied this rule");
    expect(publicIndex).toContain("Interpretations");
    expect(publicIndex).toContain("<PublicSearchField");
    expect(publicIndex).toContain('ariaLabel="Search official interpretations"');
    expect(publicIndex).toContain('placeholder="Search interpretations"');
    expect(publicIndex).toContain('item.status === "superseded"');
    expect(publicIndex).toContain("Show superseded");
  });
});
