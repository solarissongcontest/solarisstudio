import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

const route = source('src/routes/_authenticated/admin/eligibility.tsx');
const model = source('src/lib/studio2-eligibility.ts');
const readiness = source('src/lib/country-operational-readiness.ts');
const cockpit = source('src/lib/studio2-country-cockpit.ts');
const actionCenterRoute = source('src/routes/_authenticated/admin/action-center.tsx');
const nav = source('src/components/admin/AdminNav.tsx');
const migration = source('supabase/migrations/20260911202500_studio2_eligibility_overrides.sql');

describe('Studio 2 Phase 7 eligibility integration', () => {
  it('exposes the master-plan organizer eligibility route and exact status vocabulary', () => {
    expect(route).toContain("createFileRoute('/_authenticated/admin/eligibility')");
    expect(nav).toContain('label: "Eligibility"');
    expect(nav).toContain('to: "/admin/eligibility"');
    for (const status of ['eligible', 'incomplete', 'warning', 'blocked', 'overridden']) {
      expect(model).toContain(`'${status}'`);
    }
  });

  it('reuses the canonical country cockpit and readiness engines instead of reimplementing rules in the route', () => {
    expect(route).toContain('loadStudio2CountryCockpit(resolvedEditionId)');
    expect(route).toContain('buildStudio2EligibilityMatrix');
    expect(model).toContain('row.operationalReadiness.signals');
    expect(model).toContain('row.eligibility.checks');
    expect(cockpit).toContain('buildStudio2HodWorkspaceSnapshot');
    expect(readiness).toContain('getCountryOperationalReadiness');
    expect(route).not.toContain('evaluateEntryEligibility(');
    expect(route).not.toContain('getCountryOperationalReadiness(');
  });

  it('shows precise issue evidence and keeps factual state visible after an override', () => {
    expect(model).toContain('factualStatus');
    expect(model).toContain('effectiveStatus');
    expect(model).toContain('Required: ${row.context.juryMembersRequired}');
    expect(model).toContain('Assigned: ${row.context.juryMembersAssigned}');
    expect(route).toContain('Factual');
    expect(route).toContain('The failed factual check remains recorded and visible.');
  });

  it('uses narrow server RPCs for mutations rather than direct browser table writes', () => {
    expect(model).toContain("'studio2_create_eligibility_override'");
    expect(model).toContain("'studio2_revoke_eligibility_override'");
    expect(model).toContain("'studio2_list_eligibility_overrides'");
    expect(route).not.toContain('.insert(');
    expect(route).not.toContain('.update(');
    expect(route).not.toContain('.delete(');
  });

  it('feeds effective override-aware readiness to Action Center instead of contradictory factual alerts', () => {
    expect(actionCenterRoute).toContain('listStudio2EligibilityOverrides(resolvedEditionId)');
    expect(actionCenterRoute).toContain('applyStudio2EligibilityOverridesToReadiness');
    expect(model).toContain('An organizer eligibility override is active.');
  });

  it('requires reason, actor, timestamp, affected rule and optional expiry in persisted overrides', () => {
    for (const field of ['affected_rule', 'reason', 'created_by', 'created_at', 'expires_at']) {
      expect(migration).toContain(field);
    }
    expect(migration).toContain("private.studio2_user_has_capability(p_user_id, 'entry.approve'");
    expect(migration).toContain("public.has_role(p_user_id, 'organizer'::public.app_role)");
    expect(migration).toContain('pg_advisory_xact_lock');
  });

  it('audits create and revoke through the canonical Studio 2 event stream', () => {
    expect(migration).toContain("'eligibility.override_created'");
    expect(migration).toContain("'eligibility.override_revoked'");
    expect(migration).toContain('insert into public.studio2_contest_events');
    expect(migration).toContain("'eligibility_override'");
  });
});
