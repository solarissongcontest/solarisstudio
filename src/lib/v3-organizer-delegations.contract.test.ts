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

  it('contains the legacy detail fallback behind the parent guard rather than treating it as V3 authority', () => {
    expect(countryDetail).toContain("[...editions].sort");
    expect(countriesRoute).toContain(
      'Solaris will not substitute the newest edition for a missing or stale context.',
    );
  });
});
