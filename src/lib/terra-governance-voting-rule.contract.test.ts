import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const source = read("supabase/migrations/20261104170000_v3_tg8_voting_rule_configuration.sql");
const rehearsal = read("scripts/rehearse-v3-world-voting-rules.sql");
const runner = read("scripts/rehearse-v3-world-voting-rules.sh");
const tg2 = read("supabase/migrations/20261102171500_v3_tg2_world_institution_core.sql");

const between = (start: string, end: string): string => {
  const i = source.indexOf(start);
  const j = source.indexOf(end, i + start.length);
  if (i < 0 || j < 0) throw new Error("Missing TG8 policy contract: " + start);
  return source.slice(i, j);
};
const configure = between(
  "create or replace function public.world_configure_voting_rule_v1",
  "create or replace function private.world_voting_rule_snapshot_v1",
);
const snapshot = between(
  "create or replace function private.world_voting_rule_snapshot_v1",
  "create or replace function public.world_public_voting_rule_v1",
);
const published = between(
  "create or replace function public.world_public_voting_rule_v1",
  "create or replace function public.world_managed_voting_organizations_v1",
);
const managedOrgs = between(
  "create or replace function public.world_managed_voting_organizations_v1",
  "create or replace function public.world_voting_rules_manage_v1",
);
const managedRules = between(
  "create or replace function public.world_voting_rules_manage_v1",
  "revoke all on function public.world_managed_voting_organizations_v1",
);

