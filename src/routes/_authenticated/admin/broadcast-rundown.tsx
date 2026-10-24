import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import {
  CheckCircle2,
  Clock3,
  Lock,
  Play,
  Plus,
  Save,
  SkipForward,
  Trash2,
  Unlock,
} from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';

import { useAdminContext } from '@/components/admin/AdminContext';
import { SolarisReorderableList } from '@/components/interaction/SolarisReorderableList';
import { AdminDataView, type AdminDataColumn } from '@/components/admin/AdminDataView';
import { AdminPage } from '@/components/admin/AdminShell';
import {
  AdminCard,
  AdminCardHeader,
  AdminConfirmSheet,
  AdminEmptyState,
  AdminPageHeader,
  AdminStatus,
} from '@/components/admin/AdminUI';
import {
  featureSurfaceLinks,
  SolarisSurfaceSwitch,
} from '@/components/surfaces/SolarisSurfaceSwitch';
import { buildBroadcastRundown, type RundownSegment, type RundownSegmentStatus } from '@/lib/broadcast-rundown';
import { validateEditionCommandScope } from '@/lib/solaris-v6-edition-context';
import { useShows } from '@/lib/data';
import {
  buildStudio2BroadcastReadiness,
  createDefaultBroadcastRundown,
  loadStudio2BroadcastRundown,
  saveStudio2BroadcastRundown,
  setStudio2BroadcastRundownLock,
  transitionStudio2BroadcastSegment,
  type Studio2BroadcastMode,
  type Studio2BroadcastRundownConfig,
} from '@/lib/studio2-broadcast-rundown';

type ReviewedBroadcastContext = {
  editionId: string;
  editionLabel: string;
  showId: string;
  showName: string;
  revision: number;
};

type PendingStructureReview = ReviewedBroadcastContext & {
  config: Studio2BroadcastRundownConfig;
  reason: string;
};

type PendingLockReview = ReviewedBroadcastContext & {
  locked: boolean;
  reason: string;
};

type PendingSegmentReview = ReviewedBroadcastContext & {
  segment: RundownSegment;
  status: RundownSegmentStatus;
  reason: string;
};

type SegmentTransitionCommand = {
  segmentId: string;
  status: RundownSegmentStatus;
  reason: string;
  reviewedEditionId?: string;
  reviewedShowId?: string;
  reviewedRevision?: number;
  reviewedStatus?: RundownSegmentStatus;
};

export const Route = createFileRoute('/_authenticated/admin/broadcast-rundown')({
  head: () => ({
    meta: [
      { title: 'Broadcast Rundown — Solaris Organizer' },
      { name: 'robots', content: 'noindex, nofollow' },
    ],
  }),
  component: BroadcastRundownRoute,
});

function BroadcastRundownRoute() {
  const { editionId, showId } = useAdminContext();
  return <BroadcastRundownPage key={`${editionId || 'unscoped'}:${showId || 'no-show'}`} />;
}

