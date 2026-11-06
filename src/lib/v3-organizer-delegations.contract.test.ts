import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { verifyOrganizerConfirmationRead } from '../integrations/confirmations/organizer-confirmation-read-authorization';
import type { OrganizerConfirmationReadClient } from '../integrations/confirmations/organizer-confirmation-read-authorization';


const authorityHelper = readFileSync('src/integrations/confirmations/organizer-confirmation-read-authorization.ts', 'utf8');
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
  it('verifies exact scoped read authorization without performing direct RPCs in the read-only route', async () => {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const client: OrganizerConfirmationReadClient = {
      rpc: async (name, args) => {
        calls.push({ name, args });
        return { data: true, error: null };
      },
    };
    expect(await verifyOrganizerConfirmationRead('edition-test-id', client)).toBe(true);
    expect(calls).toEqual([{
      name: 'studio2_access_allowed',
      args: { p_capability: 'confirmation.read', p_edition_id: 'edition-test-id', p_strict_before_cutover: false },
    }]);
    expect(delegationsRoute).not.toContain('.rpc(');
  });

  it('fails closed on denied, unknown, missing and failed Confirmation read probes', async () => {
    const denied: OrganizerConfirmationReadClient = { rpc: async () => ({ data: false, error: null }) };
    const malformed: OrganizerConfirmationReadClient = { rpc: async () => ({ data: null, error: null }) };
    const failure: OrganizerConfirmationReadClient = { rpc: async () => ({ data: null, error: { message: 'Unavailable' } }) };
    expect(await verifyOrganizerConfirmationRead('edition-test-id', denied)).toBe(false);
    await expect(verifyOrganizerConfirmationRead('edition-test-id', malformed)).rejects.toThrow(/invalid response/);
    await expect(verifyOrganizerConfirmationRead('edition-test-id', failure)).rejects.toMatchObject({ message: 'Unavailable' });
    await expect(verifyOrganizerConfirmationRead('', denied)).rejects.toThrow(/explicit Organizer edition/);
  });

  it('rejects implicit shell edition fallback and binds review selection to its choosing actor', () => {
    expect(delegationsRoute).toContain('const { editionId, setEditionContext } = useAdminContext();');
    expect(delegationsRoute).toContain('const explicitEditionId = explicitChoice?.actorId === actorId ? explicitChoice.editionId : "";');
    expect(delegationsRoute).toContain('setExplicitChoice(choice ? { actorId, editionId: choice.id } : null)');
    expect(delegationsRoute).toContain('setEditionContext({ id: choice.id, slug: choice.slug, label: editionLabel(choice) })');
    expect(delegationsRoute).toContain('const verifiedChoiceId = explicitEditionId && editionId === explicitEditionId ? explicitEditionId : "";');
    expect(delegationsRoute).toContain('Choose an edition for this Delegations review');
    expect(delegationsRoute).toContain('No edition is inferred from the Organizer shell.');
    expect(delegationsRoute).toContain('!editionsQuery.isFetching && Boolean(resolvedEditionId)');
    expect(delegationsRoute).toContain('disabled={!editionsQuery.isSuccess || Boolean(editionsQuery.error) || editionsQuery.isFetching}');
  });

  it('resolves the Delegations overview against the exact accessible Organizer edition before querying requirements', () => {
    expect(delegationsRoute).toContain('editionsQuery.isSuccess && !editionsQuery.error');
    expect(delegationsRoute).toContain(
      'selectOrganizerEdition(editionsQuery.data ?? [], verifiedChoiceId)',
    );
    expect(delegationsRoute).toContain('const resolvedEditionId = selectedEdition?.id ?? "";');
    expect(delegationsRoute).toContain('queryFn: () => loadConfirmationRequirements(resolvedEditionId)');
    expect(delegationsRoute).toContain('enabled: editionsQuery.isSuccess && !editionsQuery.error && !editionsQuery.isFetching && Boolean(resolvedEditionId)');
    expect(delegationsRoute).toContain('verifyOrganizerConfirmationRead(resolvedEditionId)');
    expect(authorityHelper).toContain('p_capability: "confirmation.read"');
    expect(authorityHelper).toContain('p_edition_id: editionId');
    expect(authorityHelper).toContain('client.rpc("studio2_access_allowed"');
    expect(delegationsRoute).toContain('enabled: hasConfirmationRead');
    expect(delegationsRoute).toContain('!capabilityQuery.isFetching');
    expect(delegationsRoute).toContain('capabilityQuery.data === true');
    expect(delegationsRoute).not.toContain('loadConfirmationRequirements(editionId!)');
  });

  it('distinguishes missing Confirmation permission from network failure and never substitutes public visibility', () => {
    expect(delegationsRoute).toContain('title="Confirmation access could not be verified"');
    expect(delegationsRoute).toContain('title="Confirmation access required"');
    expect(delegationsRoute).toContain('Retry access verification');
    expect(delegationsRoute).toContain('Public edition visibility does not grant access to private obligations.');
    expect(delegationsRoute).toContain('actorId, resolvedEditionId || "none"');
    expect(delegationsRoute).toContain('gcTime: 0');
    expect(delegationsRoute).toContain('refetchOnMount: "always"');
    expect(delegationsRoute).not.toContain('enabled: Boolean(resolvedEditionId)');
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