describe("TG8 versioned institutional voting rule authority", () => {
  it("depends on existing World organizations and their settings capabilities", () => {
    expect(tg2).toContain("world.organization.settings.manage");
    expect(source).toContain("create table public.world_voting_rules");
    expect(source).toContain("references public.world_organizations(id)");
    expect(source).toContain("unique (organization_id,key,revision)");
    expect(source).toContain("world_voting_rules_one_active_version_uidx");
    expect(source).toContain("where active");
    expect(source).toContain("'forward_fix_only'");
    expect(source).not.toMatch(/\b(create table|alter table)\s+public\.(country_accounts|world_ballots|world_voting_results)\b/i);
  });

  it("validates the complete canonical metadata and exact rational fractions", () => {
    const table = between("create table public.world_voting_rules", "create unique index world_voting_rules_one_active_version_uidx");
    for (const col of [
      "organization_id", "key text", "label text", "ballot_type text",
      "secrecy text", "quorum_numerator bigint", "quorum_denominator bigint",
      "threshold_kind text", "threshold_numerator bigint",
      "threshold_denominator bigint", "denominator_policy text",
      "abstention_allowed boolean", "ballot_change_policy text",
      "publication_mode text", "tie_policy text", "active boolean",
      "revision bigint",
    ]) expect(table).toContain(col);
    expect(table).toContain("quorum_numerator > 0");
    expect(table).toContain("quorum_numerator <= quorum_denominator");
    expect(table).toContain("threshold_numerator <= threshold_denominator");
    expect(table).toContain("threshold_kind='fraction'");
    expect(table).toContain("threshold_numerator is null");
    expect(table).toContain("denominator_policy='all_cast_including_abstentions'");
    expect(table).toContain("ballot_change_policy='locked_after_cast'");
    expect(table).toContain("abstention_allowed");
    expect(table).not.toContain("67%");
  });

  it("locks history down against direct role reads and in-place historical edits", () => {
    expect(source).toContain("alter table public.world_voting_rules enable row level security");
    expect(source).toContain("revoke all on public.world_voting_rules from public,anon,authenticated,service_role");
    expect(source).not.toContain("grant all on public.world_voting_rules to service_role");
    expect(source).not.toMatch(/grant\\s+(all|insert|update|delete|select)\\s+on\\s+public\\.world_voting_rules\\s+to\\s+service_role/i);
    expect(rehearsal).toContain("TG8_SERVICE_ROLE_DIRECT_RULE_SELECT_ALLOWED");
    expect(rehearsal).toContain("TG8_SERVICE_ROLE_DIRECT_RULE_MUTATION_ALLOWED");
    expect(source).toContain("create trigger world_voting_rules_history_guard");
    const guard = between("create or replace function private.world_voting_rule_history_guard_v1", "create trigger world_voting_rules_history_guard");
    expect(guard).toContain("if tg_op='DELETE'");
    expect(guard).toContain("old.active is not true or new.active is not false");
    expect(guard).toContain("to_jsonb(new) - 'active' - 'superseded_at'");
    expect(guard).toContain("VOTING_RULE_HISTORY_IMMUTABLE");
    expect(source).not.toMatch(/grant\s+(all|insert|update|delete|select)\s+on\s+public\.world_voting_rules\s+to\s+(anon|authenticated)/i);
  });

  it("uses scoped authorization, R2 receipts, version CAS and immutable append-only replacement", () => {
    expect(configure).toContain("auth.uid() is null");
    expect(configure).toContain("'world.organization.settings.manage'");
    expect(configure).toContain("where id=p_organization_id for update");
    expect(configure).toContain("private.studio2_claim_operation");
    expect(configure).toContain("'world.voting_rule.configure'");
    const claim = configure.indexOf("private.studio2_claim_operation");
    const replay = configure.indexOf("if coalesce((v_claim->>'replayed')::boolean,false)");
    const cas = configure.indexOf("v_prior.revision,0) is distinct from p_expected_revision");
    expect(claim).toBeGreaterThan(0);
    expect(replay).toBeGreaterThan(claim);
    expect(cas).toBeGreaterThan(replay);
    expect(configure).toContain("where organization_id=p_organization_id and key=v_key and active");
    expect(configure).toContain("set active=false,superseded_at=now()");
    expect(configure).toContain("insert into public.world_voting_rules");
    expect(configure).toContain("'world.voting_rule.revised'");
    expect(configure).toContain("private.studio2_complete_operation");
    expect(configure).toContain("public.studio2_reconcile_operation");
  });

  it("refuses unsupported secret-election, mutable-ballot and abstention-exclusion policies", () => {
    expect(configure).toContain("p_ballot_type not in ('recorded_roll_call','restricted_roll_call','aggregate_only')");
    expect(configure).toContain("p_denominator_policy is distinct from 'all_cast_including_abstentions'");
    expect(configure).toContain("p_abstention_allowed is distinct from true");
    expect(configure).toContain("p_ballot_change_policy is distinct from 'locked_after_cast'");
    expect(configure).toContain("p_threshold_kind not in ('simple_majority','fraction','unanimity')");
    expect(configure).toContain("p_threshold_numerator <= p_threshold_denominator");
    expect(configure).toContain("UNSUPPORTED_VOTING_RULE");
    expect(configure).not.toContain("world_ballots");
    expect(configure).not.toContain("world_vote_eligibility");
  });

  it("builds server-only immutable snapshots, never from browser-supplied JSON", () => {
    expect(snapshot).toContain("security definer");
    expect(snapshot).toContain("rule_row.id=p_rule_id and rule_row.active");
    expect(snapshot).toContain("'ruleRevision',rule_row.revision");
    expect(snapshot).toContain("'quorumNumerator',rule_row.quorum_numerator");
    expect(snapshot).toContain("'quorumDenominator',rule_row.quorum_denominator");
    expect(snapshot).toContain("'thresholdKind',rule_row.threshold_kind");
    expect(snapshot).toContain("'thresholdNumerator',rule_row.threshold_numerator");
    expect(snapshot).toContain("'denominatorPolicy',rule_row.denominator_policy");
    expect(snapshot).toContain("'abstentionAllowed',rule_row.abstention_allowed");
    expect(snapshot).toContain("'snapshottedAt',now()");
    expect(source).toContain("revoke all on function private.world_voting_rule_snapshot_v1(uuid)");
    expect(source).not.toMatch(/grant execute on function private\.world_voting_rule_snapshot_v1\(uuid\)/i);
  });

  it("returns exact text fractions for public active institutions while hiding private organizations", () => {
    expect(published).toContain("security definer");
    expect(published).toContain("public.studio2_feature_enabled('terra_world_voting_rules',null)");
    expect(published).toContain("org.public_visibility='public'");
    expect(published).toContain("org.status='active'");
    expect(published).toContain("rule_row.active");
    expect(published).toContain("rule_row.quorum_numerator::text");
    expect(published).toContain("rule_row.quorum_denominator::text");
    expect(published).toContain("rule_row.threshold_numerator::text");
    expect(published).toContain("rule_row.threshold_denominator::text");
    expect(published).not.toContain("auth.users");
    expect(published).not.toContain("\'ballotId\'");
    expect(published).not.toContain("\'voteId\'");
    expect(published).not.toContain("\'countryId\'");
    expect(published).not.toContain("\'userId\'");
    expect(source).toContain("grant execute on function public.world_public_voting_rule_v1(text,text)");
  });

  it("keeps the feature disabled by default and extends the existing rollout key predicate safely", () => {
    expect(source).toContain("pg_catalog.pg_get_expr(c.conbin,c.conrelid)");
    expect(source).toContain("pg_catalog.strpos(v_predicate,'terra_world_voting_rules')=0");
    expect(source).toContain("TG8_VOTING_RULE_ROLLOUT_CONSTRAINT_MISSING");
    expect(source).toContain("on conflict (key) do nothing");
    expect(source).toContain("('terra_world_voting_rules',false,false");
  });

  it("allows a private institution editor to read only the institutions they actually manage", () => {
    expect(managedOrgs).toContain("auth.uid() is not null");
    expect(managedOrgs).toContain("'world.organization.settings.manage'");
    expect(managedOrgs).toContain("o.id,null,null,null,null");
    expect(managedOrgs).toContain("limit 30");
    expect(managedOrgs).not.toContain("where o.public_visibility='public'");
    expect(managedOrgs).not.toMatch(/auth.users|user_id|proxy_user_id/);
    expect(managedRules).toContain("auth.uid() is null");
    expect(managedRules).toContain("'world.organization.settings.manage'");
    expect(managedRules).toContain("rule_row.organization_id=p_organization_id");
    expect(managedRules).toContain("rule_row.active");
    expect(managedRules).toContain("limit 30");
    expect(managedRules).toContain("r.quorum_numerator::text");
    expect(managedRules).toContain("r.threshold_denominator::text");
    expect(managedRules).not.toContain("auth.users");
    expect(source).toContain("revoke all on function public.world_managed_voting_organizations_v1()");
    expect(source).toContain("revoke all on function public.world_voting_rules_manage_v1(uuid)");
    expect(source).not.toMatch(/grant execute on function public\.world_voting_rules_manage_v1\(uuid\)\s+to\s+anon/);
  });

  it("rehearses authorization, replay, immutability, exact thresholds and rollback in local Postgres", () => {
    for (const marker of [
      "TG8_VOTING_RULE_ROLLOUT_DEFAULT_NOT_DISABLED",
      "TG8_UNAUTHORIZED_MANAGED_INSTITUTION_EXPOSURE",
      "TG8_UNAUTHORIZED_RULE_EDIT_PROJECTION_EXPOSURE",
      "TG8_AUTHORIZED_MANAGER_INSTITUTION_MISSING",
      "TG8_INITIAL_MANAGER_RULE_LIST_INCORRECT",
      "TG8_MANAGER_RULE_PROJECTION_NOT_EXACT",
      "TG8_ANON_RULE_CONFIGURATION_ALLOWED",
      "TG8_UNAUTHORIZED_RULE_CONFIGURATION_ALLOWED",
      "TG8_AUTHENTICATED_RAW_RULE_SELECT_ALLOWED",
      "TG8_STALE_RULE_REVISION_ALLOWED",
      "TG8_SILENT_ABSTENTION_EXCLUSION_ALLOWED",
      "TG8_INCOMPLETE_THRESHOLD_ALLOWED",
      "TG8_UNIMPLEMENTED_SECRET_ELECTION_CONFIG_ALLOWED",
      "TG8_RULE_RECEIPT_REPLAY_UNSTABLE",
      "TG8_VOTING_RULE_HISTORY_NOT_PRESERVED",
      "TG8_IMMUTABLE_RULE_HISTORY_UPDATE_ALLOWED",
      "TG8_IMMUTABLE_RULE_HISTORY_DELETE_ALLOWED",
      "TG8_SUPERSEDED_RULE_SNAPSHOT_ALLOWED",
      "TG8_PRIVATE_ORGANIZATION_RULE_PUBLIC_LEAK",
      "TG8_PUBLIC_RULE_VISIBLE_BEFORE_ROLLOUT",
      "TG8_VOTING_RULE_ROLLOUT_FLAG_NOT_REGISTERED",
      "TG8_PUBLIC_RULE_EXACT_FRACTION_PROJECTION_LOST",
      "TG8_PRIVATE_SNAPSHOT_EXECUTABLE_BY_ANON",
      "TG8_VOTING_RULE_REHEARSAL_NOT_ROLLED_BACK",
    ]) expect(rehearsal).toContain(marker);
    expect(rehearsal).toContain("set local role anon");
    expect(rehearsal).toContain("set local role authenticated");
    expect(rehearsal).toContain("\nrollback;");
    expect(runner).toContain("supabase status -o env");
    expect(runner).toContain("Refusing hosted Supabase API");
    expect(runner).toContain("Refusing hosted Supabase database");
  });
});
