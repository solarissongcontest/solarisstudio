import { supabase } from "@/integrations/supabase/client";

// TG8 schema is still on a stacked Governance PR. Do not bypass server RPCs or
// assume generated database types know the unreleased functions.
const client = supabase as any;
const object = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
const uuid = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const revision = (value: unknown): value is number =>
  Number.isSafeInteger(value) && (value as number) >= 0;
const fraction = (input: unknown): input is string =>
  typeof input === "string" && /^[1-9]\d{0,18}$/.test(input) &&
  BigInt(input) <= 9223372036854775807n;

export type WorldManagedInstitution = { id: string; slug: string; name: string };
export type WorldBallotType =
  "recorded_roll_call" | "restricted_roll_call" | "aggregate_only";
export type WorldThreshold = "simple_majority" | "fraction" | "unanimity";
export type WorldPublicationMode =
  "after_certification" | "aggregate_after_certification" | "withheld";
export type WorldTiePolicy = "no_passage" | "manual_review";
export type WorldVotingRule = {
  id: string;
  key: string;
  label: string;
  ballotType: WorldBallotType;
  quorumNumerator: string;
  quorumDenominator: string;
  thresholdKind: WorldThreshold;
  thresholdNumerator: string | null;
  thresholdDenominator: string | null;
  publicationMode: WorldPublicationMode;
  tiePolicy: WorldTiePolicy;
  revision: number;
};
export type WorldVotingRuleInput = Omit<WorldVotingRule, "id" | "revision"> & {
  organizationId: string;
  expectedRevision: number;
  operationId: string;
  idempotencyKey: string;
};
export type WorldVotingRuleReceipt = {
  ruleId: string;
  revision: number;
  operationId: string;
};

const ballotTypes = new Set<WorldBallotType>([
  "recorded_roll_call", "restricted_roll_call", "aggregate_only",
]);
const thresholds = new Set<WorldThreshold>(["simple_majority", "fraction", "unanimity"]);
const publications = new Set<WorldPublicationMode>([
  "after_certification", "aggregate_after_certification", "withheld",
]);
const tiePolicies = new Set<WorldTiePolicy>(["no_passage", "manual_review"]);
const secrecyFor: Record<WorldBallotType, string> = {
  recorded_roll_call: "public",
  restricted_roll_call: "restricted",
  aggregate_only: "aggregate",
};

export function parseWorldManagedInstitutions(value: unknown): WorldManagedInstitution[] {
  if (!Array.isArray(value) || value.length > 30) {
    throw new Error("Institution settings authority could not be verified.");
  }
  const seen = new Set<string>();
  return value.map((raw: unknown) => {
    const row = object(raw);
    if (!row || !uuid(row.id) ||
        typeof row.slug !== "string" ||
        !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(row.slug) ||
        typeof row.name !== "string" || !row.name.trim() ||
        row.name.length > 180 || seen.has(row.id)) {
      throw new Error("An institution record could not be verified.");
    }
    seen.add(row.id);
    return { id: row.id, slug: row.slug, name: row.name };
  });
}

export function parseWorldVotingRules(value: unknown, organizationId: string): WorldVotingRule[] {
  const root = object(value);
  if (!root || root.organizationId !== organizationId ||
      !Array.isArray(root.rules) || root.rules.length > 30) {
    throw new Error("Official rule configuration is unavailable.");
  }
  const seen = new Set<string>();
  return root.rules.map((raw: unknown) => {
    const rule = object(raw);
    const qn = rule?.quorumNumerator;
    const qd = rule?.quorumDenominator;
    const tn = rule?.thresholdNumerator;
    const td = rule?.thresholdDenominator;
    if (!rule || !uuid(rule.id) ||
        typeof rule.key !== "string" || !/^[a-z][a-z0-9_.-]{0,79}$/.test(rule.key) ||
        typeof rule.label !== "string" || !rule.label.trim() || rule.label.length > 160 ||
        !ballotTypes.has(rule.ballotType as WorldBallotType) ||
        rule.secrecy !== secrecyFor[rule.ballotType as WorldBallotType] ||
        !fraction(qn) || !fraction(qd) || BigInt(qn) > BigInt(qd) ||
        !thresholds.has(rule.thresholdKind as WorldThreshold) ||
        (rule.thresholdKind === "fraction"
          ? !fraction(tn) || !fraction(td) || BigInt(tn) > BigInt(td)
          : tn !== null || td !== null) ||
        rule.denominatorPolicy !== "all_cast_including_abstentions" ||
        rule.abstentionAllowed !== true ||
        rule.ballotChangePolicy !== "locked_after_cast" ||
        !publications.has(rule.publicationMode as WorldPublicationMode) ||
        !tiePolicies.has(rule.tiePolicy as WorldTiePolicy) ||
        !fraction(rule.revision) || !revision(Number(rule.revision)) ||
        Number(rule.revision) < 1 ||
        seen.has(rule.key)) {
      throw new Error("A policy version or constitutional fraction could not be verified.");
    }
    seen.add(rule.key);
    return {
      id: rule.id,
      key: rule.key,
      label: rule.label,
      ballotType: rule.ballotType as WorldBallotType,
      quorumNumerator: qn,
      quorumDenominator: qd,
      thresholdKind: rule.thresholdKind as WorldThreshold,
      thresholdNumerator: tn as string | null,
      thresholdDenominator: td as string | null,
      publicationMode: rule.publicationMode as WorldPublicationMode,
      tiePolicy: rule.tiePolicy as WorldTiePolicy,
      revision: Number(rule.revision),
    };
  });
}