function BroadcastRundownPage() {
  const {
    editionId,
    editionLabel,
    showId: contextShowId,
    setShowContext,
  } = useAdminContext();
  const showsQuery = useShows(editionId ?? undefined);
  const queryClient = useQueryClient();
  const shows = showsQuery.data ?? [];
  const selectedShow = shows.find((show) => show.id === contextShowId) ?? null;
  const showId = selectedShow?.id ?? '';
  const currentEditionLabel = editionLabel ?? 'Selected edition';
  const [mode, setMode] = useState<Studio2BroadcastMode>('production');
  const [draft, setDraft] = useState<Studio2BroadcastRundownConfig | null>(null);
  const [pendingStructureReview, setPendingStructureReview] = useState<PendingStructureReview | null>(null);
  const [pendingLockReview, setPendingLockReview] = useState<PendingLockReview | null>(null);
  const [pendingSegmentReview, setPendingSegmentReview] = useState<PendingSegmentReview | null>(null);

  useEffect(() => {
    if (showsQuery.isLoading || !contextShowId || selectedShow) return;
    setShowContext(null);
  }, [contextShowId, selectedShow, setShowContext, showsQuery.isLoading]);

  const rundownQuery = useQuery({
    queryKey: ['studio2-broadcast-rundown', editionId, showId],
    enabled: Boolean(editionId && selectedShow),
    queryFn: () => loadStudio2BroadcastRundown(showId),
  });

  useEffect(() => {
    if (!showId) {
      setDraft(null);
      return;
    }
    if (rundownQuery.isLoading) return;
    setDraft(rundownQuery.data ?? createDefaultBroadcastRundown());
  }, [rundownQuery.data, rundownQuery.isLoading, showId]);

  useEffect(() => {
    if (mode === 'production' && rundownQuery.data) setDraft(rundownQuery.data);
  }, [mode, rundownQuery.data]);

  useEffect(() => {
    setPendingStructureReview(null);
    setPendingLockReview(null);
    setPendingSegmentReview(null);
  }, [showId, mode]);

  const refreshRundown = async (targetShowId = showId) => {
    await queryClient.invalidateQueries({
      queryKey: ['studio2-broadcast-rundown', editionId, targetShowId],
    });
    await queryClient.invalidateQueries({ queryKey: ['shows'] });
  };

  function assertProductionEditionScope(
    reviewedEditionId = editionId,
    reviewedShowId = showId,
  ) {
    if (mode === 'rehearsal') return;

    const show = shows.find((candidate) => candidate.id === reviewedShowId) ?? null;
    const scope = validateEditionCommandScope({
      routeEditionId: editionId ?? null,
      commandEditionId: reviewedEditionId ?? null,
      entityEditionId: show?.edition_id ?? null,
      capabilityEditionId: null,
    });

    if (
      !editionId ||
      !reviewedEditionId ||
      editionId !== reviewedEditionId ||
      contextShowId !== reviewedShowId ||
      !show ||
      !scope.ok
    ) {
      const mismatch = !scope.ok && scope.mismatches.length
        ? ` (${scope.mismatches.join(', ')})`
        : '';
      throw Object.assign(
        new Error(
          `Organizer context changed before the broadcast command${mismatch}. Reload the canonical rundown before retrying.`,
        ),
        { status: 409 },
      );
    }
  }

  const saveMutation = useMutation({
    mutationFn: async (review: PendingStructureReview) => {
      if (mode !== 'production') {
        throw staleBroadcastReview('The rundown left Production mode while the structure review was open.');
      }
      assertProductionEditionScope(review.editionId, review.showId);
      if (review.config.revision !== review.revision) {
        throw staleBroadcastReview('The reviewed structure carries inconsistent revision evidence.');
      }
      const live = await loadStudio2BroadcastRundown(review.showId);
      const liveRevision = live?.revision ?? 0;
      if (liveRevision !== review.revision) {
        throw staleBroadcastReview('The canonical rundown revision changed while the structure review was open.');
      }
      return saveStudio2BroadcastRundown(
        review.showId,
        review.config,
        review.reason,
      );
    },
    onSuccess: async (config, review) => {
      setPendingStructureReview(null);
      setDraft(config);
      await refreshRundown(review.showId);
    },
    onError: () => setPendingStructureReview(null),
  });

  const lockMutation = useMutation({
    mutationFn: async ({
      editionId: reviewedEditionId,
      showId: reviewedShowId,
      revision,
      locked,
      reason,
    }: PendingLockReview) => {
      if (!showId || !draft) throw new Error('Select a show and load its rundown first.');
      assertProductionEditionScope(reviewedEditionId, reviewedShowId);
      const live = await loadStudio2BroadcastRundown(reviewedShowId);
      if (!live || live.revision !== revision) {
        throw staleBroadcastReview('The rundown revision changed while the lock review was open.');
      }
      return setStudio2BroadcastRundownLock(reviewedShowId, live, locked, reason);
    },
    onSuccess: async (config, review) => {
      setPendingLockReview(null);
      setDraft(config);
      await refreshRundown(review.showId);
    },
    onError: () => setPendingLockReview(null),
  });

  const transitionMutation = useMutation({
    mutationFn: async ({
      segmentId,
      status,
      reason,
      reviewedEditionId,
      reviewedShowId,
      reviewedRevision,
      reviewedStatus,
    }: SegmentTransitionCommand) => {
      if (!showId || !draft) throw new Error('Select a show and load its rundown first.');
      if (mode === 'rehearsal') {
        return transitionStudio2BroadcastSegment(showId, draft, segmentId, status, reason, mode);
      }
      if (!reviewedEditionId || !reviewedShowId || reviewedRevision == null || !reviewedStatus) {
        throw staleBroadcastReview('The reviewed Organizer context is no longer current.');
      }
      assertProductionEditionScope(reviewedEditionId, reviewedShowId);
      const live = await loadStudio2BroadcastRundown(reviewedShowId);
      const liveSegment = live?.segments.find((segment) => segment.id === segmentId) ?? null;
      if (!live || live.revision !== reviewedRevision || liveSegment?.status !== reviewedStatus) {
        throw staleBroadcastReview('The rundown or segment state changed while the transition review was open.');
      }
      return transitionStudio2BroadcastSegment(
        reviewedShowId,
        live,
        segmentId,
        status,
        reason,
        'production',
      );
    },
    onSuccess: async (config) => {
      setPendingSegmentReview(null);
      setDraft(config);
      if (mode === 'production') await refreshRundown();
    },
    onError: () => setPendingSegmentReview(null),
  });

  const calculated = useMemo(() => {
    if (!draft) return null;
    try {
      return buildBroadcastRundown(draft.startAt, draft.segments);
    } catch {
      return null;
    }
  }, [draft]);
  const readiness = useMemo(() => buildStudio2BroadcastReadiness(draft), [draft]);
  const structureLocked = mode === 'production' && Boolean(draft?.lockedAt);
  type TimingRow = NonNullable<typeof calculated>["segments"][number];
  const timingColumns = calculated ? [
    {
      key: 'number',
      header: '#',
      render: (_segment, index) => <span className="tabular-nums">{index + 1}</span>,
    },
    {
      key: 'segment',
      header: 'Segment',
      primary: true,
      render: (segment) => segment.label,
    },
    {
      key: 'planned',
      header: 'Planned',
      render: (segment) => <span className="tabular-nums">{formatClock(segment.plannedStartedAt)}</span>,
    },
    {
      key: 'estimated',
      header: 'Estimated',
      render: (segment) => <span className="tabular-nums">{formatClock(segment.estimatedStartedAt)}</span>,
    },
    {
      key: 'finish',
      header: 'Finish',
      render: (segment) => <span className="tabular-nums">{formatClock(segment.plannedCompletedAt)}</span>,
    },
    {
      key: 'drift',
      header: 'Drift',
      render: (segment) => <span className="tabular-nums">{formatDrift(segment.driftSeconds)}</span>,
    },
    {
      key: 'state',
      header: 'State',
      render: (segment) => <AdminStatus tone={statusTone(segment.status)}>{segment.status}</AdminStatus>,
    },
  ] satisfies readonly AdminDataColumn<TimingRow>[] : [];

  const updateSegment = (index: number, patch: Partial<RundownSegment>) => {
    if (structureLocked) return;
    setDraft((current) => current ? {
      ...current,
      segments: current.segments.map((segment, segmentIndex) => segmentIndex === index ? { ...segment, ...patch } : segment),
    } : current);
  };

  const addSegment = () => {
    if (structureLocked) return;
    setDraft((current) => {
      if (!current) return current;
      const sequence = current.segments.length + 1;
      return {
        ...current,
        segments: [...current.segments, {
          id: `segment-${Date.now()}-${sequence}`,
          label: `New segment ${sequence}`,
          status: 'planned',
          plannedDurationSeconds: 300,
        }],
      };
    });
  };

  const removeSegment = (index: number) => {
    if (structureLocked) return;
    setDraft((current) => current ? {
      ...current,
      segments: current.segments.filter((_, segmentIndex) => segmentIndex !== index),
    } : current);
  };

  const moveSegment = (fromIndex: number, toIndex: number) => {
    if (structureLocked || fromIndex === toIndex) return;
    setDraft((current) => {
      if (!current) return current;
      if (
        fromIndex < 0 ||
        toIndex < 0 ||
        fromIndex >= current.segments.length ||
        toIndex >= current.segments.length
      ) {
        return current;
      }
      const segments = [...current.segments];
      const [moved] = segments.splice(fromIndex, 1);
      if (!moved) return current;
      segments.splice(toIndex, 0, moved);
      return { ...current, segments };
    });
  };

  const reviewStructure = () => {
    if (!draft || !editionId || !selectedShow || mode !== 'production' || structureLocked) return;
    setPendingStructureReview({
      editionId,
      editionLabel: currentEditionLabel,
      showId: selectedShow.id,
      showName: selectedShow.name,
      revision: draft.revision,
      config: cloneRundownConfig(draft),
      reason: '',
    });
  };

  const changeLock = (locked: boolean) => {
    if (!draft || !editionId || mode !== 'production' || !selectedShow) return;
    setPendingLockReview({
      editionId,
      editionLabel: currentEditionLabel,
      showId: selectedShow.id,
      showName: selectedShow.name,
      revision: draft.revision,
      locked,
      reason: '',
    });
  };

  const transitionSegment = (segment: RundownSegment, status: RundownSegmentStatus) => {
    const action = `${segment.status} → ${status}`;
    if (mode === 'rehearsal') {
      transitionMutation.mutate({
        segmentId: segment.id,
        status,
        reason: `Rehearsal preview: ${action}`,
      });
      return;
    }
    if (!draft || !editionId || !selectedShow) return;
    setPendingSegmentReview({
      editionId,
      editionLabel: currentEditionLabel,
      showId: selectedShow.id,
      showName: selectedShow.name,
      revision: draft.revision,
      segment,
      status,
      reason: '',
    });
  };

  const mutationError = saveMutation.error ?? lockMutation.error ?? transitionMutation.error;

  if (!editionId) {
    return (
      <AdminPage>
        <div className="mx-auto max-w-[1500px] space-y-4">
          <AdminPageHeader
            eyebrow="Solaris Studio 2 · Broadcast operations"
            title="Broadcast Rundown"
            description="Plan, lock and execute the show against one canonical rundown. Production commands are revision-checked and audited; rehearsal transitions stay local and never write production state."
          />
          <AdminCard>
            <AdminEmptyState
              icon={Clock3}
              title="Choose an edition"
              description="Select the edition in the Organizer toolbar before loading or operating a broadcast rundown. Solaris never substitutes another edition for live production work."
            />
          </AdminCard>
        </div>
      </AdminPage>
    );
  }

  return (
    <AdminPage>
      <div className="mx-auto max-w-[1500px] space-y-4">
        <AdminPageHeader
          eyebrow="Solaris Studio 2 · Broadcast operations"
          title="Broadcast Rundown"
          description="Plan, lock and execute the show against one canonical rundown. Production commands are revision-checked and audited; rehearsal transitions stay local and never write production state."
        />

        <SolarisSurfaceSwitch
          label="Live show perspectives"
          links={featureSurfaceLinks({
            featureId: "live-show",
            current: "organizer",
            perspectives: ["public", "organizer", "diagnostic"],
          })}
        />

        <AdminCard strong>
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto] xl:items-end">
            <label className="space-y-1.5 text-sm">
              <span className="font-semibold">Show</span>
              <select
                value={showId}
                onChange={(event) => {
                  const nextShow = shows.find((show) => show.id === event.target.value) ?? null;
                  setShowContext(nextShow ? { id: nextShow.id, label: nextShow.name } : null);
                }}
                className="min-h-11 w-full rounded-xl border border-white/[0.09] bg-background px-3"
              >
                <option value="">Choose show…</option>
                {shows.map((show) => <option key={show.id} value={show.id}>{show.name}</option>)}
              </select>
            </label>

            <label className="space-y-1.5 text-sm">
              <span className="font-semibold">Planned start</span>
              <input
                type="datetime-local"
                value={draft ? toLocalInputValue(draft.startAt) : ''}
                disabled={structureLocked || !selectedShow}
                onChange={(event) => setDraft((current) => current ? { ...current, startAt: fromLocalInputValue(event.target.value) } : current)}
                className="min-h-11 w-full rounded-xl border border-white/[0.09] bg-background px-3 disabled:opacity-50"
              />
            </label>

            <div className="flex min-h-11 rounded-xl border border-white/[0.09] bg-background p-1">
              {(['production', 'rehearsal'] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setMode(value)}
                  className={`rounded-lg px-3 text-sm font-semibold ${mode === value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}
                >
                  {value === 'production' ? 'Production' : 'Rehearsal'}
                </button>
              ))}
            </div>

            <button
              type="button"
              disabled={!draft || !selectedShow || saveMutation.isPending || structureLocked || mode === 'rehearsal'}
              onClick={reviewStructure}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              <Save className="size-4" />
              {saveMutation.isPending ? 'Saving…' : 'Review structure'}
            </button>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {selectedShow ? <span>{selectedShow.kind} · {selectedShow.status}</span> : <span>No show selected</span>}
            {draft ? <span>· revision {draft.revision}</span> : null}
            {mode === 'rehearsal' ? <AdminStatus tone="info">simulation only</AdminStatus> : null}
            {draft?.lockedAt ? <AdminStatus tone="ready">locked</AdminStatus> : <AdminStatus tone="attention">unlocked</AdminStatus>}
          </div>
          {mode === 'rehearsal' ? (
            <p className="mt-3 rounded-xl border border-sky-300/20 bg-sky-300/[0.07] px-3 py-2 text-xs leading-5 text-muted-foreground">
              Rehearsal mode never calls a production mutation. Segment transitions are previewed only in this browser and reset from the canonical rundown when you return to Production.
            </p>
          ) : null}
          {mutationError ? <ErrorMessage error={mutationError} /> : null}
        </AdminCard>

        {showsQuery.isLoading || (selectedShow && rundownQuery.isLoading) ? (
          <AdminCard><p className="py-10 text-center text-sm text-muted-foreground">Loading broadcast rundown…</p></AdminCard>
        ) : showsQuery.error || rundownQuery.error ? (
          <AdminCard><AdminEmptyState icon={Clock3} title="Rundown unavailable" description={errorText(showsQuery.error ?? rundownQuery.error)} /></AdminCard>
        ) : !shows.length ? (
          <AdminCard><AdminEmptyState icon={Clock3} title="No shows in this edition" description="Create a show before building its broadcast rundown." /></AdminCard>
        ) : !selectedShow ? (
          <AdminCard><AdminEmptyState icon={Clock3} title="Choose a show" description="Select the exact show you intend to plan or operate. Solaris will bind that show into the Organizer context before any production command is available." /></AdminCard>
        ) : draft && calculated ? (
          <>
            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <Metric label="Readiness" value={readinessLabel(readiness.state)} tone={readinessTone(readiness.state)} />
              <Metric label="Segments" value={`${draft.segments.length}`} />
              <Metric label="Planned runtime" value={formatDuration(calculated.totalPlannedSeconds)} />
              <Metric label="Estimated finish" value={formatClock(calculated.estimatedFinishAt)} />
              <Metric label="Current drift" value={formatDrift(calculated.overallDriftSeconds)} tone={calculated.overallDriftSeconds === 0 ? 'ready' : 'attention'} />
            </section>

            <AdminCard>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <AdminCardHeader
                  eyebrow="Broadcast safety"
                  title={draft.lockedAt ? 'Rundown locked for execution' : 'Rundown still editable'}
                  description={draft.lockedAt
                    ? `Locked ${formatDateTime(draft.lockedAt)}. Structural edits are blocked; live segment commands remain available.`
                    : 'Lock the final structure before live execution. Lock/unlock actions require a reason and are audited.'}
                />
                {mode === 'production' ? (
                  draft.lockedAt ? (
                    <button type="button" onClick={() => changeLock(false)} disabled={lockMutation.isPending} className="admin-action-secondary">
                      <Unlock className="size-4" /> Unlock rundown
                    </button>
                  ) : (
                    <button type="button" onClick={() => changeLock(true)} disabled={lockMutation.isPending || readiness.blockers.length > 0} className="admin-action-primary">
                      <Lock className="size-4" /> Lock rundown
                    </button>
                  )
                ) : null}
              </div>
              {draft.lockReason ? <p className="mt-3 text-xs text-muted-foreground">Lock reason: {draft.lockReason}</p> : null}
              {readiness.blockers.length || readiness.warnings.length ? (
                <div className="mt-4 grid gap-2 md:grid-cols-2">
                  {readiness.blockers.map((item) => <Notice key={item} tone="blocked">{item}</Notice>)}
                  {readiness.warnings.map((item) => <Notice key={item} tone="attention">{item}</Notice>)}
                </div>
              ) : <Notice tone="ready">No rundown readiness issues are currently detected.</Notice>}
            </AdminCard>

            <AdminCard>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <AdminCardHeader eyebrow="Timeline" title="Show segments" description="Structure edits are separate from live lifecycle commands." />
                <button
                  type="button"
                  onClick={addSegment}
                  disabled={structureLocked}
                  className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/[0.09] bg-white/[0.035] px-3 text-sm font-semibold hover:bg-white/[0.07] disabled:opacity-40"
                >
                  <Plus className="size-4" /> Add segment
                </button>
              </div>

              <div className="mt-4">
                {draft.segments.length === 0 ? (
                  <AdminEmptyState icon={Clock3} title="No segments" description="Add the first segment to begin planning this show." />
                ) : (
                  <SolarisReorderableList
                    disabled={structureLocked}
                    onMove={moveSegment}
                    items={draft.segments.map((segment, index) => {
                      const timing = calculated.segments[index];
                      return {
                        id: segment.id,
                        ariaLabel: segment.label,
                        content: (
                          <article className="rounded-xl border border-white/[0.07] bg-black/10 p-3">
                            <div className="grid gap-3 xl:grid-cols-[90px_minmax(0,1fr)_145px_120px_auto] xl:items-center">
                              <div>
                                <p className="text-xs text-muted-foreground">Start</p>
                                <p className="mt-1 text-sm font-semibold tabular-nums">{timing ? formatClock(timing.estimatedStartedAt) : '—'}</p>
                              </div>
                              <label className="space-y-1 text-sm">
                                <span className="text-xs text-muted-foreground">Segment</span>
                                <input
                                  value={segment.label}
                                  disabled={structureLocked}
                                  onChange={(event) => updateSegment(index, { label: event.target.value })}
                                  className="min-h-10 w-full rounded-lg border border-white/[0.08] bg-background px-3 font-semibold disabled:opacity-50"
                                />
                              </label>
                              <label className="space-y-1 text-sm">
                                <span className="text-xs text-muted-foreground">Duration (min)</span>
                                <input
                                  type="number"
                                  min="1"
                                  step="0.5"
                                  value={segment.plannedDurationSeconds / 60}
                                  disabled={structureLocked}
                                  onChange={(event) => updateSegment(index, { plannedDurationSeconds: Math.max(30, Math.round(Number(event.target.value || 0) * 60)) })}
                                  className="min-h-10 w-full rounded-lg border border-white/[0.08] bg-background px-3 disabled:opacity-50"
                                />
                              </label>
                              <div>
                                <p className="text-xs text-muted-foreground">Status</p>
                                <div className="mt-1"><AdminStatus tone={statusTone(segment.status)}>{segment.status}</AdminStatus></div>
                              </div>
                              <div className="flex flex-wrap justify-end gap-1">
                                {segment.status === 'planned' ? <CommandButton label="Mark ready" onClick={() => transitionSegment(segment, 'ready')}><CheckCircle2 className="size-4" /></CommandButton> : null}
                                {segment.status === 'ready' ? <CommandButton label="Go live" onClick={() => transitionSegment(segment, 'live')}><Play className="size-4" /></CommandButton> : null}
                                {segment.status === 'live' ? <CommandButton label="Complete" onClick={() => transitionSegment(segment, 'completed')}><CheckCircle2 className="size-4" /></CommandButton> : null}
                                {['planned', 'ready', 'live'].includes(segment.status) ? <CommandButton label="Skip" onClick={() => transitionSegment(segment, 'skipped')}><SkipForward className="size-4" /></CommandButton> : null}
                                <IconButton label="Remove" disabled={structureLocked} onClick={() => removeSegment(index)}><Trash2 className="size-4" /></IconButton>
                              </div>
                            </div>
                          </article>
                        ),
                      };
                    })}
                  />
                )}
              </div>
            </AdminCard>

            <AdminCard>
              <AdminCardHeader eyebrow="Timing" title="Estimated broadcast clock" />
              <AdminDataView
                className="mt-4"
                rows={calculated.segments}
                columns={timingColumns}
                rowKey={(segment) => segment.id}
                ariaLabel="Estimated broadcast clock"
              />
            </AdminCard>
          </>
        ) : null}

        <AdminConfirmSheet
          open={Boolean(pendingStructureReview)}
          onClose={() => {
            if (!saveMutation.isPending) setPendingStructureReview(null);
          }}
          onConfirm={async () => {
            if (!pendingStructureReview) return;
            await saveMutation.mutateAsync({
              ...pendingStructureReview,
              reason: pendingStructureReview.reason.trim(),
            });
          }}
          title="Save this production rundown structure?"
          description={pendingStructureReview ? (
            <div className="space-y-3 text-xs leading-relaxed text-muted-foreground">
              <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-3">
                <p className="font-semibold text-foreground">{pendingStructureReview.editionLabel} · {pendingStructureReview.showName}</p>
                <p className="mt-1">Reviewed rundown revision {pendingStructureReview.revision}</p>
                <p className="mt-2"><span className="font-semibold text-foreground">Planned start:</span> {formatDateTime(pendingStructureReview.config.startAt)}</p>
                <p className="mt-1"><span className="font-semibold text-foreground">Segments:</span> {pendingStructureReview.config.segments.length}</p>
              </div>
              <label className="block">
                <span className="font-semibold text-foreground">Operator reason</span>
                <textarea
                  value={pendingStructureReview.reason}
                  onChange={(event) => setPendingStructureReview((current) => current ? { ...current, reason: event.target.value } : current)}
                  rows={3}
                  autoFocus
                  placeholder="Why is this production rundown structure changing?"
                  className="mt-2 w-full rounded-xl border border-white/[0.1] bg-white/[0.035] p-3 text-sm text-foreground outline-none focus:border-sky-200/30"
                />
                <span className="mt-1 block text-[11px]">At least 5 characters. The reason is stored with the audited command.</span>
              </label>
              <p>Solaris freezes this exact structure for review, re-reads the canonical rundown immediately before saving, and refuses the command if the edition, show or revision changed.</p>
            </div>
          ) : null}
          confirmLabel="Save reviewed structure"
          busy={saveMutation.isPending}
          confirmDisabled={!pendingStructureReview || pendingStructureReview.reason.trim().length < 5}
        />

        <AdminConfirmSheet
          open={Boolean(pendingLockReview)}
          onClose={() => {
            if (!lockMutation.isPending) setPendingLockReview(null);
          }}
          onConfirm={async () => {
            if (!pendingLockReview) return;
            await lockMutation.mutateAsync({
              ...pendingLockReview,
              reason: pendingLockReview.reason.trim(),
            });
          }}
          title={pendingLockReview?.locked ? 'Lock this rundown for execution?' : 'Unlock this rundown for editing?'}
          description={pendingLockReview ? (
            <div className="space-y-3 text-xs leading-relaxed text-muted-foreground">
              <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-3">
                <p className="font-semibold text-foreground">{pendingLockReview.editionLabel} · {pendingLockReview.showName}</p>
                <p className="mt-1">Reviewed rundown revision {pendingLockReview.revision}</p>
              </div>
              <label className="block">
                <span className="font-semibold text-foreground">Operator reason</span>
                <textarea
                  value={pendingLockReview.reason}
                  onChange={(event) => setPendingLockReview((current) => current ? { ...current, reason: event.target.value } : current)}
                  rows={3}
                  autoFocus
                  placeholder="Why is this production lock state changing?"
                  className="mt-2 w-full rounded-xl border border-white/[0.1] bg-white/[0.035] p-3 text-sm text-foreground outline-none focus:border-sky-200/30"
                />
                <span className="mt-1 block text-[11px]">At least 5 characters. The reason is stored with the audited command.</span>
              </label>
              {pendingLockReview.locked ? (
                <p>Locking freezes structural edits for this rundown while keeping valid live segment commands available. Solaris re-reads the canonical rundown and refuses the command if the reviewed revision changed.</p>
              ) : (
                <p>Unlocking re-enables structural editing. Solaris re-reads the canonical rundown and refuses the command if the reviewed revision changed.</p>
              )}
            </div>
          ) : null}
          confirmLabel={pendingLockReview?.locked ? 'Lock rundown' : 'Unlock rundown'}
          busy={lockMutation.isPending}
          danger={Boolean(pendingLockReview && !pendingLockReview.locked)}
          confirmDisabled={!pendingLockReview || pendingLockReview.reason.trim().length < 5}
        />

        <AdminConfirmSheet
          open={Boolean(pendingSegmentReview)}
          onClose={() => {
            if (!transitionMutation.isPending) setPendingSegmentReview(null);
          }}
          onConfirm={async () => {
            if (!pendingSegmentReview) return;
            await transitionMutation.mutateAsync({
              segmentId: pendingSegmentReview.segment.id,
              status: pendingSegmentReview.status,
              reason: pendingSegmentReview.reason.trim(),
              reviewedEditionId: pendingSegmentReview.editionId,
              reviewedShowId: pendingSegmentReview.showId,
              reviewedRevision: pendingSegmentReview.revision,
              reviewedStatus: pendingSegmentReview.segment.status,
            });
          }}
          title={pendingSegmentReview ? `${pendingSegmentReview.segment.label}: ${pendingSegmentReview.segment.status} → ${pendingSegmentReview.status}?` : 'Review broadcast transition'}
          description={pendingSegmentReview ? (
            <div className="space-y-3 text-xs leading-relaxed text-muted-foreground">
              <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-3">
                <p className="font-semibold text-foreground">{pendingSegmentReview.editionLabel} · {pendingSegmentReview.showName}</p>
                <p className="mt-1">Reviewed rundown revision {pendingSegmentReview.revision}</p>
                <p className="mt-2"><span className="font-semibold text-foreground">Segment:</span> {pendingSegmentReview.segment.label}</p>
                <p className="mt-1"><span className="font-semibold text-foreground">Transition:</span> {pendingSegmentReview.segment.status} → {pendingSegmentReview.status}</p>
              </div>
              <label className="block">
                <span className="font-semibold text-foreground">Operator reason</span>
                <textarea
                  value={pendingSegmentReview.reason}
                  onChange={(event) => setPendingSegmentReview((current) => current ? { ...current, reason: event.target.value } : current)}
                  rows={3}
                  autoFocus
                  placeholder="Why is this live rundown state changing?"
                  className="mt-2 w-full rounded-xl border border-white/[0.1] bg-white/[0.035] p-3 text-sm text-foreground outline-none focus:border-sky-200/30"
                />
                <span className="mt-1 block text-[11px]">At least 5 characters. The reason is stored with the audited command.</span>
              </label>
              <p>This changes production rundown state and is audited. Solaris re-reads the canonical rundown and refuses the command if either the reviewed revision or segment state changed.</p>
            </div>
          ) : null}
          confirmLabel="Apply production transition"
          busy={transitionMutation.isPending}
          danger={pendingSegmentReview?.status === 'skipped'}
          confirmDisabled={!pendingSegmentReview || pendingSegmentReview.reason.trim().length < 5}
        />
      </div>
    </AdminPage>
  );
}

function cloneRundownConfig(config: Studio2BroadcastRundownConfig): Studio2BroadcastRundownConfig {
  return {
    ...config,
    segments: config.segments.map((segment) => ({ ...segment })),
  };
}

function Metric({ label, value, tone = 'neutral' }: { label: string; value: string; tone?: 'neutral' | 'ready' | 'attention' | 'blocked' }) {
  return (
    <AdminCard>
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
      <div className="mt-2 flex items-center justify-between gap-2"><p className="text-2xl font-bold">{value}</p>{tone !== 'neutral' ? <AdminStatus tone={tone}>{tone}</AdminStatus> : null}</div>
    </AdminCard>
  );
}

function Notice({ tone, children }: { tone: 'ready' | 'attention' | 'blocked'; children: ReactNode }) {
  return <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] px-3 py-2 text-sm"><AdminStatus tone={tone}>{tone}</AdminStatus><span className="ml-2 text-muted-foreground">{children}</span></div>;
}

function IconButton({ label, disabled = false, onClick, children }: { label: string; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return <button type="button" aria-label={label} disabled={disabled} onClick={onClick} className="grid size-10 place-items-center rounded-lg border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.07] disabled:opacity-30">{children}</button>;
}

function CommandButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return <button type="button" title={label} aria-label={label} onClick={onClick} className="grid size-10 place-items-center rounded-lg border border-sky-300/20 bg-sky-300/[0.07] hover:bg-sky-300/[0.13]">{children}</button>;
}

function statusTone(status: RundownSegment['status']): 'neutral' | 'info' | 'attention' | 'ready' {
  if (status === 'completed') return 'ready';
  if (status === 'live') return 'attention';
  if (status === 'ready') return 'info';
  return 'neutral';
}

function readinessTone(state: 'ready' | 'attention' | 'blocked'): 'ready' | 'attention' | 'blocked' {
  return state;
}

function readinessLabel(state: 'ready' | 'attention' | 'blocked') {
  if (state === 'ready') return 'Ready';
  if (state === 'blocked') return 'Blocked';
  return 'Attention';
}

function formatDuration(seconds: number) {
  const minutes = Math.round(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return hours ? `${hours}h ${remainder}m` : `${remainder}m`;
}

function formatClock(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

function formatDrift(seconds: number) {
  if (seconds === 0) return 'On time';
  const sign = seconds > 0 ? '+' : '−';
  return `${sign}${Math.abs(Math.round(seconds / 60))}m`;
}

function toLocalInputValue(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return shifted.toISOString().slice(0, 16);
}

function fromLocalInputValue(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function staleBroadcastReview(message: string) {
  return Object.assign(new Error(`${message} Nothing was changed. Reload the canonical rundown and review the command again.`), { status: 409 });
}

function errorText(error: unknown) {
  return error instanceof Error && error.message ? error.message : 'The broadcast rundown could not be loaded.';
}

function ErrorMessage({ error }: { error: unknown }) {
  return <div className="mt-3 rounded-xl border border-red-300/25 bg-red-300/10 px-4 py-3 text-sm text-red-100">{errorText(error)}</div>;
}
