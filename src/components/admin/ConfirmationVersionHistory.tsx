import { useQuery } from '@tanstack/react-query';
import { GitCompareArrows, History } from 'lucide-react';

import { confirmationsSupabase } from '@/integrations/confirmations/client';
import {
  diffConfirmationSnapshots,
  formatConfirmationVersionValue,
  type StoredConfirmationVersion,
} from '@/lib/confirmation-version-history';
import type { SubmissionSnapshot } from '@/lib/submission-versioning';
import { AdminCard, AdminCardHeader, AdminEmptyState, AdminStatus } from './AdminUI';

type VersionRow = {
  id: string;
  submission_id: string;
  version: number;
  snapshot: SubmissionSnapshot;
  created_at: string;
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
  }));
}

export function ConfirmationVersionHistory({
  submissionId,
  currentSnapshot,
}: {
  submissionId: string;
  currentSnapshot: SubmissionSnapshot;
}) {
  const versionsQuery = useQuery({
    queryKey: ['confirmation-submission-versions', submissionId],
    queryFn: () => loadVersions(submissionId),
  });

  const versions = versionsQuery.data ?? [];
  const transitions = versions.map((version, index) => {
    const next = versions[index + 1];
    const after = next?.snapshot ?? currentSnapshot;
    return {
      ...version,
      changes: diffConfirmationSnapshots(version.snapshot, after),
      isLatest: index === versions.length - 1,
    };
  }).reverse();

  return (
    <AdminCard>
      <AdminCardHeader
        eyebrow="Audit"
        title="Submission versions"
        description="Edit-by-edit history reconstructed from immutable pre-edit snapshots. The legacy backend whitelists contest fields before returning history; the UI applies the same privacy projection again before rendering."
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
          {transitions.map((transition) => (
            <article key={transition.id} className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <GitCompareArrows className="size-4 text-sky-100/75" />
                    <p className="text-sm font-semibold">Edit {transition.version}</p>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {new Date(transition.createdAt).toLocaleString()}
                    {transition.isLatest ? ' · compared with current response' : ` · compared with version ${transition.version + 1}`}
                  </p>
                </div>
                <AdminStatus tone={transition.changes.length ? 'attention' : 'neutral'}>
                  {transition.changes.length} {transition.changes.length === 1 ? 'change' : 'changes'}
                </AdminStatus>
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
          ))}
        </div>
      )}
    </AdminCard>
  );
}
