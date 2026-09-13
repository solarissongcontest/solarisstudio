import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { ExternalLink, Flag, ShieldCheck, X } from 'lucide-react';
import { useMemo, useState } from 'react';

import { AdminPage } from '@/components/admin/AdminShell';
import { AdminCard, AdminCardHeader, AdminEmptyState, AdminPageHeader, AdminStatus } from '@/components/admin/AdminUI';
import { supabase } from '@/integrations/supabase/client';
import { SOLARIS_FEATURE_FLAGS, type SolarisFeatureFlag } from '@/lib/feature-flags';
import {
  STUDIO2_PRODUCT_SURFACE_LIST,
  studio2RolloutDecision,
  studio2SurfaceFor,
  studio2SurfaceStateLabel,
  type Studio2SurfaceState,
} from '@/lib/studio2-product-surfaces';
import {
  STUDIO2_ROLLOUT_VIEWS,
  rolloutStateSummary,
  rolloutViewCounts,
  rowsForRolloutView,
  type Studio2RolloutView,
} from '@/lib/studio2-rollout-view';

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

function enabledKeySet(rows: readonly FeatureFlagRow[]) {
  return new Set(rows.filter((candidate) => candidate.enabled).map((candidate) => candidate.key));
}

async function setFlag(row: FeatureFlagRow, enabled: boolean, currentRows: readonly FeatureFlagRow[]) {
  const enabledKeys = enabledKeySet(currentRows);
  const decision = studio2RolloutDecision(row.key, row.enabled, enabledKeys);
  const surface = studio2SurfaceFor(row.key);

  if (!decision.allowed) {
    const labels = decision.blockingKeys.map((key) => studio2SurfaceFor(key).label).join(', ');
    if (decision.reason === 'rollout_locked') {
      throw new Error(`${surface.label} is not eligible for rollout from this workstream.`);
    }
    if (decision.reason === 'missing_dependencies') {
      throw new Error(`Enable ${labels} before ${surface.label}.`);
    }
    if (decision.reason === 'active_dependents') {
      throw new Error(`Disable ${labels} before disabling ${surface.label}.`);
    }
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
  const [view, setView] = useState<Studio2RolloutView>('active');
  const [selectedKey, setSelectedKey] = useState<SolarisFeatureFlag | null>(null);
  const flagsQuery = useQuery({
    queryKey: ['studio2-feature-flags-admin'],
    queryFn: loadFlags,
  });

  const rows = flagsQuery.data ?? [];
  const enabledKeys = enabledKeySet(rows);
  const counts = rolloutViewCounts(rows);
  const visibleRows = useMemo(() => rowsForRolloutView(rows, view), [rows, view]);
  const selectedRow = selectedKey ? rows.find((row) => row.key === selectedKey) ?? null : null;

  const toggleFlag = useMutation({
    mutationFn: ({ row, enabled }: { row: FeatureFlagRow; enabled: boolean }) => setFlag(row, enabled, rows),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['studio2-feature-flags-admin'] });
      await queryClient.invalidateQueries({ queryKey: ['studio2-feature'] });
    },
  });

  const enabledCount = rows.filter((row) => row.enabled).length;
  const productSurfaceCount = STUDIO2_PRODUCT_SURFACE_LIST.filter((surface) => surface.state === 'product_surface').length;
  const plannedCount = STUDIO2_PRODUCT_SURFACE_LIST.filter((surface) => surface.state === 'planned').length;
  const activeView = STUDIO2_ROLLOUT_VIEWS.find((candidate) => candidate.id === view)!;

  return (
    <AdminPage>
      <div className="mx-auto max-w-6xl space-y-4">
        <AdminPageHeader
          eyebrow="Solaris Studio 2"
          title="Feature rollout"
          description="Control live rollout without mixing production surfaces, foundations, roadmap placeholders and externally owned work into one giant list. Dependency safety remains enforced server-side."
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
            <p className="mt-2 text-sm text-muted-foreground">Roadmap flags remain visible without pretending they can be enabled.</p>
          </AdminCard>
          <AdminCard>
            <AdminCardHeader eyebrow="Safety" title="Dependency-safe" />
            <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
              <ShieldCheck className="size-4" />
              Active dependencies still block unsafe enable and disable actions.
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
          <>
            <AdminCard className="!p-2 sm:!p-2">
              <nav className="scroll-slim flex gap-1 overflow-x-auto" aria-label="Feature rollout views">
                {STUDIO2_ROLLOUT_VIEWS.map((candidate) => {
                  const active = candidate.id === view;
                  return (
                    <button
                      key={candidate.id}
                      type="button"
                      onClick={() => { setView(candidate.id); setSelectedKey(null); }}
                      aria-pressed={active}
                      className={active
                        ? 'min-h-10 shrink-0 rounded-xl border border-sky-200/15 bg-sky-200/[0.09] px-3 text-xs font-semibold text-sky-50'
                        : 'min-h-10 shrink-0 rounded-xl border border-transparent px-3 text-xs font-semibold text-muted-foreground hover:border-white/[0.07] hover:bg-white/[0.035] hover:text-foreground'}
                    >
                      {candidate.label} <span className="numeric ml-1 text-[10px] opacity-70">{counts[candidate.id]}</span>
                    </button>
                  );
                })}
              </nav>
            </AdminCard>

            <AdminCard>
              <div className="mb-4 flex flex-col gap-1 border-b border-white/[0.07] pb-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2 className="font-display text-lg font-bold">{activeView.label}</h2>
                  <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">{activeView.description}</p>
                </div>
                <span className="text-xs text-muted-foreground">{visibleRows.length} feature{visibleRows.length === 1 ? '' : 's'}</span>
              </div>

              {visibleRows.length ? (
                <div className="divide-y divide-white/[0.07]">
                  {visibleRows.map((row) => {
                    const surface = studio2SurfaceFor(row.key);
                    const busy = toggleFlag.isPending && toggleFlag.variables?.row.key === row.key;
                    const decision = studio2RolloutDecision(row.key, row.enabled, enabledKeys);
                    const blockingLabels = decision.blockingKeys.map((key) => studio2SurfaceFor(key).label);

                    return (
                      <div key={row.key} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 lg:flex-row lg:items-center lg:justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-semibold">{surface.label}</p>
                            <AdminStatus tone={row.enabled ? 'ready' : 'neutral'}>{row.enabled ? 'Enabled' : 'Disabled'}</AdminStatus>
                            {row.admins_only ? <AdminStatus tone="info">Admins only</AdminStatus> : null}
                          </div>
                          <p className="mt-1 line-clamp-2 max-w-3xl text-sm text-muted-foreground">{surface.description}</p>
                          {!decision.allowed && decision.reason === 'missing_dependencies' ? (
                            <p className="mt-2 text-xs font-medium text-amber-200">Enable first: {blockingLabels.join(', ')}</p>
                          ) : null}
                          {!decision.allowed && decision.reason === 'active_dependents' ? (
                            <p className="mt-2 text-xs font-medium text-sky-100">Required by: {blockingLabels.join(', ')}</p>
                          ) : null}
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setSelectedKey(row.key)}
                            className="inline-flex min-h-10 items-center justify-center rounded-xl border border-white/[0.09] bg-white/[0.025] px-3 text-sm font-semibold hover:bg-white/[0.06]"
                          >
                            Details
                          </button>
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
                            disabled={busy || !decision.allowed}
                            onClick={() => toggleFlag.mutate({ row, enabled: !row.enabled })}
                            className="inline-flex min-h-10 items-center justify-center rounded-xl border border-white/[0.09] bg-white/[0.035] px-4 text-sm font-semibold transition-colors hover:bg-white/[0.07] disabled:cursor-not-allowed disabled:opacity-45"
                          >
                            {busy ? 'Saving…' : rolloutButtonLabel(row.enabled, decision.reason)}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <AdminEmptyState icon={Flag} title={`No ${activeView.label.toLowerCase()} features`} description="Nothing currently belongs to this rollout view." />
              )}
            </AdminCard>

            {selectedRow ? <FeatureDetail row={selectedRow} onClose={() => setSelectedKey(null)} /> : null}
          </>
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

function FeatureDetail({ row, onClose }: { row: FeatureFlagRow; onClose: () => void }) {
  const surface = studio2SurfaceFor(row.key);
  const dependents = STUDIO2_PRODUCT_SURFACE_LIST.filter((candidate) => candidate.dependsOn?.includes(row.key));

  return (
    <AdminCard strong>
      <div className="flex items-start justify-between gap-3">
        <AdminCardHeader eyebrow="Feature detail" title={surface.label} />
        <button type="button" onClick={onClose} className="grid size-9 shrink-0 place-items-center rounded-xl border border-white/[0.08] text-muted-foreground hover:bg-white/[0.05] hover:text-foreground" aria-label="Close feature details">
          <X className="size-4" />
        </button>
      </div>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">{surface.description}</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Detail label="Rollout" value={rolloutStateSummary(surface.state, row.enabled)} />
        <Detail label="Type" value={studio2SurfaceStateLabel(surface.state)} />
        <Detail label="Audience" value={humanize(surface.audience)} />
        <Detail label="Last updated" value={formatTimestamp(row.updated_at)} />
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <Detail label="Depends on" value={surface.dependsOn?.length ? surface.dependsOn.map((key) => studio2SurfaceFor(key).label).join(', ') : 'None'} />
        <Detail label="Used by" value={dependents.length ? dependents.map((candidate) => candidate.label).join(', ') : 'No declared dependents'} />
        <Detail label="Edition scope" value={row.edition_ids.length ? `${row.edition_ids.length} restricted edition(s)` : 'All editions'} />
        <Detail label="User scope" value={row.user_ids.length ? `${row.user_ids.length} restricted user(s)` : 'All eligible users'} />
      </div>
    </AdminCard>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.018] p-3">
      <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      <p className="mt-1.5 text-sm font-medium text-foreground">{value}</p>
    </div>
  );
}

function rolloutButtonLabel(enabled: boolean, reason: 'allowed' | 'rollout_locked' | 'missing_dependencies' | 'active_dependents') {
  if (reason === 'active_dependents') return 'Required by active features';
  if (reason === 'rollout_locked') return 'Rollout locked';
  if (reason === 'missing_dependencies') return 'Enable prerequisites first';
  return enabled ? 'Disable' : 'Enable';
}

function surfaceTone(state: Studio2SurfaceState): 'neutral' | 'info' | 'ready' | 'attention' {
  if (state === 'product_surface' || state === 'integrated') return 'ready';
  if (state === 'foundation') return 'info';
  if (state === 'external_workstream') return 'attention';
  return 'neutral';
}

function humanize(value: string) {
  return value.split('_').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
}

function formatTimestamp(value: string) {
  if (!value) return 'Unknown';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}
