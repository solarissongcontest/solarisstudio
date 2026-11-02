import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { SOLARIS_CAPABILITIES } from "./permissions-v2";
import {
  TERRA_GOVERNANCE_DOMAIN_REGISTRY,
  TERRA_GOVERNANCE_FOUNDATION_EVENT_TYPES,
  TERRA_GOVERNANCE_FOUNDATION_MIGRATIONS,
} from "./terra-governance-domain-registry";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const migration = (name: string) => source(`supabase/migrations/${name}`);

const [
  tg1Name,
  tg2CoreName,
  tg2AccessName,
  tg2OfficeAlignmentName,
  tg2OfficeDependentsName,
] = TERRA_GOVERNANCE_FOUNDATION_MIGRATIONS;
const tg1 = migration(tg1Name);
const tg2Core = migration(tg2CoreName);
const tg2Access = migration(tg2AccessName);
const tg2OfficeAlignment = migration(tg2OfficeAlignmentName);
const tg2OfficeDependents = migration(tg2OfficeDependentsName);

describe("Terra Solaris Governance TG1/TG2 foundation", () => {
  it("preserves country_accounts as current authority and stores history around it", () => {
    expect(tg1).toContain("public.country_accounts remains the sole CURRENT controller authority");
    expect(tg1).toContain("create table if not exists public.world_country_control_terms");
    expect(tg1).not.toMatch(/create table(?: if not exists)? public\.country_accounts/i);
    expect(tg1).not.toMatch(/update public\.country_accounts/i);
    expect(tg1).toContain("world_country_control_terms_one_open_per_country");
    expect(tg1).toContain("where ended_at is null");
  });

  it("keeps historical political identity after login deletion", () => {
    expect(tg1).toContain("person_id uuid not null references public.delegation_people(id) on delete restrict");
    expect(tg1).toContain("user_id uuid null references auth.users(id) on delete set null");
    expect(tg2Core).toContain("holder_person_id uuid not null references public.delegation_people(id) on delete restrict");
    expect(tg2Core).toContain("holder_user_id uuid references auth.users(id) on delete set null");
  });

  it("backfills only already-provable controller/person links", () => {
    expect(tg1).toContain("claim.status = 'mine'");
    expect(tg1).toContain("private.world_resolve_controller_person");
    expect(tg1).toContain("is not null");
    expect(tg1).not.toMatch(/insert into public\.delegation_people/i);
  });

  it("models organizations generically and seeds GUARD/UNITY as data", () => {
    expect(tg2Core).toContain("create table public.world_organizations");
    expect(tg2Core).toContain("create table public.world_organization_organs");
    expect(tg2Core).toContain("'Global Union for Allied Resilience and Defence'");
    expect(tg2Core).not.toContain("Global Union for Allied Resilience and Defense");
    expect(tg2Core).toContain("'General Assembly of GUARD'");
    expect(tg2Core).toContain("'UNITY General Assembly'");
    expect(tg2Core).toContain("'UNITY Ethics Committee'");
    expect(tg2Core).not.toMatch(/create table public\.(guard|unity)_/i);
  });

  it("enforces one open membership and one current voting representative", () => {
    expect(tg2Core).toContain("world_organization_memberships_one_open_uidx");
    expect(tg2Core).toContain("on public.world_organization_memberships(organization_id, country_id)");
    expect(tg2Core).toContain("world_organization_representations_voting_rep_uidx");
    expect(tg2Core).toContain("where ends_at is null and role = 'representative' and voting_authority");
  });

  it("models office terms in editions without globally hardcoding every term to two", () => {
    expect(tg2Core).toContain("default_term_length_editions integer");
    expect(tg2Core).toContain("world_office_terms_one_active_uidx");
    expect(tg2Core).toContain("'guard','chairperson','Chairperson'");
    expect(tg2Core).toContain("'unity','secretary-general','Secretary-General'");
    expect(tg2Core).toMatch(/'guard','chairperson','Chairperson',[\s\S]*?'election',2,/);
    expect(tg2Core).toMatch(/'unity','secretary-general','Secretary-General',[\s\S]*?'election',2,/);
  });

  it("adopts canonical office-term timestamps/statuses without leaving stale dependents", () => {
    expect(tg2OfficeAlignment).toContain("rename column starts_at to started_at");
    expect(tg2OfficeAlignment).toContain("rename column ends_at to actual_end_at");
    expect(tg2OfficeAlignment).toContain("add column scheduled_end_at timestamptz");
    expect(tg2OfficeAlignment).toContain("'scheduled','active','ended','removed','resigned'");
    expect(tg2OfficeAlignment).toContain("public.v3_register_migration_contract");

    expect(tg2OfficeDependents).toContain("create or replace function public.world_access_allowed");
    expect(tg2OfficeDependents).toContain("create or replace function public.world_organization_projection_v1");
    expect(tg2OfficeDependents).toContain("term_row.actual_end_at is null");
    expect(tg2OfficeDependents).not.toContain("term_row.ends_at");
    expect(tg2OfficeDependents).not.toContain("term_row.starts_at");
    expect(tg2OfficeDependents).toContain("'startedAt', term_row.started_at");
    expect(tg2OfficeDependents).toContain("'scheduledEndAt', term_row.scheduled_end_at");
    expect(tg2OfficeDependents).toContain("'actualEndAt', term_row.actual_end_at");
    expect(tg2OfficeDependents).toContain("public.v3_register_migration_contract");
  });

  it("makes proxy effectiveness expire at server time even before materialized cleanup", () => {
    expect(tg2Core).toContain("create or replace function private.world_proxy_is_effective");
    expect(tg2Core).toContain("p_status = 'approved'");
    expect(tg2Core).toContain("p_valid_from <= p_at and p_at < p_valid_until");
    expect(tg2Core).toContain("constraint world_proxy_time_check check (valid_until > valid_from)");
  });

  it("extends Permission Engine V2 instead of inventing a second capability engine", () => {
    expect(tg2Core).toContain("references public.studio2_capability_grants(id) on delete cascade");
    expect(tg2Core).toContain("insert into public.studio2_capabilities");
    expect(tg2Core).not.toMatch(/create table public\.world_capabilit(?:y|ies)_grants/i);
    expect(tg2Access).toContain("from public.studio2_capability_grants grant_row");
    expect(tg2Access).toContain("join public.world_capability_grant_scopes scope_row");
    expect(tg2Access).toContain("grant_row.edition_id is null");
  });

  it("registers every TG2 capability in both TypeScript and the database catalogue", () => {
    const registryCapabilities = TERRA_GOVERNANCE_DOMAIN_REGISTRY.flatMap((domain) => domain.capabilities);
    for (const capability of new Set(registryCapabilities)) {
      expect(SOLARIS_CAPABILITIES).toContain(capability);
      expect(tg2Core).toContain(`'${capability}'`);
    }
  });

  it("protects world mutation tables with RLS and no browser DML grants", () => {
    for (const table of [
      "world_organizations",
      "world_organization_memberships",
      "world_organization_representations",
      "world_representation_proxies",
      "world_organization_offices",
      "world_office_terms",
      "world_capability_grant_scopes",
    ]) {
      expect(tg2Core).toContain(`alter table public.${table} enable row level security`);
    }
    expect(tg2Core).not.toMatch(/grant\s+(insert|update|delete|all)[\s\S]{0,160}\sto\s+(anon|authenticated)/i);
  });

  it("routes consequential TG1/TG2 commands through receipts, replay and domain events", () => {
    for (const commandSource of [tg1, tg2Access]) {
      expect(commandSource).toContain("private.studio2_claim_operation");
      expect(commandSource).toContain("public.studio2_reconcile_operation");
      expect(commandSource).toContain("private.studio2_complete_operation");
      expect(commandSource).toContain("private.v3_emit_domain_event");
    }
    for (const eventType of TERRA_GOVERNANCE_FOUNDATION_EVENT_TYPES) {
      expect(`${tg1}\n${tg2Access}`).toContain(`'${eventType}'`);
    }
  });

  it("keeps public projections free of auth user identifiers", () => {
    const countryProjection = tg1.slice(
      tg1.indexOf("create or replace function public.world_country_identity_v1"),
      tg1.indexOf("create or replace function public.world_bind_country_controller_person_v1"),
    );
    const organizationProjection = tg2OfficeDependents.slice(
      tg2OfficeDependents.indexOf("create or replace function public.world_organization_projection_v1"),
      tg2OfficeDependents.indexOf("revoke all on function public.world_organization_projection_v1"),
    );
    expect(countryProjection).not.toContain("user_id");
    expect(organizationProjection).not.toContain("user_id");
    expect(organizationProjection).not.toContain("proxy_user_id");
  });

  it("does not claim downstream voting, Court, chat or document workflows are complete", () => {
    const ids = TERRA_GOVERNANCE_DOMAIN_REGISTRY.map((domain) => domain.id);
    expect(ids).not.toContain("world-voting");
    expect(ids).not.toContain("world-court");
    expect(ids).not.toContain("world-chat");
    expect(ids).not.toContain("world-documents");
  });
});
