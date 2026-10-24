import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import { ExternalLink, Flag, ShieldCheck, X } from 'lucide-react';
import { useMemo, useState } from 'react';

import { AdminPage } from '@/components/admin/AdminShell';
import {
  AdminCard,
  AdminCardHeader,
  AdminConfirmSheet,
  AdminEmptyState,
  AdminPageHeader,
  AdminStatus,
} from '@/components/admin/AdminUI';
import { WorkspaceTabs } from '@/components/admin/AdminWorkspacePrimitives';
import { supabase } from '@/integrations/supabase/client';
import {
  applyFeatureRolloutChange,
  previewFeatureRolloutChange,
} from '@/lib/admin-feature-rollout.functions';
import { SOLARIS_FEATURE_FLAGS, type SolarisFeatureFlag } from '@/lib/feature-flags';
import {
  STUDIO2_PRODUCT_SURFACE_LIST,
  studio2RolloutDecision,
  studio2SurfaceFor,
  studio2SurfaceStateLabel,
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
  revision: number;
  updated_at: string;
};

type PendingRolloutReview = {
  baseline: FeatureFlagRow;
  nextEnabled: boolean;
  surfaceLabel: string;
  dependencyLabels: string[];
  dependentLabels: string[];
  expectedRevision: number;
  operationId: string;
};

type UnconfirmedRollout = {
  operationId: string;
  message: string;
};

type QueryBuilder = {
  select(columns: string): {
    order(column: string): PromiseLike<{ data: unknown; error: unknown }>;
  };
};

type FeatureFlagClient = {
  from(table: string): QueryBuilder;
};

const client = supabase as unknown as FeatureFlagClient;

async function loadFlags(): Promise<FeatureFlagRow[]> {
  const { data, error } = await client
    .from('studio2_feature_flags')
    .select('key,enabled,admins_only,user_ids,edition_ids,revision,updated_at')
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
      revision: Number.isSafeInteger(Number(row.revision)) ? Number(row.revision) : 0,
      updated_at: typeof row.updated_at === 'string' ? row.updated_at : '',
    }));
}

function enabledKeySet(rows: readonly FeatureFlagRow[]) {
  return new Set(rows.filter((candidate) => candidate.enabled).map((candidate) => candidate.key));
}

function cloneFlagRow(row: FeatureFlagRow): FeatureFlagRow {
  return {
    ...row,
    user_ids: [...row.user_ids],
    edition_ids: [...row.edition_ids],
  };
}

function rolloutDecisionError(row: FeatureFlagRow, currentRows: readonly FeatureFlagRow[]) {
  const decision = studio2RolloutDecision(row.key, row.enabled, enabledKeySet(currentRows));
  if (decision.allowed) return null;

  const surface = studio2SurfaceFor(row.key);
  const labels = decision.blockingKeys.map((key) => studio2SurfaceFor(key).label).join(', ');
  if (decision.reason === 'rollout_locked') {
    return new Error(`${surface.label} is not eligible for rollout from this workstream.`);
  }
  if (decision.reason === 'missing_dependencies') {
    return new Error(`Enable ${labels} before ${surface.label}.`);
  }
  return new Error(`Disable ${labels} before disabling ${surface.label}.`);
}

function messageFor(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message) return message;
  }
  return fallback;
}

