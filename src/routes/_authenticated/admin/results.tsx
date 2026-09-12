import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import {
  AlertTriangle,
  Calculator,
  ExternalLink,
  Globe2,
  LockKeyhole,
  ShieldCheck,
  Sparkles,
  UnlockKeyhole,
  Vote,
  type LucideIcon,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import { useAdminContext } from '@/components/admin/AdminContext';
import { AdminPage } from '@/components/admin/AdminShell';
import { AdminCard, AdminConfirmSheet, AdminEmptyState, AdminPageHeader, AdminStatus } from '@/components/admin/AdminUI';
import { useEditions } from '@/lib/data';
import {
  availableStudio2ResultActions,
  executeStudio2ResultOperation,
  loadStudio2ResultsOperations,
  resultActionLabel,
  resultLifecycleLabel,
  resultLifecycleTone,
  summarizeStudio2ResultsOperations,
  type Studio2ResultAction,
  type Studio2ResultOperationRow,
} from '@/lib/studio2-results-operations';

export const Route = createFileRoute('/_authenticated/admin/results')({
  head: () => ({ meta: [
    { title: 'Results operations — Solaris Organizer' },
    { name: 'robots', content: 'noindex' },
  ] }),
  component: ResultsOperationsPage,
});

type PendingOperation = {
  row: Studio2ResultOperationRow;
  action: Studio2ResultAction;
  executionId: string;
};

function ResultsOperationsPage() {
  const { editionId } = useAdminContext();
  const queryClient = useQueryClient();
  const editionsQuery = useEditions();
  const [pending, setPending] = useState<PendingOperation | null>(null);
  const [reason, setReason] = useState('');

  const editions = editionsQuery.data ?? [];
  const edition = editions.find((item) => item.id === editionId)
    ?? [...editions].sort((a, b) => (b.edition_number ?? -1) - (a.edition_number ?? -1))[0]
    ?? null;
  const resolvedEditionId = edition?.id ?? '';

  const operationsQuery = useQuery({
    queryKey: ['studio2-results-operations', resolvedEditionId || 'none'],
    enabled: Boolean(resolvedEditionId),
    queryFn: () => loadStudio2ResultsOperations(resolvedEditionId),
    staleTime: 10_000,
  });
  const rows = operationsQuery.data ?? [];
  const summary = useMemo(() => summarizeStudio2ResultsOperations(rows), [rows]);

  const mutation = useMutation({
    mutationFn: (operation: PendingOperation) => executeStudio2ResultOperation({
      showId: operation.row.showId,
      action: operation.action,
      reason,
      executionId: operation.executionId,
      expectedVersion: operation.row.calculationVersion,
    }),
    onSuccess: async (execution) => {
      await queryClient.invalidateQueries({ queryKey: ['studio2-results-operations', resolvedEditionId] });
      toast.success(`${resultActionLabel(execution.action, execution.previousVersion)} completed for version ${execution.calculationVersion}.`);
      setPending(null);
      setReason('');
    },
    onError: (error) => toast.error(errorText(error)),
  });

  function requestOperation(row: Studio2ResultOperationRow, action: Studio2ResultAction) {
    setReason('');
    setPending({ row, action, executionId: crypto.randomUUID() });
  }

  async function confirmOperation() {
    if (!pending) return;
    if (reason.trim().length < 5) {
      toast.error('Add an audit reason of at least 5 characters.');
      return;
    }
    await mutation.mutateAsync(pending);
  }

  const error = editionsQuery.error ?? operationsQuery.error;
  const loading = editionsQuery.isLoading || operationsQuery.isLoading;

  return (
    <AdminPage>
      <div className="mx-auto max-w-[1500px] space-y-4">
        <AdminPageHeader
          eyebrow="Solaris Studio 2 · Results operations"
          title="Results operations"
          description="Operate the official result lifecycle without duplicating the scoring engine. Vote readiness, calculation, review, lock and reveal decisions are version-bound; publication remains authoritative in the existing publication system."
          actions={edition ? (
            <div className="flex flex-wrap gap-2">
              <a href="/televoting/admin/result-integrity" className="admin-action-secondary">Result Integrity <ExternalLink className="size-4" /></a>
              <a href="/admin/results-reveal" className="admin-action-secondary">Reveal Director <Sparkles className="size-4" /></a>
              <a href={`/admin/publication/${edition.slug}`} className="admin-action-secondary">Publication <Globe2 className="size-4" /></a>
            </div>
          ) : undefined}
        />

        {!edition && !editionsQuery.isLoading ? (
          <AdminCard><AdminEmptyState icon={Calculator} title="No edition selected" description="Select an edition before operating official results." /></AdminCard>
        ) : loading ? (
          <AdminCard><p className="py-12 text-center text-sm text-muted-foreground">Building the results operations snapshot…</p></AdminCard>
        ) : error ? (
          <AdminCard><AdminEmptyState icon={AlertTriangle} title="Results operations could not load" description={errorText(error)} /></AdminCard>
        ) : (
          <>
            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              <Metric label="Shows" value={summary.shows} tone="neutral" />
              <Metric label="Calc ready" value={summary.calculationReady} tone="info" />
              <Metric label="Blocking" value={summary.blocking} tone={summary.blocking ? 'attention' : 'ready'} />
              <Metric label="Locked" value={summary.locked} tone="ready" />
              <Metric label="Reveal ready" value={summary.revealReady} tone="ready" />
              <Metric label="Published" value={summary.published} tone="ready" />
            </section>

            <AdminCard strong>
              <div className="grid gap-3 lg:grid-cols-3">
                <SpecialistLink href="/televoting/admin/result-integrity" icon={ShieldCheck} title="Result Integrity" description="Review statistical and moderation evidence before adjudication. Integrity flags never alter results automatically." />
                <SpecialistLink href="/admin/friend-voting" icon={Vote} title="Friend Voting" description="Inspect expected-vs-observed, reciprocity, clique and historical friend-voting diagnostics." />
                <SpecialistLink href="/admin/jury-integrity" icon={ShieldCheck} title="Jury Integrity" description="Review jury-specific integrity evidence in its existing specialist surface." />
              </div>
            </AdminCard>

            {!rows.length ? (
              <AdminCard><AdminEmptyState icon={Calculator} title="No shows in this edition" description="Create contest shows before operating results." /></AdminCard>
            ) : (
              <div className="space-y-3">
                {rows.map((row) => (
                  <ShowResultCard
                    key={row.showId}
                    row={row}
                    editionSlug={edition!.slug}
                    busy={mutation.isPending}
                    onAction={requestOperation}
                  />
                ))}
              </div>
            )}
          </>
        )}

        <AdminConfirmSheet
          open={Boolean(pending)}
          onClose={() => !mutation.isPending && setPending(null)}
          onConfirm={confirmOperation}
          title={pending ? resultActionLabel(pending.action, pending.row.calculationVersion) : 'Result operation'}
          description={pending ? (
            <div className="space-y-4">
              <p>{operationDescription(pending)}</p>
              <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-3 text-xs leading-5 text-muted-foreground">
                <p><strong className="text-foreground">Current version:</strong> {pending.row.calculationVersion || 'unversioned'}</p>
                <p><strong className="text-foreground">Participants / result rows:</strong> {pending.row.preconditions.participantCount} / {pending.row.preconditions.resultRowCount}</p>
                <p><strong className="text-foreground">Jury:</strong> {readinessLabel(pending.row.preconditions.juryEnabled, pending.row.preconditions.juryReady)}</p>
                <p><strong className="text-foreground">Televote:</strong> {readinessLabel(pending.row.preconditions.televoteEnabled, pending.row.preconditions.televoteReady)}</p>
                <p><strong className="text-foreground">Reconciliation issues:</strong> {pending.row.preconditions.reconcileIssueCount}</p>
              </div>
              <label className="block">
                <span className="admin-section-label">Audit reason</span>
                <textarea
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  className="admin-input mt-2 min-h-24 w-full resize-y"
                  placeholder="Why is this operation being performed?"
                  disabled={mutation.isPending}
                />
                <span className="mt-1 block text-xs text-muted-foreground">Required. It is stored with the immutable execution receipt and contest event.</span>
              </label>
            </div>
          ) : null}
          confirmLabel={pending ? resultActionLabel(pending.action, pending.row.calculationVersion) : 'Confirm'}
          confirmationText={pending?.row.showName}
          confirmationHint={pending ? `Type ${pending.row.showName} to confirm` : undefined}
          busy={mutation.isPending}
          danger={pending ? ['calculate', 'unlock', 'clear_reveal_ready'].includes(pending.action) : false}
        />
      </div>
    </AdminPage>
  );
}

function ShowResultCard({ row, editionSlug, busy, onAction }: {
  row: Studio2ResultOperationRow;
  editionSlug: string;
  busy: boolean;
  onAction: (row: Studio2ResultOperationRow, action: Studio2ResultAction) => void;
}) {
  const pre = row.preconditions;
  const actions = availableStudio2ResultActions(row);
  return (
    <AdminCard className="!p-4">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-bold text-foreground">{row.showName}</h2>
            <AdminStatus tone={resultLifecycleTone(row.lifecycle)}>{resultLifecycleLabel(row.lifecycle)}</AdminStatus>
            <AdminStatus tone="neutral">{row.calculationVersion > 0 ? `v${row.calculationVersion}` : 'unversioned'}</AdminStatus>
            {pre.publishedResults ? <AdminStatus tone="ready">Public</AdminStatus> : null}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{row.showKind.replaceAll('-', ' ')} · {pre.participantCount} participants · {pre.resultRowCount} result rows</p>
        </div>
        <div className="flex flex-wrap gap-2 xl:justify-end">
          {actions.map((action) => (
            <button
              key={action}
              type="button"
              disabled={busy}
              className={['calculate', 'lock', 'mark_reveal_ready'].includes(action) ? 'admin-action-primary' : 'admin-action-secondary'}
              onClick={() => onAction(row, action)}
            >
              {actionIcon(action)} {resultActionLabel(action, row.calculationVersion)}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <ReadinessCell label="Jury" ready={pre.juryReady} value={readinessLabel(pre.juryEnabled, pre.juryReady)} detail={pre.juryEnabled ? `${pre.juryVoterCount} voters · ${pre.juryIncompleteCount} incomplete · ${pre.juryConflictCount} conflicts · ${pre.juryDnvCount} DNV` : 'Disabled in voting configuration'} />
        <ReadinessCell label="Televote" ready={pre.televoteReady} value={readinessLabel(pre.televoteEnabled, pre.televoteReady)} detail={pre.televoteEnabled ? `${pre.televoteVoteRows} canonical vote rows` : 'Disabled in voting configuration'} />
        <ReadinessCell label="Calculation" ready={pre.calculationReady} value={pre.calculationReady ? 'Ready' : 'Blocked'} detail={`${pre.participantCount} participants · ${pre.resultRowCount} current result rows`} />
        <ReadinessCell label="Reconciliation" ready={pre.resultReady} value={pre.resultReady ? 'Reconciled' : pre.resultRowCount ? 'Needs attention' : 'Not calculated'} detail={`${pre.reconcileIssueCount} total/weighting issues`} />
      </div>

      <div className="mt-4 flex flex-wrap gap-2 border-t border-white/[0.07] pt-4">
        <a href={`/admin/jury/${editionSlug}?show=${encodeURIComponent(row.showId)}`} className="admin-action-quiet">Jury ballots</a>
        <a href={`/admin/televote/${editionSlug}?show=${encodeURIComponent(row.showId)}`} className="admin-action-quiet">Televote totals</a>
        <a href={`/admin/voting-system/${editionSlug}?show=${encodeURIComponent(row.showId)}`} className="admin-action-quiet">Voting system</a>
        <a href="/televoting/admin/result-integrity" className="admin-action-quiet">Integrity</a>
        <a href="/admin/results-reveal" className="admin-action-quiet">Reveal Director</a>
        <a href={`/admin/publication/${editionSlug}`} className="admin-action-quiet">Publication</a>
      </div>
    </AdminCard>
  );
}

function ReadinessCell({ label, ready, value, detail }: { label: string; ready: boolean; value: string; detail: string }) {
  return <div className="rounded-xl border border-white/[0.07] bg-white/[0.022] p-3">
    <p className="admin-section-label">{label}</p>
    <div className="mt-2"><AdminStatus tone={ready ? 'ready' : 'attention'}>{value}</AdminStatus></div>
    <p className="mt-2 text-xs leading-5 text-muted-foreground">{detail}</p>
  </div>;
}

function SpecialistLink({ href, icon: Icon, title, description }: { href: string; icon: LucideIcon; title: string; description: string }) {
  return <a href={href} className="admin-action-row flex items-start gap-3 text-left">
    <span className="admin-action-row-icon"><Icon className="size-4" /></span>
    <span className="min-w-0 flex-1">
      <span className="flex items-center gap-2 text-sm font-semibold text-foreground">{title}<ExternalLink className="size-3.5 text-muted-foreground" /></span>
      <span className="mt-1 block text-xs leading-5 text-muted-foreground">{description}</span>
    </span>
  </a>;
}

function Metric({ label, value, tone }: { label: string; value: number; tone: 'neutral' | 'info' | 'attention' | 'ready' }) {
  return <AdminCard className="!p-3 text-center">
    <p className="numeric text-2xl font-bold text-foreground">{value}</p>
    <div className="mt-2"><AdminStatus tone={tone}>{label}</AdminStatus></div>
  </AdminCard>;
}

function readinessLabel(enabled: boolean, ready: boolean) {
  return enabled ? (ready ? 'Ready' : 'Needs attention') : 'Not used';
}

function operationDescription(pending: PendingOperation) {
  const version = pending.row.calculationVersion || 'unversioned';
  switch (pending.action) {
    case 'calculate': return `Calculate ${pending.row.showName} from canonical jury and televote data. Review, lock and reveal approvals attached to ${version} are cleared because they belong to old numbers.`;
    case 'review': return `Record that version ${version} of ${pending.row.showName} has been reviewed against the current result rows and reconciliation checks.`;
    case 'lock': return `Lock reviewed version ${version} of ${pending.row.showName}. Recalculation requires an explicit unlock first.`;
    case 'unlock': return `Unlock version ${version} of ${pending.row.showName}. Reveal readiness is cleared at the same time.`;
    case 'mark_reveal_ready': return `Mark locked version ${version} of ${pending.row.showName} ready for the existing Reveal Director workflow. This does not publish anything.`;
    case 'clear_reveal_ready': return `Clear reveal readiness for version ${version} of ${pending.row.showName}. The result remains locked.`;
  }
}

function actionIcon(action: Studio2ResultAction) {
  switch (action) {
    case 'calculate': return <Calculator className="size-4" />;
    case 'review': return <ShieldCheck className="size-4" />;
    case 'lock': return <LockKeyhole className="size-4" />;
    case 'unlock': return <UnlockKeyhole className="size-4" />;
    case 'mark_reveal_ready': return <Sparkles className="size-4" />;
    case 'clear_reveal_ready': return <Sparkles className="size-4" />;
  }
}

function errorText(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) return String((error as { message: unknown }).message);
  return 'Unknown error';
}
