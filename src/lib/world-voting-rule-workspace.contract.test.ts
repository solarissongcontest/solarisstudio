import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const editor = read("src/components/world/WorldVotingRuleEditor.tsx");
const route = read("src/routes/world/voting/rules.tsx");
const transport = read("src/lib/world-voting-rule-commands.ts");
const migration = read("supabase/migrations/20261104170000_v3_tg8_voting_rule_configuration.sql");

describe("TG8 voting-rule editor protection", () => {
  it("fails closed on maintenance and a separately disabled TG8 rollout", () => {
    expect(route).toContain("GLOBAL_MAINTENANCE_MODE");
    expect(route).toContain("throw notFound()");
    expect(route).toContain("noindex,nofollow");
    expect(editor).toContain("queryFn: votingRulesRolloutEnabled");
    expect(editor).toContain("feature.data !== true");
    expect(transport).toContain('p_key: "terra_world_voting_rules"');
    expect(migration).toContain("('terra_world_voting_rules',false,false");
    expect(editor).toContain("Your current institution settings authority");
  });

  it("loads only server-authorized institutions and their scoped rule revisions", () => {
    expect(transport).toContain('client.rpc("world_managed_voting_organizations_v1")');
    expect(transport).toContain('client.rpc("world_voting_rules_manage_v1"');
    expect(editor).toContain("getWorldManagedInstitutions");
    expect(editor).toContain("getWorldVotingRules(organization!.id)");
    expect(editor).toContain("rules.data?.find((rule) => rule.key === normalizedKey)?.revision ?? 0");
    expect(editor).not.toContain('from("world_voting_rules")');
    expect(editor).not.toContain('from("studio2_capability_grants")');
  });

  it("reviews a full exact-fraction, abstention-safe configuration before committing", () => {
    expect(editor).toContain("setPrepared({");
    expect(editor).toContain("labelForThreshold[thresholdKind]");
    expect(editor).toContain("All cast abstentions count");
    expect(editor).toContain("Ballots are locked after casting");
    expect(editor).toContain("Confirm recorded rule revision");
    expect(transport).toContain('p_denominator_policy: "all_cast_including_abstentions"');
    expect(transport).toContain("p_abstention_allowed: true");
    expect(transport).toContain('p_ballot_change_policy: "locked_after_cast"');
    expect(transport).not.toContain("world_ballots");
    expect(transport).not.toContain("world_vote_eligibility");
  });

  it("retains the exact operation ID after transport uncertainty and prevents racing edits", () => {
    expect(editor).toContain("retry.current = action");
    expect(editor).toContain("if (rejected(cause))");
    expect(editor).toContain("retry.current = null");
    expect(editor).toContain("disabled={busy || Boolean(prepared) || Boolean(retry.current)}");
    expect(editor).toContain("if (retry.current || prepared || busy) return");
    expect(editor).toContain("onClick={() => void execute(retry.current!)}");
    expect(editor).toContain("world.voting_rule.configure:");
    expect(editor).toContain('queryKey: ["world", "voting-rules"]');
    expect(transport).toContain("parseWorldVotingRuleReceipt(data");
    expect(transport).toContain('envelope.status !== "succeeded"').toBeUndefined;
    expect(transport).toContain('receipt.status !== "succeeded"');
    expect(transport).toContain("receipt.operationId !== expected.operationId");
  });
});