function FeatureRolloutPage() {
  const queryClient = useQueryClient();
  const previewRollout = useServerFn(previewFeatureRolloutChange);
  const applyRollout = useServerFn(applyFeatureRolloutChange);
  const [view, setView] = useState<Studio2RolloutView>('active');
  const [selectedKey, setSelectedKey] = useState<SolarisFeatureFlag | null>(null);
  const [pendingReview, setPendingReview] = useState<PendingRolloutReview | null>(null);
  const [unconfirmedOutcome, setUnconfirmedOutcome] = useState<UnconfirmedRollout | null>(null);
  const [preparingKey, setPreparingKey] = useState<SolarisFeatureFlag | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const flagsQuery = useQuery({
    queryKey: ['studio2-feature-flags-admin'],
    queryFn: loadFlags,
  });

  const rows = flagsQuery.data ?? [];
  const enabledKeys = enabledKeySet(rows);
  const counts = rolloutViewCounts(rows);
  const visibleRows = useMemo(() => rowsForRolloutView(rows, view), [rows, view]);
  const selectedRow = selectedKey ? rows.find((row) => row.key === selectedKey) ?? null : null;

  const refreshRolloutTruth = async () => {
    await queryClient.invalidateQueries({ queryKey: ['studio2-feature-flags-admin'] });
    await queryClient.invalidateQueries({ queryKey: ['studio2-feature'] });
  };

  const toggleFlag = useMutation({
    mutationFn: async (pending: PendingRolloutReview) => applyRollout({
      data: {
        key: pending.baseline.key,
        enabled: pending.nextEnabled,
        adminsOnly: pending.baseline.admins_only,
        userIds: pending.baseline.user_ids,
        editionIds: pending.baseline.edition_ids,
        expectedRevision: pending.expectedRevision,
        operationId: pending.operationId,
      },
    }),
    onSuccess: async (outcome) => {
      if (outcome.status === 'unconfirmed') {
        setUnconfirmedOutcome({
          operationId: outcome.operationId,
          message: outcome.message,
        });
        await refreshRolloutTruth();
        return;
      }

      setPendingReview(null);
      setUnconfirmedOutcome(null);
      setReviewError(null);
      await refreshRolloutTruth();
    },
    onError: async (error) => {
      // A thrown server-function error happens outside the structured command
      // outcome. Keep the reviewed operation intact; a previously unconfirmed
      // operation must never be discarded because transport middleware hid text.
      setReviewError(messageFor(error, 'Could not apply the reviewed rollout operation.'));
      await refreshRolloutTruth();
    },
  });

  async function prepareRolloutReview(row: FeatureFlagRow) {
    if (preparingKey || toggleFlag.isPending || unconfirmedOutcome) return;
    setPreparingKey(row.key);
    setReviewError(null);
    setUnconfirmedOutcome(null);
    toggleFlag.reset();

    try {
      const freshRows = await loadFlags();
      const live = freshRows.find((candidate) => candidate.key === row.key) ?? null;
      if (!live || live.revision < 1) {
        throw new Error('The canonical rollout row changed or has no usable revision. Refresh before retrying.');
      }

      const decisionError = rolloutDecisionError(live, freshRows);
      if (decisionError) throw decisionError;

      const nextEnabled = !live.enabled;
      const preview = await previewRollout({
        data: {
          key: live.key,
          enabled: nextEnabled,
          adminsOnly: live.admins_only,
          userIds: live.user_ids,
          editionIds: live.edition_ids,
        },
      });

      if (
        preview.key !== live.key ||
        preview.currentRevision !== live.revision ||
        preview.enabled !== live.enabled ||
        preview.adminsOnly !== live.admins_only ||
        preview.noChange
      ) {
        throw new Error('The rollout state changed while the review was being prepared. Refresh and review the new canonical state.');
      }

      const surface = studio2SurfaceFor(live.key);
      const dependents = STUDIO2_PRODUCT_SURFACE_LIST.filter((candidate) =>
        candidate.dependsOn?.includes(live.key),
      );

      queryClient.setQueryData(['studio2-feature-flags-admin'], freshRows);
      setPendingReview({
        baseline: cloneFlagRow(live),
        nextEnabled,
        surfaceLabel: surface.label,
        dependencyLabels: surface.dependsOn?.map((key) => studio2SurfaceFor(key).label) ?? [],
        dependentLabels: dependents.map((candidate) => candidate.label),
        expectedRevision: preview.currentRevision,
        operationId: crypto.randomUUID(),
      });
    } catch (caught) {
      setReviewError(messageFor(caught, 'Feature rollout review could not be prepared.'));
      await queryClient.invalidateQueries({ queryKey: ['studio2-feature-flags-admin'] });
    } finally {
      setPreparingKey(null);
    }
  }

  const enabledCount = rows.filter((row) => row.enabled).length;
  const productSurfaceCount = STUDIO2_PRODUCT_SURFACE_LIST.filter((surface) => surface.state === 'product_surface').length;
  const plannedCount = STUDIO2_PRODUCT_SURFACE_LIST.filter((surface) => surface.state === 'planned').length;
  const activeView = STUDIO2_ROLLOUT_VIEWS.find((candidate) => candidate.id === view)!;
  const applyErrorMessage = toggleFlag.error ? messageFor(toggleFlag.error, 'Could not update the rollout flag.') : null;

  return (
    <AdminPage>
      <div className="mx-auto max-w-6xl space-y-4">
        <AdminPageHeader
          eyebrow="Solaris Studio 2"
          title="Feature rollout"
          description="Control live rollout without mixing production surfaces, foundations, roadmap placeholders and externally owned work into one giant list."
        />

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
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
            <AdminCardHeader eyebrow="Command safety" title="Versioned + receipted" />
            <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
              <ShieldCheck className="size-4" />
              Reviewed revisions and stable operation receipts fail closed on rollout-state drift.
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
              <WorkspaceTabs label="Feature rollout views">
                {STUDIO2_ROLLOUT_VIEWS.map((candidate) => {
                  const active = candidate.id === view;
                  return (
                    <button
                      key={candidate.id}
                      type="button"
                      onClick={() => {
                        setView(candidate.id);
                        setSelectedKey(null);
                        if (!unconfirmedOutcome) setPendingReview(null);
                        setReviewError(null);
                      }}
                      aria-pressed={active}
                      className={active
                        ? 'min-h-10 min-w-0 rounded-xl border border-sky-200/15 bg-sky-200/[0.09] px-3 text-xs font-semibold text-sky-50'
                        : 'min-h-10 min-w-0 rounded-xl border border-transparent px-3 text-xs font-semibold text-muted-foreground hover:border-white/[0.07] hover:bg-white/[0.035] hover:text-foreground'}
                    >
                      {candidate.label} <span className="numeric ml-1 text-[10px] opacity-70">{counts[candidate.id]}</span>
                    </button>
                  );
                })}
              </WorkspaceTabs>
            </AdminCard>

            <div className={selectedRow ? 'grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem] xl:items-start' : undefined}>
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
                    {visibleRows.map((row) => (
                      <FeatureRow
                        key={row.key}
                        row={row}
                        enabledKeys={enabledKeys}
                        busy={
                          preparingKey === row.key ||
                          (toggleFlag.isPending && pendingReview?.baseline.key === row.key)
                        }
                        selected={row.key === selectedKey}
                        onSelect={() => setSelectedKey(row.key)}
                        onToggle={() => void prepareRolloutReview(row)}
                      />
                    ))}
                  </div>
                ) : (
                  <AdminEmptyState icon={Flag} title={`No ${activeView.label.toLowerCase()} features`} description="Nothing currently belongs to this rollout view." />
                )}
              </AdminCard>

              {selectedRow ? (
                <aside className="xl:sticky xl:top-24" aria-label="Selected feature details">
                  <FeatureDetail row={selectedRow} onClose={() => setSelectedKey(null)} />
                </aside>
              ) : null}
            </div>
          </>
        )}

        {reviewError || applyErrorMessage ? (
          <div className="rounded-xl border border-red-300/25 bg-red-300/10 px-4 py-3 text-sm text-red-100">
            {reviewError ?? applyErrorMessage}
          </div>
        ) : null}

        <AdminConfirmSheet
          open={Boolean(pendingReview)}
          onClose={() => {
            if (!toggleFlag.isPending && !unconfirmedOutcome) setPendingReview(null);
          }}
          onConfirm={async () => {
            if (pendingReview) await toggleFlag.mutateAsync(pendingReview);
          }}
          title={pendingReview?.nextEnabled ? 'Enable production feature?' : 'Disable production feature?'}
          description={
            pendingReview ? (
              <FeatureRolloutReview
                pending={pendingReview}
                unconfirmed={unconfirmedOutcome}
              />
            ) : (
              'Review the exact live rollout change before applying it.'
            )
          }
          confirmLabel={unconfirmedOutcome
            ? 'Reconcile reviewed operation'
            : pendingReview?.nextEnabled
              ? 'Enable reviewed feature'
              : 'Disable reviewed feature'}
          confirmationText={pendingReview?.surfaceLabel}
          confirmationHint={
            pendingReview ? `Type ${pendingReview.surfaceLabel} to confirm this production rollout change` : undefined
          }
          busy={toggleFlag.isPending}
          danger
        />
      </div>
    </AdminPage>
  );
}

