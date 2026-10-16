import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const countriesRoute = readFileSync(
  'src/routes/_authenticated/admin/countries.tsx',
  'utf8',
);
const countryDetail = readFileSync(
  'src/routes/_authenticated/admin/countries.$countryId.tsx',
  'utf8',
);

describe('V3 Organizer Delegations context boundary', () => {
  it('fails closed before rendering country detail without an exact selected edition', () => {
    expect(countriesRoute).toContain(
      'const selectedEdition = selectOrganizerEdition(editionsQuery.data ?? [], editionId);',
    );
    expect(countriesRoute).toContain("if (pathname.startsWith('/admin/countries/'))");
    expect(countriesRoute).toContain('if (!selectedEdition)');
    expect(countriesRoute).toContain('Edition context required');
    expect(countriesRoute).toContain('return <Outlet />;');
  });

  it('keeps country detail itself exact-scoped instead of retaining a newest-edition fallback', () => {
    expect(countryDetail).toContain('const { editionId } = useAdminContext();');
    expect(countryDetail).toContain('selectOrganizerEdition(editions, editionId)');
    expect(countryDetail).toContain('title="No edition selected"');
    expect(countryDetail).toContain(
      'Solaris will not substitute another edition for missing or stale Organizer context.',
    );
    expect(countryDetail).not.toContain('[...editions].sort');
    expect(countryDetail).not.toContain('editions[0]');
    expect(countriesRoute).toContain(
      'Solaris will not substitute the newest edition for a missing or stale context.',
    );
  });
});
