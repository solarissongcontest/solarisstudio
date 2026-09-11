import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { ArrowDown, ArrowUp, Clock3, Plus, Save, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';

import { useAdminContext } from '@/components/admin/AdminContext';
import { AdminPage } from '@/components/admin/AdminShell';
import { AdminCard, AdminCardHeader, AdminEmptyState, AdminPageHeader, AdminStatus } from '@/components/admin/AdminUI';
import { buildBroadcastRundown, type RundownSegment } from '@/lib/broadcast-rundown';
import { useShows } from '@/lib/data';
import {
  createDefaultBroadcastRundown,
  loadStudio2BroadcastRundown,
  saveStudio2BroadcastRundown,
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

  const saveMutation = useMutation({
    mutationFn: () => {
      if (!showId || !draft) throw new Error('Select a show and create a rundown first.');
      return saveStudio2BroadcastRundown(showId, draft);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['studio2-broadcast-rundown', showId] });
      await queryClient.invalidateQueries({ queryKey: ['shows'] });
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

  const selectedShow = shows.find((show) => show.id === showId) ?? null;

  const updateSegment = (index: number, patch: Partial<RundownSegment>) => {
    setDraft((current) => current ? {
      ...current,
      segments: current.segments.map((segment, segmentIndex) => segmentIndex === index ? { ...segment, ...patch } : segment),
    } : current);
  };

  const addSegment = () => {
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
    setDraft((current) => current ? {
      ...current,
      segments: current.segments.filter((_, segmentIndex) => segmentIndex !== index),
    } : current);
  };

  const moveSegment = (index: number, direction: -1 | 1) => {
    setDraft((current) => {
      if (!current) return current;
      const target = index + direction;
      if (target < 0 || target >= current.segments.length) return current;
      const segments = [...current.segments];
      [segments[index], segments[target]] = [segments[target]!, segments[index]!];
      return { ...current, segments };
    });
  };

  return (
    <AdminPage>
      <div className="mx-auto max-w-7xl space-y-4">
        <AdminPageHeader
          eyebrow="Solaris Studio 2"
          title="Broadcast Rundown"
          description="Plan the show minute by minute and see schedule drift before somebody discovers live television still obeys time. This planner persists inside the selected show's canonical broadcast configuration."
        />

        <AdminCard strong>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-end">
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
                onChange={(event) => setDraft((current) => current ? { ...current, startAt: fromLocalInputValue(event.target.value) } : current)}
                className="min-h-11 w-full rounded-xl border border-white/[0.09] bg-background px-3"
              />
            </label>

            <button
              type="button"
              disabled={!draft || saveMutation.isPending}
              onClick={() => saveMutation.mutate()}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              <Save className="size-4" />
              {saveMutation.isPending ? 'Saving…' : 'Save rundown'}
            </button>
          </div>
          {selectedShow ? <p className="mt-3 text-xs text-muted-foreground">{selectedShow.kind} · {selectedShow.status}</p> : null}
          {saveMutation.error ? <ErrorMessage error={saveMutation.error} /> : null}
        </AdminCard>

        {showsQuery.isLoading || rundownQuery.isLoading ? (
          <AdminCard><p className="py-10 text-center text-sm text-muted-foreground">Loading broadcast rundown…</p></AdminCard>
        ) : showsQuery.error || rundownQuery.error ? (
          <AdminCard><AdminEmptyState icon={Clock3} title="Rundown unavailable" description={errorText(showsQuery.error ?? rundownQuery.error)} /></AdminCard>
        ) : !shows.length ? (
          <AdminCard><AdminEmptyState icon={Clock3} title="No shows in this edition" description="Create a show before building its broadcast rundown." /></AdminCard>
        ) : draft && calculated ? (
          <>
            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Metric label="Segments" value={`${draft.segments.length}`} />
              <Metric label="Planned runtime" value={formatDuration(calculated.totalPlannedSeconds)} />
              <Metric label="Estimated finish" value={formatClock(calculated.estimatedFinishAt)} />
              <Metric label="Current drift" value={formatDrift(calculated.overallDriftSeconds)} tone={calculated.overallDriftSeconds === 0 ? 'ready' : 'attention'} />
            </section>

            <AdminCard>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <AdminCardHeader eyebrow="Timeline" title="Show segments" />
                <button
                  type="button"
                  onClick={addSegment}
                  className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/[0.09] bg-white/[0.035] px-3 text-sm font-semibold hover:bg-white/[0.07]"
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
                      <div className="grid gap-3 xl:grid-cols-[90px_minmax(0,1fr)_150px_135px_auto] xl:items-center">
                        <div>
                          <p className="text-xs text-muted-foreground">Start</p>
                          <p className="mt-1 text-sm font-semibold tabular-nums">{timing ? formatClock(timing.estimatedStartedAt) : '—'}</p>
                        </div>
                        <label className="space-y-1 text-sm">
                          <span className="text-xs text-muted-foreground">Segment</span>
                          <input
                            value={segment.label}
                            onChange={(event) => updateSegment(index, { label: event.target.value })}
                            className="min-h-10 w-full rounded-lg border border-white/[0.08] bg-background px-3 font-semibold"
                          />
                        </label>
                        <label className="space-y-1 text-sm">
                          <span className="text-xs text-muted-foreground">Duration (min)</span>
                          <input
                            type="number"
                            min="1"
                            step="0.5"
                            value={segment.plannedDurationSeconds / 60}
                            onChange={(event) => updateSegment(index, { plannedDurationSeconds: Math.max(30, Math.round(Number(event.target.value || 0) * 60)) })}
                            className="min-h-10 w-full rounded-lg border border-white/[0.08] bg-background px-3"
                          />
                        </label>
                        <div>
                          <p className="text-xs text-muted-foreground">Status</p>
                          <div className="mt-1"><AdminStatus tone={statusTone(segment.status)}>{segment.status}</AdminStatus></div>
                        </div>
                        <div className="flex justify-end gap-1">
                          <IconButton label="Move up" disabled={index === 0} onClick={() => moveSegment(index, -1)}><ArrowUp className="size-4" /></IconButton>
                          <IconButton label="Move down" disabled={index === draft.segments.length - 1} onClick={() => moveSegment(index, 1)}><ArrowDown className="size-4" /></IconButton>
                          <IconButton label="Remove" onClick={() => removeSegment(index)}><Trash2 className="size-4" /></IconButton>
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
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead className="text-xs uppercase tracking-[0.1em] text-muted-foreground">
                    <tr><th className="pb-3">#</th><th className="pb-3">Segment</th><th className="pb-3">Planned</th><th className="pb-3">Estimated</th><th className="pb-3">Finish</th><th className="pb-3">Drift</th></tr>
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

function Metric({ label, value, tone = 'neutral' }: { label: string; value: string; tone?: 'neutral' | 'ready' | 'attention' }) {
  return (
    <AdminCard>
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
      <div className="mt-2 flex items-center justify-between gap-2"><p className="text-2xl font-bold">{value}</p>{tone !== 'neutral' ? <AdminStatus tone={tone}>{tone}</AdminStatus> : null}</div>
    </AdminCard>
  );
}

function IconButton({ label, disabled = false, onClick, children }: { label: string; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return <button type="button" aria-label={label} disabled={disabled} onClick={onClick} className="grid size-10 place-items-center rounded-lg border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.07] disabled:opacity-30">{children}</button>;
}

function statusTone(status: RundownSegment['status']): 'neutral' | 'info' | 'attention' | 'ready' {
  if (status === 'completed') return 'ready';
  if (status === 'live') return 'attention';
  if (status === 'ready') return 'info';
  return 'neutral';
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