export function validateVotingRuleInput(input: WorldVotingRuleInput): void {
  if (!uuid(input.organizationId) ||
      !/^[a-z][a-z0-9_.-]{0,79}$/.test(input.key) ||
      !input.label.trim() || input.label.trim().length > 160 ||
      !ballotTypes.has(input.ballotType) ||
      !fraction(input.quorumNumerator) || !fraction(input.quorumDenominator) ||
      BigInt(input.quorumNumerator) > BigInt(input.quorumDenominator) ||
      !thresholds.has(input.thresholdKind) ||
      (input.thresholdKind === "fraction"
        ? !fraction(input.thresholdNumerator) ||
          !fraction(input.thresholdDenominator) ||
          BigInt(input.thresholdNumerator) > BigInt(input.thresholdDenominator)
        : input.thresholdNumerator !== null || input.thresholdDenominator !== null) ||
      !publications.has(input.publicationMode) ||
      !tiePolicies.has(input.tiePolicy) ||
      !revision(input.expectedRevision) ||
      !uuid(input.operationId) ||
      !input.idempotencyKey.startsWith("world.voting_rule.configure:") ||
      input.idempotencyKey !== "world.voting_rule.configure:" + input.operationId
  ) {
    throw new Error("Review the institution, rule, exact fractions and operation identity.");
  }
}

export function parseWorldVotingRuleReceipt(
  value: unknown,
  expected: { operationId: string; organizationId: string; key: string },
): WorldVotingRuleReceipt {
  const receipt = object(value);
  const result = object(receipt?.result);
  if (!receipt || receipt.status !== "succeeded" ||
      receipt.operationId !== expected.operationId ||
      !result || result.ok !== true ||
      result.operationId !== expected.operationId ||
      result.organizationId !== expected.organizationId ||
      result.ruleKey !== expected.key ||
      !uuid(result.ruleId) ||
      !revision(result.revision) || (result.revision as number) < 1) {
    throw new Error("The authoritative voting-rule receipt could not be verified.");
  }
  return {
    ruleId: result.ruleId,
    revision: result.revision as number,
    operationId: expected.operationId,
  };
}

export async function votingRulesRolloutEnabled(): Promise<boolean> {
  const { data, error } = await client.rpc("studio2_feature_enabled", {
    p_key: "terra_world_voting_rules",
    p_edition_id: null,
  });
  if (error) throw new Error("Voting rule rollout could not be verified.");
  return data === true;
}

export async function getWorldManagedInstitutions(): Promise<WorldManagedInstitution[]> {
  const { data, error } = await client.rpc("world_managed_voting_organizations_v1");
  if (error) throw error;
  return parseWorldManagedInstitutions(data);
}

export async function getWorldVotingRules(organizationId: string): Promise<WorldVotingRule[]> {
  if (!uuid(organizationId)) throw new Error("Select a permitted institution.");
  const { data, error } = await client.rpc("world_voting_rules_manage_v1", {
    p_organization_id: organizationId,
  });
  if (error) throw error;
  return parseWorldVotingRules(data, organizationId);
}

export async function configureWorldVotingRule(input: WorldVotingRuleInput): Promise<WorldVotingRuleReceipt> {
  validateVotingRuleInput(input);
  const { data, error } = await client.rpc("world_configure_voting_rule_v1", {
    p_organization_id: input.organizationId,
    p_key: input.key,
    p_label: input.label.trim(),
    p_ballot_type: input.ballotType,
    p_secrecy: secrecyFor[input.ballotType],
    p_quorum_numerator: input.quorumNumerator,
    p_quorum_denominator: input.quorumDenominator,
    p_threshold_kind: input.thresholdKind,
    p_threshold_numerator: input.thresholdNumerator,
    p_threshold_denominator: input.thresholdDenominator,
    p_denominator_policy: "all_cast_including_abstentions",
    p_abstention_allowed: true,
    p_ballot_change_policy: "locked_after_cast",
    p_publication_mode: input.publicationMode,
    p_tie_policy: input.tiePolicy,
    p_expected_revision: input.expectedRevision,
    p_operation_id: input.operationId,
    p_idempotency_key: input.idempotencyKey,
  });
  if (error) throw error;
  return parseWorldVotingRuleReceipt(data, {
    organizationId: input.organizationId, key: input.key,
    operationId: input.operationId,
  });
}
