import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

const nav = source('src/components/admin/admin-navigation.ts');
const hodRoute = source('src/routes/_authenticated/country-hub/hod.tsx');
const countriesRoute = source('src/routes/_authenticated/admin/countries.tsx');
const countryDetail = source('src/routes/_authenticated/admin/countries.$countryId.tsx');
const hodWorkspace = source('src/lib/studio2-hod-workspace.ts');
const hodModel = source('src/lib/hod-workspace-model.ts');
const cockpit = source('src/lib/studio2-country-cockpit.ts');
const actionCenter = source('src/lib/studio2-action-center.ts');
const actionCenterRoute = source('src/routes/_authenticated/admin/action-center.tsx');
const hodMigration = source('supabase/migrations/20260911201500_studio2_hod_operational_context.sql');
const cockpitMigration = source('supabase/migrations/20260911202000_studio2_country_cockpit_rpc.sql');

describe('Studio 2 Phase 6 country operations integration', () => {
  it('makes the country cockpit the organizer Delegations entrypoint', () => {
    expect(nav).toContain('"Delegations",');
    expect(nav).toContain('"/admin/countries"');
    expect(countriesRoute).toContain("createFileRoute('/_authenticated/admin/countries')");
    expect(countryDetail).toContain("createFileRoute('/_authenticated/admin/countries/$countryId')");
  });

  it('uses one country readiness calculator across HOD, organizer cockpit and Action Center', () => {
    expect(hodWorkspace).toContain('getCountryOperationalReadiness({');
    expect(hodModel).toContain('operationalReadiness: CountryOperationalReadiness');
    expect(hodModel).toContain('readiness: input.operationalReadiness.score');
    expect(cockpit).toContain('buildStudio2HodWorkspaceSnapshot(mapStudio2HodContext(row))');
    expect(actionCenterRoute).toContain('loadStudio2CountryCockpit(resolvedEditionId)');
    expect(actionCenterRoute).toContain('readiness: row.operationalReadiness');
    expect(actionCenter).toContain("source: 'country'");
    expect(actionCenter).toContain('`/admin/countries/${country.countryId}`');
  });

  it('keeps organizer HOD inspection explicitly read-only', () => {
    expect(hodRoute).toContain('Organizer inspection mode');
    expect(hodRoute).toContain('delegation-side acknowledgement mutations are disabled.');
    expect(hodRoute).toContain('!organizerInspection &&');
    expect(hodRoute).toContain('organizerInspection ?');
  });

  it('shows the Phase 6 HOD operational data without creating a duplicate source of truth', () => {
    expect(hodRoute).toContain('Operational readiness');
    expect(hodRoute).toContain('Deadlines & alerts');
    expect(hodRoute).toContain('Submission review history');
    expect(hodWorkspace).toContain('deadlines: Studio2HodDeadline[]');
    expect(hodWorkspace).toContain('reviewHistory: Studio2HodReviewHistoryItem[]');
    expect(hodWorkspace).toContain('unresolvedOrganizerIssues: number');
  });

  it('exposes the country detail tabs required by the master plan and deep-links specialist systems', () => {
    for (const tab of [
      'overview',
      'entry',
      'eligibility',
      'assets',
      'communications',
      'voting',
      'workflows',
      'incidents',
      'audit',
    ]) {
      expect(countryDetail).toContain(`'${tab}'`);
    }
    expect(countryDetail).toContain('href="/admin/communications"');
    expect(countryDetail).toContain('href="/admin/workflows"');
    expect(countryDetail).toContain('href="/admin/incidents"');
    expect(countryDetail).toContain('href="/admin/system"');
  });

  it('builds HOD operational context from existing authoritative tables', () => {
    expect(hodMigration).toContain('public.admin_deadlines');
    expect(hodMigration).toContain('public.submission_review_history');
    expect(hodMigration).toContain('join public.submissions');
    expect(hodMigration).toContain('public.studio2_incidents');
    expect(hodMigration).toContain("i.category in ('delegation', 'publication')");
    expect(hodMigration).toContain("n.status = 'published'");
    expect(hodMigration).not.toContain('create table');
  });

  it('batches organizer country loading through the existing HOD context instead of cloning readiness SQL', () => {
    expect(cockpitMigration).toContain('public.studio2_hod_context(p_edition_id, pc.country_id)');
    expect(cockpitMigration).toContain("private.studio2_user_has_capability(v_actor, 'confirmation.manage'");
    expect(cockpitMigration).toContain("public.has_role(v_actor, 'organizer'::public.app_role)");
    expect(cockpitMigration).not.toContain('create table');
  });
});
