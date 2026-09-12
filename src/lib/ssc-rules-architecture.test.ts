import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const canon = read("src/lib/ssc-rules/canon-v4.ts");
const types = read("src/lib/ssc-rules/types.ts");
const aliases = read("src/lib/ssc-rules/aliases.ts");
const search = read("src/lib/ssc-rules/search.ts");
const overlay = read("src/lib/ssc-rules/runtime-overlay.ts");
const index = read("src/lib/ssc-rules/index.ts");
const v4Compatibility = read("src/lib/ssc-rules-v4.ts");
const v3Compatibility = read("src/lib/ssc-rules-v3.ts");
const governance = read("src/lib/rules-governance.ts");

describe("SSC rulebook module architecture", () => {
  it("keeps canon, aliases, search, types and runtime overlay as separate modules", () => {
    expect(canon).toContain("export const SSC_RULE_CHAPTERS");
    expect(canon).toContain("export const SSC_RULES");
    expect(canon).toContain("export const SSC_RULEBOOK");
    expect(types).toContain("export type SscRule");
    expect(types).toContain("export type SscRuleChapter");
    expect(aliases).toContain("SEARCH_SYNONYMS");
    expect(search).toContain("export function searchSscRules");
    expect(search).toContain("export function getRuleById");
    expect(overlay).toContain("export function applyPublishedRulebookRelease");
    expect(overlay).toContain("export function buildRuleSnapshot");
  });

  it("exposes one public API instead of duplicate rule implementations", () => {
    expect(index).toContain('export * from "@/lib/ssc-rules/canon-v4"');
    expect(index).toContain('export * from "@/lib/ssc-rules/search"');
    expect(index).toContain('export * from "@/lib/ssc-rules/runtime-overlay"');
    expect(v4Compatibility.trim()).toMatch(/export \* from "@\/lib\/ssc-rules\/index";$/);
    expect(v3Compatibility).toContain('export * from "@/lib/ssc-rules/index"');
    expect(v4Compatibility).not.toContain("SOURCE_RULES");
    expect(v4Compatibility).not.toContain("const PLANS");
  });

  it("keeps runtime mutation logic out of the Supabase query wrapper", () => {
    expect(governance).toContain("applyPublishedRulebookRelease");
    expect(governance).not.toContain("RULE_PATCH_FIELDS");
    expect(governance).not.toContain("BASE_FLAT_RULES_BY_ID");
    expect(governance).not.toContain("resetRulebookBaseline");
  });

  it("keeps search aliases as data rather than duplicate rule wording", () => {
    expect(aliases).toContain('friend: ["friend voting"');
    expect(aliases).toContain('appeal: ["review", "sanction", "conflict of interest"]');
    expect(aliases).not.toContain("body:");
    expect(aliases).not.toContain("summary:");
  });
});
