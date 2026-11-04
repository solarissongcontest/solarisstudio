import { supabase } from '@/integrations/supabase/client';
import {
  WORLD_ORG_PAGE_SIZE,
  normalizeWorldOrgSearch,
  parseWorldOrganization,
  parseWorldOrganizationProfile,
  type PublicWorldOrganization,
  type PublicWorldProfile,
  type WorldOrgFilter,
} from './terra-world-public';

// TG2 is a stacked, unmerged migration. Its tables/RPC will not appear in
// generated Database types until the System owner lands TG2. Keep the cast
// local and validate all projection data at this public boundary.
type ReadResult = { data: unknown; error: { message: string } | null };
type WorldOrgQuery = {
  eq(column: string, value: string): WorldOrgQuery;
  or(filters: string): WorldOrgQuery;
  order(column: string, options: { ascending: boolean }): WorldOrgQuery;
  range(from: number, to: number): PromiseLike<ReadResult>;
};
export type WorldPublicReadClient = {
  from(table: 'world_organizations'): { select(columns: string): WorldOrgQuery };
  rpc(name: 'world_organization_projection_v1', args: { p_slug: string }): PromiseLike<ReadResult>;
};
const client = supabase as unknown as WorldPublicReadClient;

export type WorldOrgPage = {
  items: PublicWorldOrganization[];
  nextPage: number | null;
};

export async function readWorldOrganizationsPage(
  input: { page: number; search: string; status: WorldOrgFilter },
  reader: WorldPublicReadClient = client,
): Promise<WorldOrgPage> {
  if (!Number.isSafeInteger(input.page) || input.page < 0 || input.page > 500) {
    throw new Error('Invalid organization page.');
  }
  const search = normalizeWorldOrgSearch(input.search);
  let query = reader.from('world_organizations')
    .select('id,slug,official_name,short_name,description,type,status,emblem_url,banner_url,revision,public_visibility')
    .eq('public_visibility', 'public');
  if (input.status !== 'all') query = query.eq('status', input.status);
  if (search) {
    query = query.or('official_name.ilike.%' + search + '%,short_name.ilike.%' + search + '%');
  }
  const from = input.page * WORLD_ORG_PAGE_SIZE;
  const { data, error } = await query.order('short_name', { ascending: true })
    .range(from, from + WORLD_ORG_PAGE_SIZE);
  if (error) throw new Error('Could not load public organizations.');
  if (!Array.isArray(data)) throw new Error('Invalid public organization response.');
  return {
    items: data.slice(0, WORLD_ORG_PAGE_SIZE)
      .map(parseWorldOrganization)
      .filter((item): item is PublicWorldOrganization => item !== null),
    nextPage: data.length > WORLD_ORG_PAGE_SIZE ? input.page + 1 : null,
  };
}

export async function readWorldOrganizationProfile(
  slug: string,
  reader: WorldPublicReadClient = client,
): Promise<PublicWorldProfile | null> {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return null;
  const { data, error } = await reader.rpc('world_organization_projection_v1', { p_slug: slug });
  if (error) throw new Error('Could not load this public organization.');
  if (data === null) return null;
  const projection = parseWorldOrganizationProfile(data);
  if (!projection || projection.organization.slug !== slug) {
    throw new Error('Invalid public organization response.');
  }
  return projection;
}
