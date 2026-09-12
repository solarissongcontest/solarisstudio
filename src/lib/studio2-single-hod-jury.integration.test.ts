import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

const migration = source('supabase/migrations/20260912203000_studio2_single_hod_jury.sql');
const noticeHardening = source('supabase/migrations/20260912203100_studio2_single_hod_jury_notice_scope.sql');
const privilegeHardening = source('supabase/migrations/20260912203200_studio2_single_hod_jury_rpc_privileges.sql');
const guardCleanup = source('supabase/migrations/20260912203300_studio2_single_hod_jury_drop_roster_guard.sql');
const hodRoute = source('src/routes/_authenticated/country-hub/hod.tsx');
const countryRoute = source('src/routes/_authenticated/admin/countries.$countryId.tsx');
const workspaceClient = source('src/lib/studio2-hod-workspace.ts');
const workspaceModel = source('src/lib/hod-workspace-model.ts');
const readiness = source('src/lib/country-operational-readiness.ts');
const eligibility = source('src/lib/studio2-eligibility.ts');
const canonicalJury = source('src/integrations/jury-voting/jury-voting.server.ts');

const canonicalJurorResolver = migration.split(
  'create or replace function private.studio2_user_can_receive_notice_v2('
)[1] ?? '';

describe('Studio 2 single-HOD jury contract', () => {
  it('persists exactly one jury per country instead of a configurable roster size', () => {
    expect(migration).toContain('set jury_members_required = 1');
    expect(migration).toContain('check (jury_members_required = 1)');
    expect(migration).toContain('if p_required is distinct from 1 then');
    expect(migration).toContain('exactly one jury per country: the Head of Delegation');
    expect(migration).not.toContain('between 1 and 10');
    expect(workspaceClient).toContain('juryMembersRequired: 1');
    expect(workspaceClient).toContain("juryMembersAssigned: 0 | 1");
    expect(workspaceClient).toContain('Solaris requires exactly one HOD jury');
  });

  it('projects jury identity from canonical HOD history with jury-channel override semantics', () => {
    expect(migration).toContain("a.channel in ('jury', 'delegation')");
    expect(migration).toContain("case when a.channel = 'jury' then 0 else 1 end");
    expect(migration).toContain("'juryMembersRequired', 1");
    expect(migration).toContain("'juryMembersAssigned', v_assigned");
    expect(canonicalJury).toContain('canonical.hod.resolve(String(show.edition_id), countryId, "jury")');
  });

  it('routes juror communications through the same canonical HOD identity without broadening country scope', () => {
    expect(migration).toContain("p_audience <> 'jurors'");
    expect(canonicalJurorResolver).toContain('v_selected_person_id');
    expect(canonicalJurorResolver).toContain("p.identity_key = 'account:' || p_user_id::text");
    expect(canonicalJurorResolver).toContain("case when a.channel = 'jury' then 0 else 1 end");
    expect(canonicalJurorResolver).not.toContain('from public.studio2_jury_members jm');
    expect(noticeHardening).toContain('coalesce(cardinality(p_country_ids), 0) > 0');
    expect(noticeHardening).toContain('v_country_id = any(p_country_ids)');
  });

  it('retires delegation-side add/remove juror controls and obsolete roster writes', () => {
    expect(hodRoute).toContain('HOD assigned');
    expect(hodRoute).toContain('HOD missing');
    expect(hodRoute).toContain('Head of Delegation · sole jury');
    expect(hodRoute).not.toContain('assignStudio2JuryMember');
    expect(hodRoute).not.toContain('removeStudio2JuryMember');
    expect(hodRoute).not.toContain('Add juror');
    expect(hodRoute).not.toContain('Juror display name');
    expect(workspaceClient).not.toContain('assignStudio2JuryMember');
    expect(workspaceClient).not.toContain('removeStudio2JuryMember');
    expect(privilegeHardening).toContain('from public, anon, authenticated');
    expect(privilegeHardening).toContain('grant execute on function public.studio2_assign_jury_member');
    expect(privilegeHardening).toContain('grant execute on function public.studio2_remove_jury_member');
    expect(privilegeHardening).toContain('to service_role');
    expect(guardCleanup).toContain('drop trigger if exists studio2_delegation_settings_guard_requirement');
    expect(guardCleanup).toContain('drop function if exists private.studio2_guard_jury_requirement()');
  });

  it('models the only pre-ballot blocker as a missing HOD', () => {
    expect(workspaceModel).toContain("id: 'jury-hod'");
    expect(workspaceModel).toContain("label: 'Confirm HOD assignment'");
    expect(workspaceModel).toContain('The HOD is the country’s sole jury.');
    expect(workspaceModel).not.toContain('Complete jury assignment');
    expect(workspaceModel).not.toContain('jury members assigned');
  });

  it('removes multi-member roster language from current readiness and organizer surfaces', () => {
    expect(readiness).toContain("label: 'HOD jury'");
    expect(readiness).toContain('The country HOD is assigned as its sole jury.');
    expect(readiness).not.toContain('jury roster');
    expect(eligibility).toContain("label: 'HOD jury'");
    expect(eligibility).toContain('Jury model: one HOD per country');
    expect(eligibility).not.toContain("label: 'Jury roster'");
    expect(countryRoute).toContain('Head of Delegation · sole jury');
    expect(countryRoute).toContain('HOD missing');
    expect(countryRoute).not.toContain('Jurors assigned');
    expect(countryRoute).not.toContain('label="Roster"');
  });
});
