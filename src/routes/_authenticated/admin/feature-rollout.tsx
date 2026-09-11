import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { Flag, ShieldCheck } from 'lucide-react';

import { AdminPage } from '@/components/admin/AdminShell';
import { AdminCard, AdminCardHeader, AdminEmptyState, AdminPageHeader, AdminStatus } from '@/components/admin/AdminUI';
import { supabase } from '@/integrations/supabase/client';
import { SOLARIS_FEATURE_FLAGS, type SolarisFeatureFlag } from '@/lib/feature-flags';

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

  return (
    <AdminPage>
      <div className="mx-auto max-w-6xl space-y-4">
        <AdminPageHeader
          eyebrow="Solaris Studio 2"
          title="Feature rollout"
          description="See which Studio 2 capabilities are exposed in the live product. Features remain independently gated so infrastructure can exist without silently becoming user-facing."
        />

        <div className="grid gap-4 md:grid-cols-3">
          <AdminCard strong>
            <AdminCardHeader eyebrow="Enabled" title={`${enabledCount} / ${rows.length || SOLARIS_FEATURE_FLAGS.length}`} />
            <p className="mt-2 text-sm text-muted-foreground">Features currently allowed through the rollout gate.</p>
          </AdminCard>
          <AdminCard>
            <AdminCardHeader eyebrow="Safety" title="Fail closed" />
            <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
              <ShieldCheck className="size-4" />
              Unknown or disabled features stay unavailable.
            </div>
          </AdminCard>
          <AdminCard>
            <AdminCardHeader eyebrow="Rules" title="Separate workstream" />
            <p className="mt-2 text-sm text-muted-foreground">The Rules Hub and Trust & Integrity implementation are managed independently and are not duplicated here.</p>
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
                const busy = toggleFlag.isPending && toggleFlag.variables?.row.key === row.key;
                return (
                  <div key={row.key} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold">{humanize(row.key)}</p>
                        <AdminStatus tone={row.enabled ? 'ready' : 'neutral'}>{row.enabled ? 'Enabled' : 'Disabled'}</AdminStatus>
                        {row.admins_only ? <AdminStatus tone="info">Admins only</AdminStatus> : null}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {row.edition_ids.length ? `${row.edition_ids.length} edition restriction(s)` : 'All editions'} ·{' '}
                        {row.user_ids.length ? `${row.user_ids.length} user restriction(s)` : 'All eligible users'}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => toggleFlag.mutate({ row, enabled: !row.enabled })}
                      className="inline-flex min-h-10 items-center justify-center rounded-xl border border-white/[0.09] bg-white/[0.035] px-4 text-sm font-semibold transition-colors hover:bg-white/[0.07] disabled:cursor-wait disabled:opacity-60"
                    >
                      {busy ? 'Saving…' : row.enabled ? 'Disable' : 'Enable'}
                    </button>
                  </div>
                );
              })}
            </div>
          </AdminCard>
        )}

        {toggleFlag.error ? (
          <div className="rounded-xl border border-red-300/25 bg-red-300/10 px-4 py-3 text-sm text-red-100">
            Could not update the rollout flag. Organizer permission is required.
          </div>
        ) : null}
      </div>
    </AdminPage>
  );
}

function humanize(value: string) {
  return value
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
