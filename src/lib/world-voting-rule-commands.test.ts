import { describe, expect, it } from "vitest";
import {
  parseWorldManagedInstitutions,
  parseWorldVotingRules,
  parseWorldVotingRuleReceipt,
  validateVotingRuleInput,
  type WorldVotingRuleInput,
} from "./world-voting-rule-commands";

const org = "00000000-0000-4000-8000-000000000001";
const rule = "00000000-0000-4000-8000-000000000002";
const op = "00000000-0000-4000-8000-000000000003";
const policy = {
  id: rule,
  key: "legislative",
  label: "Legislative two-thirds",
  ballotType: "recorded_roll_call",
  secrecy: "public",
  quorumNumerator: "1",
  quorumDenominator: "2",
  thresholdKind: "fraction",
  thresholdNumerator: "2",
  thresholdDenominator: "3",
  denominatorPolicy: "all_cast_including_abstentions",
  abstentionAllowed: true,
  ballotChangePolicy: "locked_after_cast",
  publicationMode: "after_certification",
  tiePolicy: "no_passage",
  revision: "2",
};
const input: WorldVotingRuleInput = {
  organizationId: org,
  key: policy.key,
  label: policy.label,
  ballotType: "recorded_roll_call",
  quorumNumerator: policy.quorumNumerator,
  quorumDenominator: policy.quorumDenominator,
  thresholdKind: "fraction",
  thresholdNumerator: policy.thresholdNumerator,
  thresholdDenominator: policy.thresholdDenominator,
  publicationMode: "after_certification",
  tiePolicy: "no_passage",
  expectedRevision: 2,
  operationId: op,
  idempotencyKey: "world.voting_rule.configure:" + op,
};

describe("TG8 voting-rule strict client transport", () => {
  it("accepts only bound, unique and current managed institution identifiers", () => {
    expect(parseWorldManagedInstitutions([
      { id: org, slug: "guard", name: "GUARD" },
    ])).toEqual([{ id: org, slug: "guard", name: "GUARD" }]);
    expect(() => parseWorldManagedInstitutions(null)).toThrow();
    expect(() => parseWorldManagedInstitutions([
      { id: org, slug: "guard", name: "GUARD" },
      { id: org, slug: "unity", name: "UNITY" },
    ])).toThrow();
    expect(() => parseWorldManagedInstitutions([
      { id: "invented", slug: "guard", name: "GUARD" },
    ])).toThrow();
    expect(() => parseWorldManagedInstitutions(
      Array(31).fill({ id: org, slug: "guard", name: "GUARD" }),
    )).toThrow();
  });

  it("requires exact integer strings for quorum, thresholds and active versions", () => {
    expect(parseWorldVotingRules({
      organizationId: org, rules: [policy],
    }, org)[0]).toMatchObject({
      id: rule, quorumNumerator: "1", quorumDenominator: "2",
      thresholdNumerator: "2", thresholdDenominator: "3", revision: 2,
    });
    expect(() => parseWorldVotingRules({
      organizationId: "invented", rules: [policy],
    }, org)).toThrow();
    expect(() => parseWorldVotingRules({
      organizationId: org, rules: [{ ...policy, quorumNumerator: "0" }],
    }, org)).toThrow();
    expect(() => parseWorldVotingRules({
      organizationId: org, rules: [{ ...policy, thresholdDenominator: "1" }],
    }, org)).toThrow();
    expect(() => parseWorldVotingRules({
      organizationId: org, rules: [{ ...policy, thresholdNumerator: "2.01" }],
    }, org)).toThrow();
    expect(() => parseWorldVotingRules({
      organizationId: org, rules: [{ ...policy, quorumNumerator: "9223372036854775808" }],
    }, org)).toThrow();
    expect(() => parseWorldVotingRules({
      organizationId: org, rules: [{ ...policy, ballotType: "secret_election", secrecy: "secret" }],
    }, org)).toThrow();
    expect(() => parseWorldVotingRules({
      organizationId: org, rules: [{ ...policy, revision: "9007199254740992" }],
    }, org)).toThrow();
    expect(() => parseWorldVotingRules({
      organizationId: org, rules: [{ ...policy, abstentionAllowed: false }],
    }, org)).toThrow();
    expect(() => parseWorldVotingRules({
      organizationId: org, rules: [{ ...policy, denominatorPolicy: "present_and_voting" }],
    }, org)).toThrow();
  });

  it("prevents client-authored unsupported or rounded legislative configurations", () => {
    expect(() => validateVotingRuleInput(input)).not.toThrow();
    expect(() => validateVotingRuleInput({
      ...input, quorumNumerator: "1", quorumDenominator: "0",
    })).toThrow();
    expect(() => validateVotingRuleInput({
      ...input, thresholdNumerator: "4", thresholdDenominator: "3",
    })).toThrow();
    expect(() => validateVotingRuleInput({
      ...input, thresholdNumerator: "67", thresholdDenominator: "100",
    })).not.toThrow(); // exact 67/100 is valid, but it is NOT two-thirds.
    expect(() => validateVotingRuleInput({
      ...input, thresholdNumerator: "66.7",
    })).toThrow();
    expect(() => validateVotingRuleInput({
      ...input, thresholdNumerator: "9223372036854775808",
    })).toThrow();
    expect(() => validateVotingRuleInput({
      ...input, expectedRevision: Number.MAX_SAFE_INTEGER + 1,
    })).toThrow();
    expect(() => validateVotingRuleInput({
      ...input, idempotencyKey: "other-operation",
    })).toThrow();
    expect(() => validateVotingRuleInput({
      ...input, thresholdKind: "simple_majority",
      thresholdNumerator: "2", thresholdDenominator: "3",
    })).toThrow();
    expect(() => validateVotingRuleInput({
      ...input, thresholdKind: "simple_majority",
      thresholdNumerator: null, thresholdDenominator: null,
    })).not.toThrow();
  });

  it("will not treat an unverified, mismatched or incomplete receipt as a committed rule", () => {
    const receipt = {
      status: "succeeded", operationId: op,
      result: {
        ok: true, ruleId: rule, revision: 3,
        ruleKey: "legislative", organizationId: org, operationId: op,
      },
    };
    const expected = { operationId: op, organizationId: org, key: "legislative" };
    expect(parseWorldVotingRuleReceipt(receipt, expected)).toEqual({
      ruleId: rule, revision: 3, operationId: op,
    });
    expect(() => parseWorldVotingRuleReceipt({
      ...receipt, status: "processing",
    }, expected)).toThrow();
    expect(() => parseWorldVotingRuleReceipt({
      ...receipt, result: { ...receipt.result, ruleKey: "unrelated" },
    }, expected)).toThrow();
    expect(() => parseWorldVotingRuleReceipt({
      ...receipt, operationId: org,
    }, expected)).toThrow();
    expect(() => parseWorldVotingRuleReceipt({
      ...receipt, result: { ...receipt.result, ruleId: "invented" },
    }, expected)).toThrow();
    expect(() => parseWorldVotingRuleReceipt(null, expected)).toThrow();
  });
});
