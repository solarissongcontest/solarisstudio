import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { GitCompareArrows, History, RotateCcw, ShieldAlert } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import { confirmationsSupabase } from '@/integrations/confirmations/client';
import { syncConfirmationSnapshotToSolaris } from '@/integrations/confirmations/sync.functions';
import {
  diffConfirmationSnapshots,
  formatConfirmationVersionSource,
  formatConfirmationVersionValue,
  type ConfirmationVersionSource,
  type StoredConfirmationVersion,
} from '@/lib/confirmation-version-history';
import type { SubmissionSnapshot } from '@/lib/submission-versioning';
import { AdminCard, AdminCardHeader, AdminEmptyState, AdminSheet, AdminStatus } from './AdminUI';

type VersionRow = {
  id: string;
  submission_id: string;
  version: number;
  snapshot: SubmissionSnapshot;
  created_at: string;
  change_source?: ConfirmationVersionSource | null;
  change_reason?: string | null;
  actor_user_id?: string | null;
  restored_from_version_id?: string | null;
};

type RestoreResult = {
  ok: boolean;
  submission_id: string;
  captured_version: number;
  restored_from_version_id: string;
};

async function loadVersions(submissionId: string): Promise<StoredConfirmationVersion[]> {
  const { data, error } = await confirmationsSupabase.rpc('admin_confirmation_versions', {
    _submission_id: submissionId,
  });

  if (error) throw error;
  const rows = Array.isArray(data) ? data as unknown as VersionRow[] : [];
  return rows.map((row) => ({
    id: row.id,
    submissionId: row.submission_id,
    version: Number(row.version),
    snapshot: row.snapshot ?? {},
    createdAt: row.created_at,
    changeSource: row.change_source ?? null,
    changeReason: row.change_reason ?? null,
    actorUserId: row.actor_user_id ?? null,
    restoredFromVersionId: row.restored_from_version_id ?? null,
  }));
}

