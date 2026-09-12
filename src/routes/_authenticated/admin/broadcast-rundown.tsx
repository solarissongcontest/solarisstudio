import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import {
  ArrowDown,
  ArrowUp,
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
import { AdminPage } from '@/components/admin/AdminShell';
import {
  AdminCard,
  AdminCardHeader,
  AdminEmptyState,
  AdminPageHeader,
  AdminStatus,
} from '@/components/admin/AdminUI';
import { buildBroadcastRundown, type RundownSegment, type RundownSegmentStatus } from '@/lib/broadcast-rundown';
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

export const Route = createFileRoute('/_authenticated/admin/broadcast-rundown')({
  head: () => ({
    meta: [
      { title: 'Broadcast Rundown — Solaris Organizer' },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: BroadcastRundownPage,
});

function BroadcastRundownPage() {
  const { editionId } = useAdminContext();
  const showsQuery = useShows(editionId ?? undefined);
  const queryClient = useQueryClient();
  const shows = showsQuery.data ?? [];
  const [showId, setShowId] = useState('');
  const [mode, setMode] = useState<Studio2BroadcastMode>('production');
  const [draft, setDraft] = useState<Studio2BroadcastRundownConfig | null>(null);

  useEffect(() => {
    if (!shows.length) {
      if (showId) setShowId('');
      return;
    }
    if (!showId || !shows.some((show) => show.id === showId)) setShowId(shows[0]!.id);
  }, [showId, shows]);

  const rundownQuery = useQuery({
    queryKey: ['studio2-broadcast-rundown', showId],
    enabled: Boolean(showId),
    queryFn: () => loadStudio2BroadcastRundown(showId),
  });

  useEffect(() => {
    if (!showId || rundownQuery.isLoading) return;
    setDraft(rundownQuery.data ?? createDefaultBroadcastRundown());
  }, [rundownQuery.data, rundownQuery.isLoading, showId]);

  useEffect(() => {
    if (mode === 'production' && rundownQuery.data) setDraft(rundownQuery.data);
  }, [mode, rundownQuery.data]);

  const refreshRundown = async () => {
    await queryClient.invalidateQueries({ queryKey: ['studio2-broadcast-rundown', showId] });
    await queryClient.invalidateQueries({ queryKey: ['shows'] });
  };

  const saveMutation = useMutation({
    mutationFn: () => {
      if (!showId || !draft) throw new Error('Select a show and create a rundown first.');
      if (mode === 'rehearsal') return Promise.resolve(draft);
      return saveStudio2BroadcastRundown(showId, draft, 'Broadcast rundown edited in organizer planner');
    },
    onSuccess: async (config) => {
      setDraft(config);
      if (mode === 'production') await refreshRundown();
    },
  });

  const lockMutation = useMutation({
    mutationFn: ({ locked, reason }: { locked: boolean; reason: string }) => {
      if (!showId || !draft) throw new Error('Select a show and load its rundown first.');
      return setStudio2BroadcastRundownLock(showId, draft, locked, reason);
    },
    onSuccess: async (config) => {
      setDraft(config);
      await refreshRundown();
    },
  });

  const transitionMutation = useMutation({
    mutationFn: ({ segmentId, status, reason }: { segmentId: string; status: RundownSegmentStatus; reason: string }) => {
      if (!showId || !draft) throw new Error('Select a show and load its rundown first.');
      return transitionStudio2BroadcastSegment(showId, draft, segmentId, status, reason, mode);
    },
    onSuccess: async (config) => {
      setDraft(config);
      if (mode === 'production') await refreshRundown();
    },
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
  const selectedShow = shows.find((show) => show.id === showId) ?? null;
  const structureLocked = mode === 'production' && Boolean(draft?.lockedAt);

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

  const moveSegment = (index: number, direction: -1 | 1) => {
    if (structureLocked) return;
    setDraft((current) => {
      if (!current) return current;
      const target = index + direction;
      if (target < 0 || target >= current.segments.length) return current;
      const segments = [...current.segments];
      [segments[index], segments[target]] = [segments[target]!, segments[index]!];
      return { ...current, segments };
    });
  };

  const changeLock = (locked: boolean) => {
    if (!draft || mode !== 'production') return;
    const verb = locked ? 'lock' : 'unlock';
    if (!window.confirm(`${locked ? 'Lock' : 'Unlock'} this rundown? This action is audited.`)) return;
    const reason = window.prompt(`Reason to ${verb} the rundown:`)?.trim();
    if (!reason) return;
    lockMutation.mutate({ locked, reason });
  };

  const transitionSegment = (segment: RundownSegment, status: RundownSegmentStatus) => {
    const action = `${segment.status} → ${status}`;
    if (mode === 'production' && !window.confirm(`Confirm broadcast transition ${action} for “${segment.label}”?`)) return;
    const reason = mode === 'rehearsal'
      ? `Rehearsal preview: ${action}`
      : window.prompt(`Reason for ${action}:`)?.trim();
    if (!reason) return;
    transitionMutation.mutate({ segmentId: segment.id, status, reason });
  };

  const mutationError = saveMutation.error ?? lockMutation.error ?? transitionMutation.error;

  return (
    <AdminPage>
      <div className="mx-auto max-w-[1500px] space-y-4">
        <AdminPageHeader
          eyebrow="Solaris Studio 2 · Broadcast operations"
          title="Broadcast Rundown"
          description="Plan, lock and execute the show against one canonical rundown. Production commands are revision-checked and audited; rehearsal transitions stay local and never write production state."
        />

        <AdminCard strong>
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto] xl:items-end">
            <label className="space-y-1.5 text-sm">
              <span className="font-semibold">Show</span>
              <select
                value={showId}
                onChange={(event) => setShowId(event.target.value)}
                className="min-h-11 w-full rounded-xl border border-white/[0.09] bg-background px-3"
              >
                {shows.map((show) => <option key={show.id} value={show.id}>{show.name}</option>)}
              </select>
            </label>

            <label className="space-y-1.5 text-sm">
              <span className="font-semibold">Planned start</span>
              <input
                type="datetime-local"
                value={draft ? toLocalInputValue(draft.startAt) : ''}
                disabled={structureLocked}
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
              disabled={!draft || saveMutation.isPending || structureLocked || mode === 'rehearsal'}
              onClick={() => saveMutation.mutate()}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              <Save className="size-4" />
              {saveMutation.isPending ? 'Saving…' : 'Save structure'}
            </button>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {selectedShow ? <span>{selectedShow.kind} · {selectedShow.status}</span> : null}
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

        {showsQuery.isLoading || rundownQuery.isLoading ? (
          <AdminCard><p className="py-10 text-center text-sm text-muted-foreground">Loading broadcast rundown…</p></AdminCard>
        ) : showsQuery.error || rundownQuery.error ? (
          <AdminCard><AdminEmptyState icon={Clock3} title="Rundown unavailable" description={errorText(showsQuery.error ?? rundownQuery.error)} /></AdminCard>
        ) : !shows.length ? (
          <AdminCard><AdminEmptyState icon={Clock3} title="No shows in this edition" description="Create a show before building its broadcast rundown." /></AdminCard>
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

              <div className="mt-4 space-y-2">
                {draft.segments.length === 0 ? (
                  <AdminEmptyState icon={Clock3} title="No segments" description="Add the first segment to begin planning this show." />
                ) : draft.segments.map((segment, index) => {
                  const timing = calculated.segments[index];
                  return (
                    <article key={segment.id} className="rounded-xl border border-white/[0.07] bg-black/10 p-3">
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
                          <IconButton label="Move up" disabled={structureLocked || index === 0} onClick={() => moveSegment(index, -1)}><ArrowUp className="size-4" /></IconButton>
                          <IconButton label="Move down" disabled={structureLocked || index === draft.segments.length - 1} onClick={() => moveSegment(index, 1)}><ArrowDown className="size-4" /></IconButton>
                          <IconButton label="Remove" disabled={structureLocked} onClick={() => removeSegment(index)}><Trash2 className="size-4" /></IconButton>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </AdminCard>

            <AdminCard>
              <AdminCardHeader eyebrow="Timing" title="Estimated broadcast clock" />
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead className="text-xs uppercase tracking-[0.1em] text-muted-foreground">
                    <tr><th className="pb-3">#</th><th className="pb-3">Segment</th><th className="pb-3">Planned</th><th className="pb-3">Estimated</th><th className="pb-3">Finish</th><th className="pb-3">Drift</th><th className="pb-3">State</th></tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.07]">
                    {calculated.segments.map((segment, index) => (
                      <tr key={segment.id}>
                        <td className="py-3 text-muted-foreground">{index + 1}</td>
                        <td className="py-3 font-semibold">{segment.label}</td>
                        <td className="py-3 tabular-nums">{formatClock(segment.plannedStartedAt)}</td>
                        <td className="py-3 tabular-nums">{formatClock(segment.estimatedStartedAt)}</td>
                        <td className="py-3 tabular-nums">{formatClock(segment.plannedCompletedAt)}</td>
                        <td className="py-3 tabular-nums">{formatDrift(segment.driftSeconds)}</td>
                        <td className="py-3"><AdminStatus tone={statusTone(segment.status)}>{segment.status}</AdminStatus></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </AdminCard>
          </>
        ) : null}
      </div>
    </AdminPage>
  );
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

function errorText(error: unknown) {
  return error instanceof Error && error.message ? error.message : 'The broadcast rundown could not be loaded.';
}

function ErrorMessage({ error }: { error: unknown }) {
  return <div className="mt-3 rounded-xl border border-red-300/25 bg-red-300/10 px-4 py-3 text-sm text-red-100">{errorText(error)}</div>;
}
