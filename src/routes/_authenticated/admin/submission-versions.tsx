import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { History, Search } from 'lucide-react';
import { useMemo, useState } from 'react';

import { ConfirmationVersionHistory } from '@/components/admin/ConfirmationVersionHistory';
import { AdminPage } from '@/components/admin/AdminShell';
import { AdminCard, AdminEmptyState, AdminPageHeader, AdminStatus } from '@/components/admin/AdminUI';
import { confirmationsSupabase } from '@/integrations/confirmations/client';
import type { SubmissionSnapshot } from '@/lib/submission-versioning';

export const Route = createFileRoute('/_authenticated/admin/submission-versions')({
  head: () => ({
    meta: [
      { title: 'Submission History — Solaris Organizer' },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: SubmissionVersionsPage,
});

type Entry = {
  id: string;
  artist: string | null;
  song_title: string | null;
  song_url: string | null;
  preview_start?: string | null;
  preview_end?: string | null;
  final_clip_start?: string | null;
  final_clip_end?: string | null;
  replacement_video_required?: boolean | null;
  replacement_video_url?: string | null;
  removed?: boolean | null;
  position?: number | null;
};

type ResponseRow = {
  id: string;
  country: string;
  instagram_username: string;
  participating: boolean;
  selection_method: string | null;
  updated_at: string;
  editions: { id: string; name: string; edition_number: number } | null;
  submission_rounds: { id: string; name: string; edition_id: string } | null;
};

type VersionSummaryRow = {
  submission_id: string;
  version_count: number;
  latest_created_at: string | null;
};

type VersionedResponseRow = ResponseRow & {
  versionCount: number;
  latestVersionAt: string | null;
};

type ResponseDetail = {
  id: string;
  participating: boolean;
  selection_method: string | null;
  entry_unknown: boolean;
  nf_entries_unknown: boolean;
  reveal_date_type: string | null;
  reveal_exact_date: string | null;
  reveal_approximate_text: string | null;
  nf_date_type: string | null;
  nf_exact_date: string | null;
  nf_approximate_text: string | null;
  nf_result_date_type: string | null;
  nf_result_exact_date: string | null;
  nf_result_approximate_text: string | null;
  internal_entry: Entry | null;
  national_final: {
    id: string;
    nf_name: string | null;
    expected_entry_count: number | null;
    winning_entry_id: string | null;
    entries: Entry[];
  } | null;
};

async function loadResponses(): Promise<VersionedResponseRow[]> {
  const [responsesResult, summaryResult] = await Promise.all([
    confirmationsSupabase.rpc('admin_confirmation_responses'),
    confirmationsSupabase.rpc('admin_confirmation_version_summary'),
  ]);

  if (responsesResult.error) throw responsesResult.error;
  if (summaryResult.error) throw summaryResult.error;

  const responses = Array.isArray(responsesResult.data)
    ? responsesResult.data as unknown as ResponseRow[]
    : [];
  const summaries = Array.isArray(summaryResult.data)
    ? summaryResult.data as unknown as VersionSummaryRow[]
    : [];
  const bySubmission = new Map(
    summaries.map((item) => [item.submission_id, item] as const),
  );

  return responses.map((row) => {
    const summary = bySubmission.get(row.id);
    return {
      ...row,
      versionCount: Number(summary?.version_count ?? 0),
      latestVersionAt: summary?.latest_created_at ?? null,
    };
  });
}

async function loadResponse(id: string): Promise<ResponseDetail> {
  const { data, error } = await confirmationsSupabase.rpc('admin_confirmation_response', {
    _submission_id: id,
  });
  if (error) throw error;
  return data as unknown as ResponseDetail;
}

function currentSnapshot(detail: ResponseDetail): SubmissionSnapshot {
  return {
    submission: {
      participating: detail.participating,
      selection_method: detail.selection_method,
      entry_unknown: detail.entry_unknown,
      nf_entries_unknown: detail.nf_entries_unknown,
      reveal_date_type: detail.reveal_date_type,
      reveal_exact_date: detail.reveal_exact_date,
      reveal_approximate_text: detail.reveal_approximate_text,
      nf_date_type: detail.nf_date_type,
      nf_exact_date: detail.nf_exact_date,
      nf_approximate_text: detail.nf_approximate_text,
      nf_result_date_type: detail.nf_result_date_type,
      nf_result_exact_date: detail.nf_result_exact_date,
      nf_result_approximate_text: detail.nf_result_approximate_text,
    },
    internal: detail.internal_entry,
    national_final: detail.national_final
      ? {
          nf_name: detail.national_final.nf_name,
          expected_entry_count: detail.national_final.expected_entry_count,
          winning_entry_id: detail.national_final.winning_entry_id,
        }
      : null,
    nf_entries: detail.national_final?.entries ?? [],
  };
}

function SubmissionVersionsPage() {
  const [selectedId, setSelectedId] = useState('');
  const [query, setQuery] = useState('');

  const responsesQuery = useQuery({
    queryKey: ['confirmation-responses-for-version-history'],
    queryFn: loadResponses,
  });

  const rows = responsesQuery.data ?? [];
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return rows
      .filter((row) => row.versionCount > 0)
      .filter((row) => !term || [
        row.country,
        row.instagram_username,
        row.editions?.name ?? '',
        row.submission_rounds?.name ?? '',
      ].join(' ').toLowerCase().includes(term))
      .sort((a, b) => {
        const aTime = new Date(a.latestVersionAt ?? a.updated_at).getTime();
        const bTime = new Date(b.latestVersionAt ?? b.updated_at).getTime();
        return bTime - aTime;
      });
  }, [query, rows]);

  const activeId = selectedId || filtered[0]?.id || '';
  const selected = rows.find((row) => row.id === activeId) ?? null;

  const detailQuery = useQuery({
    queryKey: ['confirmation-response-version-current', activeId],
    enabled: Boolean(activeId),
    queryFn: () => loadResponse(activeId),
  });

  return (
    <AdminPage>
      <div className="mx-auto max-w-7xl space-y-4">
        <AdminPageHeader
          eyebrow="Delegations · Audit"
          title="Submission history"
          description="Inspect immutable pre-edit snapshots captured by the Confirmations system. Version history is read-only here; existing history is never rewritten."
        />

        <AdminCard strong>
          <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-center">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search edited country, username, edition or round…"
                className="min-h-11 w-full rounded-xl border border-white/[0.09] bg-background pl-9 pr-3 text-sm"
              />
            </div>
            <AdminStatus tone="info">{filtered.length} edited responses</AdminStatus>
          </div>
        </AdminCard>

        {responsesQuery.isLoading ? (
          <AdminCard><p className="py-10 text-center text-sm text-muted-foreground">Loading edited submissions…</p></AdminCard>
        ) : responsesQuery.error ? (
          <AdminCard><AdminEmptyState icon={History} title="Submission history unavailable" description="The confirmation response index or version summary could not be loaded." /></AdminCard>
        ) : !filtered.length ? (
          <AdminCard><AdminEmptyState icon={History} title="No edited submissions" description={query ? 'No edited response matches this search.' : 'No confirmation response currently has captured edits.'} /></AdminCard>
        ) : (
          <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
            <AdminCard className="xl:sticky xl:top-4 xl:self-start">
              <p className="admin-section-label mb-3">Edited responses</p>
              <div className="max-h-[70vh] space-y-2 overflow-y-auto pr-1">
                {filtered.map((row) => {
                  const active = row.id === activeId;
                  return (
                    <button
                      key={row.id}
                      type="button"
                      onClick={() => setSelectedId(row.id)}
                      className={`w-full rounded-xl border p-3 text-left transition-colors ${active ? 'border-sky-200/20 bg-sky-200/[0.08]' : 'border-white/[0.07] bg-black/10 hover:bg-white/[0.04]'}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">{row.country}</p>
                          <p className="mt-1 truncate text-xs text-muted-foreground">
                            {row.editions ? `SSC ${row.editions.edition_number}` : 'SSC'} · {row.submission_rounds?.name ?? 'Confirmation'}
                          </p>
                        </div>
                        <AdminStatus tone={active ? 'info' : 'neutral'}>{row.versionCount} {row.versionCount === 1 ? 'edit' : 'edits'}</AdminStatus>
                      </div>
                    </button>
                  );
                })}
              </div>
            </AdminCard>

            <div className="space-y-4">
              {selected ? (
                <AdminCard strong>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="admin-section-label">Selected response</p>
                      <h2 className="mt-1 text-xl font-bold">{selected.country}</h2>
                      <p className="mt-1 text-xs text-muted-foreground">
                        @{selected.instagram_username.replace(/^@/, '')} · updated {new Date(selected.updated_at).toLocaleString()}
                      </p>
                    </div>
                    <a
                      href={`/confirmations/admin/responses/${selected.id}`}
                      className="admin-action-secondary"
                    >
                      Open response
                    </a>
                  </div>
                </AdminCard>
              ) : null}

              {detailQuery.isLoading ? (
                <AdminCard><p className="py-8 text-center text-sm text-muted-foreground">Loading current response…</p></AdminCard>
              ) : detailQuery.error || !detailQuery.data ? (
                <AdminCard><AdminEmptyState icon={History} title="Current response unavailable" description="Version history cannot be compared with the current response right now." /></AdminCard>
              ) : (
                <ConfirmationVersionHistory
                  submissionId={detailQuery.data.id}
                  currentSnapshot={currentSnapshot(detailQuery.data)}
                />
              )}
            </div>
          </div>
        )}
      </div>
    </AdminPage>
  );
}
