import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const delegationsRoute = readFileSync(
  'src/routes/_authenticated/admin/delegations.tsx',
  'utf8',
);
const countriesRoute = readFileSync(
  'src/routes/_authenticated/admin/countries.tsx',
  'utf8',
);
const countryDetail = readFileSync(
  'src/routes/_authenticated/admin/countries.$countryId.tsx',
  'utf8',
);

describe('V3 Organizer Delegations context boundary', () => {
  it('resolves the Delegations overview against the exact accessible Organizer edition before querying requirements', () => {
    expect(delegationsRoute).toContain('editionsQuery.isSuccess && !editionsQuery.error');
    expect(delegationsRoute).toContain(
      'selectOrganizerEdition(editionsQuery.data ?? [], editionId)',
    );
    expect(delegationsRoute).toContain('const resolvedEditionId = selectedEdition?.id ?? "";');
    expect(delegationsRoute).toContain('queryFn: () => loadConfirmationRequirements(resolvedEditionId)');
    expect(delegationsRoute).toContain('enabled: editionsQuery.isSuccess && !editionsQuery.error && Boolean(resolvedEditionId)');
    expect(delegationsRoute).not.toContain('loadConfirmationRequirements(editionId!)');
  });

  it('keeps the canonical delegation roster reachable when Confirmation obligations cannot load', () => {
    // The independent country cockpit stays behind its own delegation.read route gate.
    // An unverified or missing edition cannot expose this link.
    expect(delegationsRoute).toContain('actions={selectedEdition ? (');
    expect(delegationsRoute).toContain('to="/admin/countries"');
    expect(delegationsRoute).toContain('Browse delegation roster');
    expect(delegationsRoute).toContain(') : undefined}');
    expect(countriesRoute).toContain("const cockpitQuery = useQuery({");
    expect(countriesRoute).toContain("enabled: Boolean(resolvedEditionId)");
    const headerLink = delegationsRoute.indexOf('Browse delegation roster');
    const requirementsError = delegationsRoute.indexOf('requirementsQuery.isError ? (');
    expect(headerLink).toBeGreaterThan(0);
    expect(headerLink).toBeLessThan(requirementsError);
  });

  it('filters the already-loaded attention list without suppressing canonical totals or fetching more data', () => {
    expect(delegationsRoute).toContain('const [attentionSearch, setAttentionSearch] = useState("");');
    expect(delegationsRoute).toContain('const visibleAttention = attentionNeedle');
    expect(delegationsRoute).toContain('summary.needsAttention.filter((requirement) =>');
    expect(delegationsRoute).toContain('visibleAttention.slice(0, 12).map((requirement)');
    expect(delegationsRoute).toContain('No unresolved obligations match this search.');
    expect(delegationsRoute).toContain('{visibleAttention.length} of {summary.needsAttention.length} unresolved obligations');
    expect(delegationsRoute).toContain('value={summary.needsAttention.length}');
    expect(delegationsRoute).toContain('queryFn: () => loadConfirmationRequirements(resolvedEditionId)');
    expect(delegationsRoute).not.toContain('queryKey: ["delegation-attention-search"');
  });

  it('keeps missing, stale and revoked Delegations context fail-closed and visible', () => {
    expect(delegationsRoute).toContain('editionsQuery.isLoading');
    expect(delegationsRoute).toContain('editionsQuery.isError');
    expect(delegationsRoute).toContain('!selectedEdition');
    expect(delegationsRoute).toContain('Edition context required');
    expect(delegationsRoute).toContain(
      'Solaris will not substitute another edition or a globally active Confirmation edition for missing, stale or revoked context.',
    );
    expect(delegationsRoute).toContain('eyebrow={selectedEditionLabel ?? "Current edition"}');
    expect(delegationsRoute).toContain('<AdminStatus tone="neutral">Edition context</AdminStatus>');
  });

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
