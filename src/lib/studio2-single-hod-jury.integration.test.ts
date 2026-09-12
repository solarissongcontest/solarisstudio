import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

const migration = source('supabase/migrations/20260912203000_studio2_single_hod_jury.sql');
const hodRoute = source('src/routes/_authenticated/country-hub/hod.tsx');
const workspaceModel = source('src/lib/hod-workspace-model.ts');
const canonicalJury = source('src/integrations/jury-voting/jury-voting.server.ts');

describe('Studio 2 single-HOD jury contract', () => {
  it('persists exactly one jury per country instead of a configurable roster size', () => {
    expect(migration).toContain('set jury_members_required = 1');
    expect(migration).toContain('check (jury_members_required = 1)');
    expect(migration).toContain('if p_required is distinct from 1 then');
    expect(migration).toContain('exactly one jury per country: the Head of Delegation');
    expect(migration).not.toContain('between 1 and 10');
  });

  it('projects jury identity from canonical HOD history with jury-channel override semantics', () => {
    expect(migration).toContain("a.channel in ('jury', 'delegation')");
    expect(migration).toContain("case when a.channel = 'jury' then 0 else 1 end");
    expect(migration).toContain("'juryMembersRequired', 1");
    expect(migration).toContain("'juryMembersAssigned', v_assigned");
    expect(canonicalJury).toContain('canonical.hod.resolve(String(show.edition_id), countryId, "jury")');
  });

  it('retires delegation-side add/remove juror controls and obsolete roster writes', () => {
    expect(hodRoute).toContain('HOD assigned');
    expect(hodRoute).toContain('HOD missing');
    expect(hodRoute).toContain('Head of Delegation · sole jury');
    expect(hodRoute).not.toContain('assignStudio2JuryMember');
    expect(hodRoute).not.toContain('removeStudio2JuryMember');
    expect(hodRoute).not.toContain('Add juror');
    expect(hodRoute).not.toContain('Juror display name');
    expect(migration).toContain('revoke execute on function public.studio2_assign_jury_member');
    expect(migration).toContain('revoke execute on function public.studio2_remove_jury_member');
  });

  it('models the only pre-ballot blocker as a missing HOD', () => {
    expect(workspaceModel).toContain("id: 'jury-hod'");
    expect(workspaceModel).toContain("label: 'Confirm HOD assignment'");
    expect(workspaceModel).toContain('The HOD is the country’s sole jury.');
    expect(workspaceModel).not.toContain('Complete jury assignment');
    expect(workspaceModel).not.toContain('jury members assigned');
  });
});