function FeatureRolloutReview({
  pending,
  unconfirmed,
}: {
  pending: PendingRolloutReview;
  unconfirmed: UnconfirmedRollout | null;
}) {
  return (
    <div className="space-y-3 text-sm leading-6">
      <p>
        This changes the live rollout gate for <strong className="text-foreground">{pending.surfaceLabel}</strong>.
        Review the exact state and audience before applying it.
      </p>

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="rounded-lg border border-white/[0.08] bg-black/10 p-3">
          <span className="block text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Before</span>
          <strong className="mt-1 block text-foreground">{pending.baseline.enabled ? 'Enabled' : 'Disabled'}</strong>
        </div>
        <div className="rounded-lg border border-white/[0.08] bg-black/10 p-3">
          <span className="block text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">After</span>
          <strong className="mt-1 block text-foreground">{pending.nextEnabled ? 'Enabled' : 'Disabled'}</strong>
        </div>
      </div>

      <div className="rounded-lg border border-white/[0.08] bg-black/10 p-3 text-xs leading-5">
        <p><strong className="text-foreground">Flag:</strong> <code className="text-sky-100">{pending.baseline.key}</code></p>
        <p className="mt-1 text-muted-foreground">
          Audience: {pending.baseline.admins_only ? 'admins only' : 'eligible users'} · editions:{' '}
          {pending.baseline.edition_ids.length ? `${pending.baseline.edition_ids.length} restricted` : 'all'} · users:{' '}
          {pending.baseline.user_ids.length ? `${pending.baseline.user_ids.length} restricted` : 'all eligible'}
        </p>
        <p className="mt-1 text-muted-foreground">Canonical revision: {pending.expectedRevision}</p>
        <p className="mt-1 break-all text-muted-foreground">Operation: {pending.operationId}</p>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <Detail label="Depends on" value={pending.dependencyLabels.length ? pending.dependencyLabels.join(', ') : 'None'} />
        <Detail label="Used by" value={pending.dependentLabels.length ? pending.dependentLabels.join(', ') : 'No declared dependents'} />
      </div>

      {unconfirmed ? (
        <div className="rounded-lg border border-amber-300/25 bg-amber-300/10 p-3 text-xs leading-5 text-amber-100">
          <strong>Outcome not yet confirmed.</strong> {unconfirmed.message}
          {' '}This review remains locked to operation <code>{unconfirmed.operationId}</code>, so retrying reconciles the same operation instead of creating another rollout mutation.
        </div>
      ) : null}

      <p className="text-xs text-muted-foreground">
        Solaris binds this review to the canonical aggregate revision above. The Organizer server performs a fresh dependency preflight, while the canonical System command owns the required atomic dependency enforcement. This stacked cutover remains blocked until that System transaction serializes and validates related flags. Apply otherwise uses revision CAS plus an idempotent operation receipt, and retries reconcile the same operation before any new write.
      </p>
    </div>
  );
}