export function ConfirmationVersionHistory({
  submissionId,
  currentSnapshot,
}: {
  submissionId: string;
  currentSnapshot: SubmissionSnapshot;
}) {
  const queryClient = useQueryClient();
  const syncToSolaris = useServerFn(syncConfirmationSnapshotToSolaris);
  const [restoreTarget, setRestoreTarget] = useState<StoredConfirmationVersion | null>(null);
  const [restoreReason, setRestoreReason] = useState('');

  const versionsQuery = useQuery({
    queryKey: ['confirmation-submission-versions', submissionId],
    queryFn: () => loadVersions(submissionId),
  });

  const versions = versionsQuery.data ?? [];
  const versionsById = useMemo(
    () => new Map(versions.map((version) => [version.id, version] as const)),
    [versions],
  );
  const restoredTargets = useMemo(() => {
    const targets = new Map<string, StoredConfirmationVersion[]>();
    for (const version of versions) {
      if (!version.restoredFromVersionId) continue;
      const list = targets.get(version.restoredFromVersionId) ?? [];
      list.push(version);
      targets.set(version.restoredFromVersionId, list);
    }
    return targets;
  }, [versions]);

  const restoreMutation = useMutation({
    mutationFn: async ({ target, reason }: { target: StoredConfirmationVersion; reason: string }) => {
      const { data, error } = await confirmationsSupabase.rpc('admin_restore_confirmation_version', {
        _submission_id: submissionId,
        _version_id: target.id,
        _reason: reason.trim(),
      });
      if (error) throw error;

      const restore = data as unknown as RestoreResult;
      let syncWarning: string | null = null;

      try {
        const current = await confirmationsSupabase.rpc('admin_confirmation_response', {
          _submission_id: submissionId,
        });
        if (current.error) throw current.error;
        const sync = await syncToSolaris({ data: { snapshot: current.data } });
        if (!sync.ok) syncWarning = sync.message ?? 'Canonical Solaris sync needs attention.';
      } catch (syncError) {
        syncWarning = syncError instanceof Error
          ? syncError.message
          : 'Canonical Solaris sync failed after the restore.';
      }

      return { restore, syncWarning };
    },
    onSuccess: async ({ restore, syncWarning }) => {
      setRestoreTarget(null);
      setRestoreReason('');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['confirmation-submission-versions', submissionId] }),
        queryClient.invalidateQueries({ queryKey: ['confirmation-response-version-current', submissionId] }),
        queryClient.invalidateQueries({ queryKey: ['confirmation-responses-for-version-history'] }),
      ]);

      if (syncWarning) {
        toast.warning(`Restored as edit ${restore.captured_version}. Solaris sync needs attention: ${syncWarning}`);
      } else {
        toast.success(`Historical snapshot restored. Previous state preserved as edit ${restore.captured_version}.`);
      }
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'The historical snapshot could not be restored.');
    },
  });

  const transitions = versions.map((version, index) => {
    const next = versions[index + 1];
    const after = next?.snapshot ?? currentSnapshot;
    return {
      ...version,
      changes: diffConfirmationSnapshots(version.snapshot, after),
      isLatest: index === versions.length - 1,
    };
  }).reverse();

  const reasonAllowed = restoreReason.trim().length >= 8;

  return (
    <>
      <AdminCard>
        <AdminCardHeader
          eyebrow="Audit"
          title="Submission versions"
          description="Edit-by-edit history reconstructed from immutable pre-edit snapshots. Restoring a snapshot appends a new audit version first; existing history is never rewritten."
          action={<History className="size-4 text-muted-foreground" />}
        />

        {versionsQuery.isLoading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Loading version history…</p>
        ) : versionsQuery.error ? (
          <p className="rounded-xl border border-amber-200/20 bg-amber-200/[0.04] p-3 text-sm text-amber-100">
            Version history could not be loaded.
          </p>
        ) : !transitions.length ? (
          <AdminEmptyState
            icon={History}
            title="No previous versions"
            description="This response has not been edited since it was submitted, or it predates version capture."
          />
        ) : (
          <div className="space-y-3">
            {transitions.map((transition) => {
              const restoredFrom = transition.restoredFromVersionId
                ? versionsById.get(transition.restoredFromVersionId)
                : null;
              const laterRestores = restoredTargets.get(transition.id) ?? [];

              return (
                <article key={transition.id} className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <GitCompareArrows className="size-4 text-sky-100/75" />
                        <p className="text-sm font-semibold">Edit {transition.version}</p>
                        <AdminStatus tone={transition.changeSource === 'organizer_restore' ? 'attention' : 'neutral'}>
                          {formatConfirmationVersionSource(transition.changeSource)}
                        </AdminStatus>
                        {laterRestores.length ? <AdminStatus tone="info">Restored later</AdminStatus> : null}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {new Date(transition.createdAt).toLocaleString()}
                        {transition.isLatest ? ' · compared with current response' : ` · compared with version ${transition.version + 1}`}
                      </p>
                      {transition.changeReason ? (
                        <p className="mt-2 rounded-lg border border-amber-200/10 bg-amber-200/[0.035] px-2.5 py-2 text-xs leading-relaxed text-amber-50/80">
                          Restore reason: {transition.changeReason}
                          {restoredFrom ? ` · restored from edit ${restoredFrom.version}` : ''}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-2">
                      <AdminStatus tone={transition.changes.length ? 'attention' : 'neutral'}>
                        {transition.changes.length} {transition.changes.length === 1 ? 'change' : 'changes'}
                      </AdminStatus>
                      <button
                        type="button"
                        onClick={() => {
                          setRestoreReason('');
                          setRestoreTarget(transition);
                        }}
                        className="admin-action-secondary !min-h-9 !px-2.5"
                      >
                        <RotateCcw className="size-3.5" /> Restore
                      </button>
                    </div>
                  </div>

                  {transition.changes.length ? (
                    <div className="mt-3 divide-y divide-white/[0.06] rounded-xl border border-white/[0.06] bg-black/10">
                      {transition.changes.map((change) => (
                        <div key={change.field} className="grid gap-2 p-3 text-xs md:grid-cols-[150px_1fr_auto_1fr] md:items-start">
                          <span className="font-semibold text-foreground">{change.label}</span>
                          <span className="break-words text-muted-foreground">{formatConfirmationVersionValue(change.before)}</span>
                          <span className="hidden text-muted-foreground/50 md:block">→</span>
                          <span className="break-words font-medium text-foreground/90">{formatConfirmationVersionValue(change.after)}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-3 text-xs text-muted-foreground">No tracked contest fields changed in this edit.</p>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </AdminCard>

      <AdminSheet
        open={Boolean(restoreTarget)}
        onClose={restoreMutation.isPending ? () => undefined : () => {
          setRestoreTarget(null);
          setRestoreReason('');
        }}
        title={restoreTarget ? `Restore edit ${restoreTarget.version}` : 'Restore historical submission'}
        description="This creates a new audited state. It never deletes or rewrites the historical record."
      >
        <div className="rounded-xl border border-rose-200/15 bg-rose-200/[0.05] p-3">
          <div className="flex items-start gap-3">
            <ShieldAlert className="mt-0.5 size-5 shrink-0 text-rose-200" />
            <div className="text-sm leading-relaxed text-muted-foreground">
              Delegation-owned fields will be restored from this snapshot. Entry review decisions are deliberately not restored: restored songs return to <strong className="text-foreground">pending review</strong>. The current state is captured as a new version before any change is applied.
            </div>
          </div>
        </div>

        <label className="mt-4 block">
          <span className="text-xs font-semibold text-foreground">Restore reason</span>
          <span className="mt-1 block text-xs text-muted-foreground">Required for provenance. Use at least 8 characters.</span>
          <textarea
            value={restoreReason}
            onChange={(event) => setRestoreReason(event.target.value)}
            rows={4}
            maxLength={500}
            placeholder="Why is this historical state being restored?"
            className="mt-2 w-full rounded-xl border border-white/[0.1] bg-white/[0.035] px-3 py-2.5 text-sm outline-none focus:border-sky-200/30"
          />
        </label>

        <div className="mt-5 grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={restoreMutation.isPending}
            onClick={() => {
              setRestoreTarget(null);
              setRestoreReason('');
            }}
            className="admin-action-secondary w-full"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={restoreMutation.isPending || !restoreTarget || !reasonAllowed}
            onClick={() => {
              if (!restoreTarget || !reasonAllowed) return;
              restoreMutation.mutate({ target: restoreTarget, reason: restoreReason });
            }}
            className="admin-action-danger w-full"
          >
            <RotateCcw className="size-4" /> {restoreMutation.isPending ? 'Restoring…' : 'Restore snapshot'}
          </button>
        </div>
      </AdminSheet>
    </>
  );
}
