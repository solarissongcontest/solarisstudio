import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { AlertTriangle, ExternalLink, Images, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import { useAdminContext } from '@/components/admin/AdminContext';
import { AdminPage } from '@/components/admin/AdminShell';
import { AdminCard, AdminEmptyState, AdminPageHeader, AdminSheet, AdminStatus } from '@/components/admin/AdminUI';
import { useCountries, useEditions } from '@/lib/data';
import { MEDIA_ASSET_TYPES, type MediaAssetType } from '@/lib/media-asset-vault';
import { loadStudio2CountryCockpit } from '@/lib/studio2-country-cockpit';
import {
  STUDIO2_MEDIA_ASSET_STATES,
  buildStudio2MediaAssetInventory,
  listStudio2MediaAssetReviews,
  reviewStudio2MediaAssets,
  summarizeStudio2MediaAssets,
  type Studio2MediaAssetItem,
  type Studio2MediaAssetState,
  type Studio2MediaReviewDecision,
} from '@/lib/studio2-media-assets';

type MediaSearch = {
  q?: string;
  status?: 'all' | Studio2MediaAssetState;
  type?: 'all' | MediaAssetType;
  country?: string;
  asset?: string;
};

export const Route = createFileRoute('/_authenticated/admin/media-assets')({
  validateSearch: (search: Record<string, unknown>): MediaSearch => ({
    q: typeof search.q === 'string' ? search.q : undefined,
    status: search.status === 'all' || STUDIO2_MEDIA_ASSET_STATES.includes(search.status as Studio2MediaAssetState)
      ? search.status as MediaSearch['status']
      : undefined,
    type: search.type === 'all' || MEDIA_ASSET_TYPES.includes(search.type as MediaAssetType)
      ? search.type as MediaSearch['type']
      : undefined,
    country: typeof search.country === 'string' ? search.country : undefined,
    asset: typeof search.asset === 'string' ? search.asset : undefined,
  }),
  head: () => ({
    meta: [
      { title: 'Media assets — Solaris Organizer' },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: MediaAssetsPage,
});

function MediaAssetsPage() {
  const { editionId } = useAdminContext();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const queryClient = useQueryClient();
  const editionsQuery = useEditions();
  const countriesQuery = useCountries();
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => new Set());
  const [reviewReason, setReviewReason] = useState('');

  const editions = editionsQuery.data ?? [];
  const selectedEdition = editions.find((edition) => edition.id === editionId)
    ?? [...editions].sort((a, b) => (b.edition_number ?? -1) - (a.edition_number ?? -1))[0]
    ?? null;
  const resolvedEditionId = selectedEdition?.id ?? '';

  const cockpitQuery = useQuery({
    queryKey: ['studio2-country-cockpit', resolvedEditionId || 'none'],
    enabled: Boolean(resolvedEditionId),
    queryFn: () => loadStudio2CountryCockpit(resolvedEditionId),
    staleTime: 20_000,
  });
  const reviewsQuery = useQuery({
    queryKey: ['studio2-media-asset-reviews', resolvedEditionId || 'none'],
    enabled: Boolean(resolvedEditionId),
    queryFn: () => listStudio2MediaAssetReviews(resolvedEditionId),
    staleTime: 10_000,
  });

  const inventory = useMemo(() => selectedEdition ? buildStudio2MediaAssetInventory({
    edition: selectedEdition,
    countries: countriesQuery.data ?? [],
    cockpits: cockpitQuery.data ?? [],
    reviews: reviewsQuery.data ?? [],
  }) : [], [selectedEdition, countriesQuery.data, cockpitQuery.data, reviewsQuery.data]);

  const normalizedQuery = (search.q ?? '').trim().toLocaleLowerCase();
  const statusFilter = search.status ?? 'all';
  const typeFilter = search.type ?? 'all';
  const countryFilter = search.country ?? 'all';
  const filtered = inventory.filter((item) => {
    if (statusFilter !== 'all' && item.state !== statusFilter) return false;
    if (typeFilter !== 'all' && item.assetType !== typeFilter) return false;
    if (countryFilter !== 'all' && item.countryId !== countryFilter) return false;
    if (!normalizedQuery) return true;
    return [item.title, item.countryName, item.entryLabel, item.assetType]
      .filter(Boolean)
      .some((value) => String(value).toLocaleLowerCase().includes(normalizedQuery));
  });
  const selectedAsset = inventory.find((item) => item.assetKey === search.asset) ?? null;
  const summary = summarizeStudio2MediaAssets(inventory);
  const selectedItems = inventory.filter((item) => selectedKeys.has(item.assetKey));
  const reviewableSelected = selectedItems.filter((item) => Boolean(item.sourceFingerprint) && !item.processing);
  const canApproveSelected = reviewableSelected.length === selectedItems.length
    && reviewableSelected.every((item) => !item.validation.some((check) => check.level === 'blocked'));
  const error = editionsQuery.error ?? countriesQuery.error ?? cockpitQuery.error ?? reviewsQuery.error;

  const reviewMutation = useMutation({
    mutationFn: async ({ decision }: { decision: Studio2MediaReviewDecision }) => {
      if (!selectedEdition) throw new Error('No edition is selected.');
      if (!reviewableSelected.length || reviewableSelected.length !== selectedItems.length) {
        throw new Error('Only uploaded assets that are not processing can be reviewed.');
      }
      if (decision === 'approved' && !canApproveSelected) {
        throw new Error('Resolve blocked validation checks before approving these assets.');
      }
      return reviewStudio2MediaAssets({
        editionId: selectedEdition.id,
        reviews: reviewableSelected.map((item) => ({
          assetKey: item.assetKey,
          assetType: item.assetType,
          countryId: item.countryId,
          entryId: item.entryId,
          sourceFingerprint: item.sourceFingerprint!,
          decision,
        })),
        reason: reviewReason,
      });
    },
    onSuccess: async (_rows, variables) => {
      await queryClient.invalidateQueries({ queryKey: ['studio2-media-asset-reviews', resolvedEditionId] });
      toast.success(variables.decision === 'approved' ? 'Media assets approved.' : 'Media assets marked invalid.');
      setSelectedKeys(new Set());
      setReviewReason('');
    },
    onError: (mutationError) => toast.error(errorText(mutationError)),
  });

  function updateSearch(patch: Partial<MediaSearch>) {
    void navigate({
      search: (previous) => ({ ...previous, ...patch }),
      replace: true,
    });
  }

  function toggleSelection(assetKey: string) {
    setSelectedKeys((current) => {
      const next = new Set(current);
      if (next.has(assetKey)) next.delete(assetKey);
      else next.add(assetKey);
      return next;
    });
  }

  function selectVisible() {
    const reviewable = filtered.filter((item) => item.sourceFingerprint && !item.processing);
    setSelectedKeys(new Set(reviewable.map((item) => item.assetKey)));
  }

  return (
    <AdminPage>
      <div className="mx-auto max-w-[1500px] space-y-4">
        <AdminPageHeader
          eyebrow="Solaris Studio 2 · Media operations"
          title="Media assets"
          description="One operational view over canonical edition, country and entry media. Validation is derived in the media service; organizer review decisions are an audited overlay and never replace the source asset."
          actions={
            <div className="flex flex-wrap gap-2">
              <a href="/admin/countries" className="admin-action-secondary">Country cockpit <ExternalLink className="size-4" /></a>
              <a href="/admin/submission-versions" className="admin-action-secondary">Submission history <ExternalLink className="size-4" /></a>
            </div>
          }
        />

        {!selectedEdition && !editionsQuery.isLoading ? (
          <AdminCard><AdminEmptyState icon={Images} title="No edition selected" description="Select an edition before reviewing media operations." /></AdminCard>
        ) : editionsQuery.isLoading || countriesQuery.isLoading || cockpitQuery.isLoading || reviewsQuery.isLoading ? (
          <AdminCard><p className="py-12 text-center text-sm text-muted-foreground">Building media inventory…</p></AdminCard>
        ) : error ? (
          <AdminCard><AdminEmptyState icon={AlertTriangle} title="Media operations could not load" description={errorText(error)} /></AdminCard>
        ) : (
          <>
            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
              <Metric label="Assets" value={summary.total} tone="neutral" />
              <Metric label="Approved" value={summary.counts.approved} tone="ready" />
              <Metric label="Valid" value={summary.counts.valid} tone="info" />
              <Metric label="Processing" value={summary.counts.processing} tone="attention" />
              <Metric label="Needs review" value={summary.counts.superseded + summary.counts.uploaded} tone="attention" />
              <Metric label="Blocking" value={summary.blocking} tone={summary.blocking ? 'blocked' : 'ready'} />
            </section>

            <AdminCard>
              <div className="grid gap-3 lg:grid-cols-[1fr_180px_210px_220px]">
                <label className="relative block">
                  <span className="sr-only">Search media assets</span>
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <input value={search.q ?? ''} onChange={(event) => updateSearch({ q: event.target.value || undefined })} className="admin-input w-full pl-9" placeholder="Search country, entry or asset" />
                </label>
                <select value={statusFilter} onChange={(event) => updateSearch({ status: event.target.value as MediaSearch['status'] })} className="admin-input w-full" aria-label="Filter media status">
                  <option value="all">All states</option>
                  {STUDIO2_MEDIA_ASSET_STATES.map((state) => <option key={state} value={state}>{stateLabel(state)}</option>)}
                </select>
                <select value={typeFilter} onChange={(event) => updateSearch({ type: event.target.value as MediaSearch['type'] })} className="admin-input w-full" aria-label="Filter asset type">
                  <option value="all">All asset classes</option>
                  {MEDIA_ASSET_TYPES.map((type) => <option key={type} value={type}>{assetTypeLabel(type)}</option>)}
                </select>
                <select value={countryFilter} onChange={(event) => updateSearch({ country: event.target.value === 'all' ? undefined : event.target.value })} className="admin-input w-full" aria-label="Filter country">
                  <option value="all">All countries</option>
                  {(cockpitQuery.data ?? []).map((row) => <option key={row.context.countryId} value={row.context.countryId}>{row.context.countryName}</option>)}
                </select>
              </div>
            </AdminCard>

            <AdminCard>
              <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
                <div>
                  <p className="text-sm font-semibold">Bulk review</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">Review decisions apply only to the exact canonical source loaded now. If a delegation replaces the source later, the old decision becomes superseded and the replacement must be reviewed again.</p>
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row xl:max-w-3xl">
                  <input value={reviewReason} onChange={(event) => setReviewReason(event.target.value)} className="admin-input min-w-0 flex-1" placeholder="Review reason (required)" />
                  <button type="button" className="admin-action-secondary" onClick={selectVisible}>Select visible</button>
                  <button type="button" className="admin-action-secondary" onClick={() => setSelectedKeys(new Set())} disabled={!selectedKeys.size}>Clear</button>
                  <button type="button" className="admin-action-primary" disabled={!selectedKeys.size || reviewReason.trim().length < 5 || !canApproveSelected || reviewMutation.isPending} onClick={() => reviewMutation.mutate({ decision: 'approved' })}>Approve selected</button>
                  <button type="button" className="admin-action-secondary" disabled={!selectedKeys.size || reviewReason.trim().length < 5 || reviewMutation.isPending} onClick={() => reviewMutation.mutate({ decision: 'invalid' })}>Mark invalid</button>
                </div>
              </div>
              {selectedKeys.size ? <p className="mt-3 text-xs text-muted-foreground">{selectedKeys.size} selected · {reviewableSelected.length} reviewable</p> : null}
            </AdminCard>

            <AdminCard className="!p-0 overflow-hidden">
              {filtered.length ? (
                <div className="overflow-x-auto">
                  <table className="min-w-[1100px] w-full text-left text-sm">
                    <thead className="border-b border-white/[0.07] bg-white/[0.018] text-[11px] uppercase tracking-[0.11em] text-muted-foreground">
                      <tr>
                        <th className="w-12 px-4 py-3"><span className="sr-only">Select</span></th>
                        <th className="px-3 py-3">Asset</th>
                        <th className="px-3 py-3">Country / entry</th>
                        <th className="px-3 py-3">Class</th>
                        <th className="px-3 py-3">State</th>
                        <th className="px-3 py-3">Validation</th>
                        <th className="px-4 py-3 text-right">Detail</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.06]">
                      {filtered.map((item) => {
                        const reviewable = Boolean(item.sourceFingerprint) && !item.processing;
                        return (
                          <tr key={item.assetKey} className="hover:bg-white/[0.02]">
                            <td className="px-4 py-4">
                              <input type="checkbox" checked={selectedKeys.has(item.assetKey)} disabled={!reviewable} onChange={() => toggleSelection(item.assetKey)} aria-label={`Select ${item.title}`} />
                            </td>
                            <td className="px-3 py-4">
                              <p className="font-semibold">{item.title}</p>
                              <p className="mt-1 max-w-[330px] truncate text-xs text-muted-foreground">{item.sourceUrl ?? (item.required ? 'Required source not supplied' : 'No source supplied')}</p>
                            </td>
                            <td className="px-3 py-4">
                              <p>{item.countryName ?? selectedEdition?.name ?? 'Edition'}</p>
                              {item.entryLabel ? <p className="mt-1 max-w-[260px] truncate text-xs text-muted-foreground">{item.entryLabel}</p> : null}
                            </td>
                            <td className="px-3 py-4">{assetTypeLabel(item.assetType)}</td>
                            <td className="px-3 py-4"><AdminStatus tone={stateTone(item.state)}>{stateLabel(item.state)}</AdminStatus></td>
                            <td className="px-3 py-4">{validationSummary(item)}</td>
                            <td className="px-4 py-4 text-right"><button type="button" className="admin-action-secondary" onClick={() => updateSearch({ asset: item.assetKey })}>Inspect</button></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : <AdminEmptyState icon={Images} title="No media assets match" description="Adjust the search, state, class or country filter." />}
            </AdminCard>
          </>
        )}

        <MediaAssetSheet asset={selectedAsset} reviews={(reviewsQuery.data ?? []).filter((review) => review.assetKey === selectedAsset?.assetKey)} onClose={() => updateSearch({ asset: undefined })} />
      </div>
    </AdminPage>
  );
}

function MediaAssetSheet({ asset, reviews, onClose }: { asset: Studio2MediaAssetItem | null; reviews: Awaited<ReturnType<typeof listStudio2MediaAssetReviews>>; onClose: () => void }) {
  return (
    <AdminSheet open={Boolean(asset)} onClose={onClose} title={asset?.title ?? 'Media asset'} description={asset ? `${assetTypeLabel(asset.assetType)} · ${stateLabel(asset.state)}` : undefined}>
      {asset ? (
        <div className="space-y-5">
          <section>
            <h3 className="text-sm font-semibold">Canonical source</h3>
            <div className="mt-2 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
              <div className="flex items-center justify-between gap-3"><span className="text-xs text-muted-foreground">Current state</span><AdminStatus tone={stateTone(asset.state)}>{stateLabel(asset.state)}</AdminStatus></div>
              <p className="mt-3 break-all text-sm">{asset.sourceUrl ?? 'No source supplied.'}</p>
              {asset.sourceUrl ? <a href={asset.sourceUrl} target="_blank" rel="noreferrer" className="admin-action-secondary mt-3 inline-flex">Open source <ExternalLink className="size-4" /></a> : null}
              {asset.sourceUpdatedAt ? <p className="mt-3 text-xs text-muted-foreground">Canonical entry updated {formatTimestamp(asset.sourceUpdatedAt)}</p> : null}
            </div>
          </section>

          <section>
            <h3 className="text-sm font-semibold">Validation evidence</h3>
            <div className="mt-2 space-y-2">
              {asset.validation.map((check) => (
                <div key={check.id} className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
                  <div className="flex items-center justify-between gap-2"><p className="font-semibold">{check.label}</p><AdminStatus tone={check.level === 'pass' ? 'ready' : check.level === 'blocked' ? 'blocked' : 'attention'}>{check.level}</AdminStatus></div>
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">{check.message}</p>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h3 className="text-sm font-semibold">Review history</h3>
            {reviews.length ? (
              <div className="mt-2 space-y-2">
                {reviews.map((review) => (
                  <div key={review.id} className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
                    <div className="flex items-center justify-between gap-2"><p className="font-semibold">{review.decision === 'approved' ? 'Approved' : 'Marked invalid'}</p><AdminStatus tone={review.decision === 'approved' && !review.supersededAt ? 'ready' : review.decision === 'invalid' && !review.supersededAt ? 'blocked' : 'attention'}>{review.supersededAt ? 'superseded' : review.decision}</AdminStatus></div>
                    <p className="mt-1 text-xs text-muted-foreground">{formatTimestamp(review.reviewedAt)} · {review.reviewedByName ?? review.reviewedBy}</p>
                    <p className="mt-2 text-xs leading-5 text-muted-foreground">{review.reason}</p>
                    {review.supersededAt ? <p className="mt-2 text-xs text-muted-foreground">Superseded {formatTimestamp(review.supersededAt)}</p> : null}
                  </div>
                ))}
              </div>
            ) : <p className="mt-2 text-sm text-muted-foreground">No organizer review has been recorded for this asset.</p>}
          </section>
        </div>
      ) : null}
    </AdminSheet>
  );
}

function Metric({ label, value, tone }: { label: string; value: number; tone: 'neutral' | 'ready' | 'attention' | 'blocked' | 'info' }) {
  return <AdminCard><p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</p><div className="mt-2 flex items-end justify-between gap-2"><p className="text-2xl font-bold">{value}</p><AdminStatus tone={tone}>{tone}</AdminStatus></div></AdminCard>;
}

function validationSummary(item: Studio2MediaAssetItem) {
  const blocked = item.validation.filter((check) => check.level === 'blocked').length;
  const warning = item.validation.filter((check) => check.level === 'warning').length;
  if (blocked) return `${blocked} blocked check${blocked === 1 ? '' : 's'}`;
  if (warning) return `${warning} warning${warning === 1 ? '' : 's'}`;
  return item.validation.length ? 'Checks pass' : 'Awaiting source';
}

function stateTone(state: Studio2MediaAssetState): 'neutral' | 'ready' | 'attention' | 'blocked' | 'info' {
  if (state === 'approved' || state === 'valid') return 'ready';
  if (state === 'invalid' || state === 'required') return 'blocked';
  if (state === 'processing' || state === 'superseded') return 'attention';
  if (state === 'uploaded') return 'info';
  return 'neutral';
}

function stateLabel(state: Studio2MediaAssetState) {
  return state.charAt(0).toUpperCase() + state.slice(1);
}

function assetTypeLabel(type: MediaAssetType) {
  return type.split('_').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
}

function formatTimestamp(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function errorText(error: unknown) {
  return error instanceof Error ? error.message : 'An unknown error occurred.';
}