function FeatureRow({
  row,
  enabledKeys,
  busy,
  selected,
  onSelect,
  onToggle,
}: {
  row: FeatureFlagRow;
  enabledKeys: ReadonlySet<SolarisFeatureFlag>;
  busy: boolean;
  selected: boolean;
  onSelect: () => void;
  onToggle: () => void;
}) {
  const surface = studio2SurfaceFor(row.key);
  const decision = studio2RolloutDecision(row.key, row.enabled, enabledKeys);
  const blockingLabels = decision.blockingKeys.map((key) => studio2SurfaceFor(key).label);

  return (
    <div className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 lg:flex-row lg:items-center lg:justify-between">
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
          onClick={onSelect}
          aria-pressed={selected}
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
          onClick={onToggle}
          className="inline-flex min-h-10 items-center justify-center rounded-xl border border-white/[0.09] bg-white/[0.035] px-4 text-sm font-semibold transition-colors hover:bg-white/[0.07] disabled:cursor-not-allowed disabled:opacity-45"
        >
          {busy ? 'Preparing…' : rolloutButtonLabel(row.enabled, decision.reason)}
        </button>
      </div>
    </div>
  );
}

function FeatureDetail({ row, onClose }: { row: FeatureFlagRow; onClose: () => void }) {
  const surface = studio2SurfaceFor(row.key);
  const dependents = STUDIO2_PRODUCT_SURFACE_LIST.filter((candidate) => candidate.dependsOn?.includes(row.key));

  return (
    <AdminCard strong>
      <div className="flex items-start justify-between gap-3">
        <AdminCardHeader eyebrow="Feature detail" title={surface.label} />
        <button
          type="button"
          onClick={onClose}
          className="grid size-9 shrink-0 place-items-center rounded-xl border border-white/[0.08] text-muted-foreground hover:bg-white/[0.05] hover:text-foreground"
          aria-label="Close feature details"
        >
          <X className="size-4" />
        </button>
      </div>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">{surface.description}</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
        <Detail label="Rollout" value={rolloutStateSummary(surface.state, row.enabled)} />
        <Detail label="Type" value={studio2SurfaceStateLabel(surface.state)} />
        <Detail label="Audience" value={humanize(surface.audience)} />
        <Detail label="Revision" value={String(row.revision)} />
        <Detail label="Last updated" value={formatTimestamp(row.updated_at)} />
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

function humanize(value: string) {
  return value.split('_').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
}

function formatTimestamp(value: string) {
  if (!value) return 'Unknown';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}
