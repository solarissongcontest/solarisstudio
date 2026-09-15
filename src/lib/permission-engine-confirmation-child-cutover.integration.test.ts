import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrations = readdirSync(resolve(process.cwd(), "supabase/migrations"));
const migrationName = migrations.find((name) =>
  name.endsWith("_permission_engine_v2_confirmation_child_rls.sql"),
);

if (!migrationName) {
  throw new Error("Permission Engine confirmation child cutover migration is missing");
}

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations", migrationName),
  "utf8",
);

function policyBlock(name: string) {
  const start = migration.indexOf(`create policy "${name}"`);
  expect(start).toBeGreaterThanOrEqual(0);
  const next = migration.indexOf("create policy", start + 1);
  return migration.slice(start, next === -1 ? migration.length : next);
}

describe("Permission Engine confirmation child RLS cutover", () => {
  it("moves national finals to edition-scoped strict confirmation.manage", () => {
    const block = policyBlock("national finals capability manage");
    expect(block).toContain("'confirmation.manage', edition_id, true");
    expect(block).not.toContain("has_role");
  });

  it("resolves national-final entries through their canonical parent", () => {
    const block = policyBlock("national final entries capability manage");
    expect(block).toContain("from public.national_finals nf");
    expect(block).toContain("nf.id = national_final_id");
    expect(block).toContain("'confirmation.manage', nf.edition_id, true");
    expect(block).not.toContain("has_role");
  });

  it("resolves submission children through submissions", () => {
    for (const policy of [
      "submission browser sessions capability manage",
      "submission ip history capability manage",
      "submission review history capability manage",
      "submission versions capability manage",
    ]) {
      const block = policyBlock(policy);
      expect(block).toContain("from public.submissions s");
      expect(block).toContain("s.id = submission_id");
      expect(block).toContain("'confirmation.manage', s.edition_id, true");
      expect(block).not.toContain("has_role");
    }
  });

  it("resolves drafts through their required submission round", () => {
    const block = policyBlock("submission drafts capability manage");
    expect(block).toContain("from public.submission_rounds r");
    expect(block).toContain("r.id = round_id");
    expect(block).toContain("'confirmation.manage', r.edition_id, true");
    expect(block).not.toContain("has_role");
  });

  it("keeps SECURITY DEFINER national-final RPC authorization out of this RLS-only batch", () => {
    expect(migration).not.toContain("create or replace function public.can_manage_country_national_finals");
    expect(migration).not.toContain("security definer");
  });
});
