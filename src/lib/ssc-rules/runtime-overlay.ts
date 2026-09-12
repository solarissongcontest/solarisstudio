import { SSC_RULEBOOK, SSC_RULES, SSC_RULE_CHAPTERS } from "@/lib/ssc-rules/canon-v4";
import { getRuleById } from "@/lib/ssc-rules/search";
import type { RuleTone, SscRule } from "@/lib/ssc-rules/types";

export type RulebookChangeKind = "added" | "modified" | "removed" | "interpretation";

export type RuleSnapshot = {
  id?: string;
  title?: string;
  summary?: string;
  tone?: RuleTone;
  body?: string[];
  bullets?: string[] | null;
  allowed?: string[] | null;
  prohibited?: string[] | null;
  important?: string | null;
  examples?: SscRule["examples"] | null;
  tags?: string[];
  relatedRules?: string[] | null;
};

export type RulebookChange = {
  id?: string;
  rule_id: string;
  change_kind: RulebookChangeKind;
  before_snapshot: RuleSnapshot | null;
  after_snapshot: RuleSnapshot | null;
  rationale: string;
  created_at?: string;
  updated_at?: string;
};

export type RulebookRelease = {
  id?: string;
  version: string;
  status?: "draft" | "published" | "archived";
  is_current?: boolean;
  title: string;
  summary: string;
  base_version?: string | null;
  effective_from?: string | null;
  created_at?: string;
  updated_at?: string;
  published_at?: string | null;
  change_count?: number;
  /** Changes introduced by this release only. Used by history and review UI. */
  changes: RulebookChange[];
  /** Cumulative inherited overrides needed to render the current rulebook. */
  effective_changes?: RulebookChange[];
  events?: Array<{
    id: string;
    event_type: string;
    detail: string | null;
    created_at: string;
  }>;
};

const RULE_PATCH_FIELDS = [
  "title",
  "summary",
  "tone",
  "body",
  "bullets",
  "allowed",
  "prohibited",
  "important",
  "examples",
  "tags",
  "relatedRules",
] as const;

const BASE_FLAT_RULES_BY_ID = new Map(
  SSC_RULES.map((rule) => [rule.id, cloneRecord(rule as unknown as Record<string, unknown>)]),
);
const BASE_CHAPTER_RULES_BY_ID = new Map(
  SSC_RULE_CHAPTERS.flatMap((chapter) =>
    chapter.rules.map((rule) => [rule.id, cloneRecord(rule as unknown as Record<string, unknown>)] as const),
  ),
);
const BASE_RULEBOOK_META = {
  version: SSC_RULEBOOK.version,
  status: SSC_RULEBOOK.status,
};

let appliedReleaseVersion: string | null = null;

function cloneRecord<T extends Record<string, unknown>>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function resetRecord(target: Record<string, unknown>, baseline: Record<string, unknown>) {
  for (const key of Object.keys(target)) delete target[key];
  Object.assign(target, cloneRecord(baseline));
}

function resetRulebookBaseline() {
  for (const rule of SSC_RULES) {
    const baseline = BASE_FLAT_RULES_BY_ID.get(rule.id);
    if (baseline) resetRecord(rule as unknown as Record<string, unknown>, baseline);
  }

  for (const chapter of SSC_RULE_CHAPTERS) {
    for (const rule of chapter.rules) {
      const baseline = BASE_CHAPTER_RULES_BY_ID.get(rule.id);
      if (baseline) resetRecord(rule as unknown as Record<string, unknown>, baseline);
    }
  }

  const mutableRulebook = SSC_RULEBOOK as unknown as { version: string; status: string };
  mutableRulebook.version = BASE_RULEBOOK_META.version;
  mutableRulebook.status = BASE_RULEBOOK_META.status;
}

function applySnapshotToRule(rule: SscRule, snapshot: RuleSnapshot) {
  const target = rule as unknown as Record<string, unknown>;
  const patch = snapshot as unknown as Record<string, unknown>;

  for (const field of RULE_PATCH_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(patch, field)) continue;
    const value = patch[field];
    if (value === null) delete target[field];
    else target[field] = value;
  }
}

/** Apply an immutable published release over the bundled v4 canon. */
export function applyPublishedRulebookRelease(release: RulebookRelease | null | undefined) {
  if (!release?.version) {
    if (appliedReleaseVersion !== null) {
      resetRulebookBaseline();
      appliedReleaseVersion = null;
    }
    return;
  }

  if (appliedReleaseVersion === release.version) return;
  resetRulebookBaseline();

  const runtimeChanges = release.effective_changes ?? release.changes ?? [];
  for (const change of runtimeChanges) {
    if (!change.after_snapshot) continue;
    if (change.change_kind !== "modified" && change.change_kind !== "interpretation") continue;

    const flatRule = SSC_RULES.find((rule) => rule.id === change.rule_id);
    if (flatRule) applySnapshotToRule(flatRule, change.after_snapshot);

    for (const chapter of SSC_RULE_CHAPTERS) {
      const chapterRule = chapter.rules.find((rule) => rule.id === change.rule_id);
      if (chapterRule) applySnapshotToRule(chapterRule, change.after_snapshot);
    }
  }

  const mutableRulebook = SSC_RULEBOOK as unknown as { version: string; status: string };
  mutableRulebook.version = release.version;
  mutableRulebook.status = release.title;
  appliedReleaseVersion = release.version;
}

export function buildRuleSnapshot(ruleId: string): RuleSnapshot | null {
  const rule = getRuleById(ruleId);
  if (!rule) return null;
  return {
    id: rule.id,
    title: rule.title,
    summary: rule.summary,
    tone: rule.tone,
    body: [...rule.body],
    bullets: rule.bullets ? [...rule.bullets] : null,
    allowed: rule.allowed ? [...rule.allowed] : null,
    prohibited: rule.prohibited ? [...rule.prohibited] : null,
    important: rule.important ?? null,
    examples: rule.examples ? rule.examples.map((example) => ({ ...example })) : null,
    tags: [...rule.tags],
    relatedRules: rule.relatedRules ? [...rule.relatedRules] : null,
  };
}
