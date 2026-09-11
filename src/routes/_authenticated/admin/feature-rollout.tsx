import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { ExternalLink, Flag, ShieldCheck } from 'lucide-react';

import { AdminPage } from '@/components/admin/AdminShell';
import { AdminCard, AdminCardHeader, AdminEmptyState, AdminPageHeader, AdminStatus } from '@/components/admin/AdminUI';
import { supabase } from '@/integrations/supabase/client';
import { SOLARIS_FEATURE_FLAGS, type SolarisFeatureFlag } from '@/lib/feature-flags';
import {
  STUDIO2_PRODUCT_SURFACE_LIST,
  studio2SurfaceFor,
  studio2SurfaceRolloutEligible,
  studio2SurfaceStateLabel,
  type Studio2SurfaceState,
} from '@/lib/studio2-product-surfaces';

export const Route = createFileRoute('/_authenticated/admin/feature-rollout')({
  head: () => ({
    meta: [
      { title: 'Feature Rollout — Solaris Organizer' },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: FeatureRolloutPage,
});

type FeatureFlagRow = {
  key: SolarisFeatureFlag;
  enabled: boolean;
  admins_only: boolean;
  user_ids: string[];
  edition_ids: string[];
  updated_at: string;
};

type QueryBuilder = {
  select(columns: string): {
    order(column: string): PromiseLike<{ data: unknown; error: unknown }>;
  };
};

type FeatureFlagClient = {
  from(table: string): QueryBuilder;
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
};

const client = supabase as unknown as FeatureFlagClient;

async function loadFlags(): Promise<FeatureFlagRow[]> {
  const { data, error } = await client
    .from('studio2_feature_flags')
    .select('key,enabled,admins_only,user_ids,edition_ids,updated_at')
    .order('key');

  if (error) throw error;

  const rows = Array.isArray(data) ? data : [];
  const validKeys = new Set<string>(SOLARIS_FEATURE_FLAGS);

  return rows
    .filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === 'object')
    .filter((row) => typeof row.key === 'string' && validKeys.has(row.key))
    .map((row) => ({
      key: row.key as SolarisFeatureFlag,
      enabled: row.enabled === true,
      admins_only: row.admins_only === true,
      user_ids: Array.isArray(row.user_ids) ? row.user_ids.filter((value): value is string => typeof value === 'string') : [],
      edition_ids: Array.isArray(row.edition_ids) ? row.edition_ids.filter((value): value is string => typeof value === 'string') : [],
      updated_at: typeof row.updated_at === 'string' ? row.updated_at : '',
    }));
}

async function setFlag(row: FeatureFlagRow, enabled: boolean) {
  const surface = studio2SurfaceFor(row.key);
  if (enabled && !studio2SurfaceRolloutEligible(surface)) {
    throw new Error(`${surface.label} is not eligible for rollout from this workstream.`);
  }

  const { data, error } = await client.rpc('studio2_set_feature_flag', {
    p_key: row.key,
    p_enabled: enabled,
    p_admins_only: row.admins_only,
    p_user_ids: row.user_ids,
    p_edition_ids: row.edition_ids,
  });

  if (error) throw error;
  return data;
}

function FeatureRolloutPage() {
  const queryClient = useQueryClient();
  const flagsQuery = useQuery({
    queryKey: ['studio2-feature-flags-admin'],
    queryFn: loadFlags,
  });

  const toggleFlag = useMutation({
    mutationFn: ({ row, enabled }: { row: FeatureFlagRow; enabled: boolean }) => setFlag(row, enabled),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['studio2-feature-flags-admin'] });
      await queryClient.invalidateQueries({ queryKey: ['studio2-feature'] });
    },
  });

  const rows = flagsQuery.data ?? [];
  const enabledCount = rows.filter((row) => row.enabled).length;
  const productSurfaceCount = STUDIO2_PRODUCT_SURFACE_LIST.filter((surface) => surface.state === 'product_surface').length;
  const plannedCount = STUDIO2_PRODUCT_SURFACE_LIST.filter((surface) => surface.state === 'planned').length;

  return (
    <AdminPage>
      <div className="mx-auto max-w-6xl space-y-4">
        <AdminPageHeader
          eyebrow="Solaris Studio 2"
          title="Feature rollout"
          description="Control live rollout while keeping product surfaces, shared foundations and unfinished work visibly distinct. Planned and externally owned features cannot be enabled from this page."
        />

        <div className="grid gap-4 md:grid-cols-4">
          <AdminCard strong>
            <AdminCardHeader eyebrow="Enabled" title={`${enabledCount} / ${rows.length || SOLARIS_FEATURE_FLAGS.length}`} />
            <p className="mt-2 text-sm text-muted-foreground">Capabilities currently allowed through the production rollout gate.</p>
          </AdminCard>
          <AdminCard>
            <AdminCardHeader eyebrow="Product surfaces" title={`${productSurfaceCount}`} />
            <p className="mt-2 text-sm text-muted-foreground">Studio 2 capabilities with dedicated user-facing routes.</p>
          </AdminCard>
          <AdminCard>
            <AdminCardHeader eyebrow="Planned" title={`${plannedCount}`} />
            <p className="mt-2 text-sm text-muted-foreground">Reserved flags that remain rollout-locked until their product slice exists.</p>
          </AdminCard>
          <AdminCard>
            <AdminCardHeader eyebrow="Safety" title="Fail closed" />
            <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
              <ShieldCheck className="size-4" />
              Unknown, unfinished and disabled features stay unavailable.
            </div>
          </AdminCard>
        </div>

        {flagsQuery.isLoading ? (
          <AdminCard>
            <p className="py-10 text-center text-sm text-muted-foreground">Loading rollout state…</p>
          </AdminCard>
        ) : flagsQuery.error ? (
          <AdminCard>
            <AdminEmptyState icon={Flag} title="Rollout state unavailable" description="The Studio 2 feature-flag table could not be read." />
          </AdminCard>
        ) : (
          <AdminCard>
            <div className="divide-y divide-white/[0.07]">
              {rows.map((row) => {
                const surface = studio2SurfaceFor(row.key);
                const busy = toggleFlag.isPending && toggleFlag.variables?.row.key === row.key;
                const enableAllowed = studio2SurfaceRolloutEligible(surface);
                const toggleAllowed = row.enabled || enableAllowed;

                return (
                  <div key={row.key} className="flex flex-col gap-4 py-4 first:pt-0 last:pb-0 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold">{surface.label}</p>
                        <AdminStatus tone={row.enabled ? 'ready' : 'neutral'}>{row.enabled ? 'Enabled' : 'Disabled'}</AdminStatus>
                        <AdminStatus tone={surfaceTone(surface.state)}>{studio2SurfaceStateLabel(surface.state)}</AdminStatus>
                        {row.admins_only ? <AdminStatus tone="info">Admins only</AdminStatus> : null}
                      </div>
                      <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{surface.description}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span>{row.edition_ids.length ? `${row.edition_ids.length} edition restriction(s)` : 'All editions'}</span>
                        <span>·</span>
                        <span>{row.user_ids.length ? `${row.user_ids.length} user restriction(s)` : 'All eligible users'}</span>
                        {surface.dependsOn?.length ? <><span>·</span><span>Depends on {surface.dependsOn.map((key) => studio2SurfaceFor(key).label).join(', ')}</span></> : null}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {surface.route ? (
                        <a
                          href={surface.route}
                          className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/[0.09] bg-white/[0.025] px-3 text-sm font-semibold hover:bg-white/[0.06]"
                        >
                          {surface.surfaceLabel ?? 'Open surface'}
                          <ExternalLink className="size-3.5" />
                        </a>
                      ) : null}
                      <button
                        type="button"
                        disabled={busy || !toggleAllowed}
                        onClick={() => toggleFlag.mutate({ row, enabled: !row.enabled })}
                        className="inline-flex min-h-10 items-center justify-center rounded-xl border border-white/[0.09] bg-white/[0.035] px-4 text-sm font-semibold transition-colors hover:bg-white/[0.07] disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        {busy
                          ? 'Saving…'
                          : row.enabled
                            ? 'Disable'
                            : enableAllowed
                              ? 'Enable'
                              : 'Rollout locked'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </AdminCard>
        )}

        {toggleFlag.error ? (
          <div className="rounded-xl border border-red-300/25 bg-red-300/10 px-4 py-3 text-sm text-red-100">
            {toggleFlag.error instanceof Error ? toggleFlag.error.message : 'Could not update the rollout flag. Organizer permission is required.'}
          </div>
        ) : null}
      </div>
    </AdminPage>
  );
}

function surfaceTone(state: Studio2SurfaceState): 'neutral' | 'info' | 'ready' | 'attention' {
  if (state === 'product_surface' || state === 'integrated') return 'ready';
  if (state === 'foundation') return 'info';
  if (state === 'external_workstream') return 'attention';
  return 'neutral';
}
