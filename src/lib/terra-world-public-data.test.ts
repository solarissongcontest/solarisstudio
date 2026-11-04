import { describe, expect, it } from 'vitest';
import {
  readWorldOrganizationProfile,
  readWorldOrganizationsPage,
  type WorldPublicReadClient,
} from './terra-world-public-data';

const row = {
  id: 'org-one', slug: 'guard', official_name: 'Global Union for Allied Resilience and Defence',
  short_name: 'GUARD', status: 'active', type: 'international_union',
  public_visibility: 'public', revision: 1,
};

function mockReader(data: unknown, rpcData: unknown = null) {
  const calls: Array<[string, ...unknown[]]> = [];
  const query = {
    eq(column: string, value: string) { calls.push(['eq', column, value]); return query; },
    or(filter: string) { calls.push(['or', filter]); return query; },
    order(column: string, options: { ascending: boolean }) { calls.push(['order', column, options]); return query; },
    range(start: number, end: number) {
      calls.push(['range', start, end]);
      return Promise.resolve({ data, error: null });
    },
  };
  const client: WorldPublicReadClient = {
    from(table) {
      calls.push(['from', table]);
      return { select(columns) { calls.push(['select', columns]); return query; } };
    },
    rpc(name, args) {
      calls.push(['rpc', name, args]);
      return Promise.resolve({ data: rpcData, error: null });
    },
  };
  return { client, calls };
}

describe('TG2 public organization read boundaries', () => {
  it('queries only public columns, with RLS visibility and one bounded page', async () => {
    const { client, calls } = mockReader([row, { ...row, id: 'private', public_visibility: 'private' }]);
    const page = await readWorldOrganizationsPage({ page: 2, search: 'GUARD),status.eq.private', status: 'active' }, client);
    expect(page.items.map((org) => org.id)).toEqual(['org-one']);
    expect(calls).toContainEqual(['eq', 'public_visibility', 'public']);
    expect(calls).toContainEqual(['eq', 'status', 'active']);
    expect(calls).toContainEqual(['or', 'official_name.ilike.%GUARD status eq private%,short_name.ilike.%GUARD status eq private%']);
    expect(calls).toContainEqual(['range', 48, 72]);
    expect(String(calls.find((call) => call[0] === 'select')?.[1])).not.toContain('user_id');
  });

  it('does not fetch unlimited pages or invent absent organizations', async () => {
    const { client } = mockReader(Array.from({ length: 25 }, (_, index) => ({ ...row, id: String(index) })));
    const page = await readWorldOrganizationsPage({ page: 0, search: '', status: 'all' }, client);
    expect(page.items).toHaveLength(24);
    expect(page.nextPage).toBe(1);
    await expect(readWorldOrganizationsPage({ page: -1, search: '', status: 'all' }, client)).rejects.toThrow();
    expect(await readWorldOrganizationProfile('../private', client)).toBeNull();
  });

  it('uses the authoritative projection and rejects a mismatched identity', async () => {
    const { client, calls } = mockReader([], { organization: { ...row, slug: 'unity' }, memberships: [] });
    await expect(readWorldOrganizationProfile('guard', client)).rejects.toThrow('Invalid public organization response');
    expect(calls).toContainEqual(['rpc', 'world_organization_projection_v1', { p_slug: 'guard' }]);
    const empty = mockReader([], null);
    expect(await readWorldOrganizationProfile('unity', empty.client)).toBeNull();
  });
});
