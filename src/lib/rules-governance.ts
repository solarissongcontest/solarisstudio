import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";

import { supabase } from "@/integrations/supabase/client";
import {
  SSC_RULEBOOK,
  SSC_RULES,
  SSC_RULE_CHAPTERS,
  getRuleById,
  type RuleTone,
  type SscRule,
} from "@/lib/ssc-rules-v4";

export type RulebookChangeKind = "added" | "modified" | "removed" | "interpretation";

export type RuleSnapshot = Partial<SscRule> & {
  id?: string;
  title?: string;
  summary?: string;
  tone?: RuleTone;
  body?: string[];
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
  changes: RulebookChange[];
  events?: Array<{
    id: string;
    event_type: string;
    detail: string | null;
    created_at: string;
  }>;
};

const RULE_PATCH_FIELDS: Array<keyof SscRule> = [
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
];

let appliedReleaseVersion: string | null = null;

function applySnapshotToRule(rule: SscRule, snapshot: RuleSnapshot) {
  for (const field of RULE_PATCH_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(snapshot, field)) {
      const value = snapshot[field];
      (rule as unknown as Record<string, unknown>)[field] = value;
    }
  }
}

/**
 * Applies published modifications over the bundled v4 baseline.
 *
 * The current editor intentionally limits live publishing to modifications and
 * interpretations of existing rule IDs. The database schema already models
 * additions/removals for a later major-version editor, but those need a full
 * chapter/index rebuild instead of pretending a new ID magically exists in the
 * static rule map.
 */
export function applyPublishedRulebookRelease(release: RulebookRelease | null | undefined) {
  if (!release?.version || appliedReleaseVersion === release.version) return;

  for (const change of release.changes ?? []) {
    if (!change.after_snapshot) continue;
    if (change.change_kind !== "modified" && change.change_kind !== "interpretation") continue;

    const flatRule = SSC_RULES.find((rule) => rule.id === change.rule_id);
    if (flatRule) applySnapshotToRule(flatRule, change.after_snapshot);

    for (const chapter of SSC_RULE_CHAPTERS) {
      const chapterRule = chapter.rules.find((rule) => rule.id === change.rule_id);
      if (chapterRule) applySnapshotToRule(chapterRule, change.after_snapshot);
    }
  }

  const mutableRulebook = SSC_RULEBOOK as unknown as {
    version: string;
    status: string;
  };
  mutableRulebook.version = release.version;
  mutableRulebook.status = release.title;
  appliedReleaseVersion = release.version;
}

export async function fetchCurrentRulebookRelease(): Promise<RulebookRelease | null> {
  const { data, error } = await (supabase as any).rpc("public_current_rulebook_release");
  if (error) throw new Error(error.message);
  if (!data || typeof data !== "object") return null;
  return data as RulebookRelease;
}

export async function fetchRulebookReleaseHistory(): Promise<RulebookRelease[]> {
  const { data, error } = await (supabase as any).rpc("public_rulebook_release_history");
  if (error) throw new Error(error.message);
  return Array.isArray(data) ? (data as RulebookRelease[]) : [];
}

export async function fetchAdminRulebookReleases(): Promise<RulebookRelease[]> {
  const { data, error } = await (supabase as any).rpc("admin_rulebook_releases");
  if (error) throw new Error(error.message);
  return Array.isArray(data) ? (data as RulebookRelease[]) : [];
}

export function usePublishedRulebook() {
  const query = useQuery({
    queryKey: ["public-rulebook-release"],
    queryFn: fetchCurrentRulebookRelease,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  useEffect(() => {
    applyPublishedRulebookRelease(query.data);
  }, [query.data]);

  return {
    ...query,
    version: query.data?.version ?? SSC_RULEBOOK.version,
  };
}

export function useRulebookReleaseHistory() {
  return useQuery({
    queryKey: ["public-rulebook-release-history"],
    queryFn: fetchRulebookReleaseHistory,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
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
    bullets: rule.bullets ? [...rule.bullets] : undefined,
    allowed: rule.allowed ? [...rule.allowed] : undefined,
    prohibited: rule.prohibited ? [...rule.prohibited] : undefined,
    important: rule.important,
    examples: rule.examples ? rule.examples.map((example) => ({ ...example })) : undefined,
    tags: [...rule.tags],
    relatedRules: rule.relatedRules ? [...rule.relatedRules] : undefined,
  };
}

export function useRuntimeRule(ruleId: string) {
  const release = usePublishedRulebook();
  return useMemo(
    () => ({ release, rule: getRuleById(ruleId) }),
    [release.data, release.version, ruleId],
  );
}
