import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  ClipboardCheck,
  ExternalLink,
  FileCheck2,
  Gauge,
  Globe2,
  MapPin,
  MapPinned,
  Pencil,
  Plane,
  Plus,
  RadioTower,
  ShieldCheck,
  Star,
  TrainFront,
  Users,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { useAdminContext } from '@/components/admin/AdminContext';
import { AdminPage } from '@/components/admin/AdminShell';
import {
  AdminCard,
  AdminConfirmSheet,
  AdminEmptyState,
  AdminPageHeader,
  AdminSheet,
  AdminStatus,
} from '@/components/admin/AdminUI';
import { editionLabel, useCountries, useEditions } from '@/lib/data';
import {
  HOST_EVALUATION_CRITERIA,
  HOST_READINESS_KEYS,
  availableHostBidActions,
  executeStudio2HostOperation,
  hostBidStatusLabel,
  hostBidStatusTone,
  hostOperationLabel,
  hostReadinessProgress,
  loadStudio2HostManagement,
  summarizeStudio2HostManagement,
  type HostBid,
  type HostBidInput,
  type HostEvaluationCriterion,
  type HostManagementSnapshot,
  type HostOperationAction,
  type HostOperationsReadiness,
  type HostShowAssignment,
} from '@/lib/studio2-host-management';

export const Route = createFileRoute('/_authenticated/admin/hosts')({
  head: () => ({ meta: [
    { title: 'Host Management — Solaris Organizer' },
    { name: 'robots', content: 'noindex' },
  ] }),
  component: HostManagementPage,
});

type HostView = 'overview' | 'bids' | 'evaluation' | 'selected' | 'operations';

type PendingOperation = {
  action: HostOperationAction;
  bidId?: string | null;
  expectedRevision?: number | null;
  payload?: Record<string, unknown>;
  title: string;
  description: string;
  confirmationText: string;
  danger?: boolean;
};

type BidDraft = {
  countryId: string;
  city: string;
  venueName: string;
  venueCapacity: string;
  venueAddress: string;
  airportSummary: string;
  transportSummary: string;
  accommodationBeds: string;
  productionSummary: string;
  sustainabilitySummary: string;
  accessibilitySummary: string;
  localBroadcaster: string;
  timezone: string;
  latitude: string;
  longitude: string;
  supportingLinks: string;
};

const emptyBidDraft: BidDraft = {
  countryId: '',
  city: '',
  venueName: '',
  venueCapacity: '',
  venueAddress: '',
  airportSummary: '',
  transportSummary: '',
  accommodationBeds: '',
  productionSummary: '',
  sustainabilitySummary: '',
  accessibilitySummary: '',
  localBroadcaster: '',
  timezone: '',
  latitude: '',
  longitude: '',
  supportingLinks: '',
};

const readinessLabels: Record<(typeof HOST_READINESS_KEYS)[number], string> = {
  venueConfirmed: 'Venue confirmed',
  contractsReady: 'Contracts ready',
  stageAccessReady: 'Stage access',
  technicalReady: 'Technical production',
  accreditationReady: 'Accreditation',
  hotelsReady: 'Delegation hotels',
  transportReady: 'Transport',
  securityReady: 'Security',
  rehearsalsReady: 'Rehearsals',
  pressCentreReady: 'Press centre',
  accessibilityReady: 'Accessibility',
  ceremoniesReady: 'Ceremonies & events',
};

const criterionLabels: Record<HostEvaluationCriterion, string> = {
  technical: 'Technical feasibility',
  venue: 'Venue readiness',
  transport: 'Transport',
  accommodation: 'Accommodation',
  security: 'Security',
  cost: 'Cost',
  broadcaster: 'Broadcaster capability',
  accessibility: 'Accessibility',
  sustainability: 'Sustainability',
};

function HostManagementPage() {
  const { editionId } = useAdminContext();
  const queryClient = useQueryClient();
  const editionsQuery = useEditions();
  const countriesQuery = useCountries();
  const [view, setView] = useState<HostView>('overview');
  const [pending, setPending] = useState<PendingOperation | null>(null);
  const [pendingReason, setPendingReason] = useState('');
  const [bidSheet, setBidSheet] = useState<{ mode: 'create' | 'edit'; bid?: HostBid } | null>(null);
  const [bidDraft, setBidDraft] = useState<BidDraft>(emptyBidDraft);
  const [bidReason, setBidReason] = useState('');
  const [evaluationTarget, setEvaluationTarget] = useState<HostBid | null>(null);
  const [evaluationCriterion, setEvaluationCriterion] = useState<HostEvaluationCriterion>('technical');
  const [evaluationScore, setEvaluationScore] = useState('');
  const [evaluationComment, setEvaluationComment] = useState('');
  const [evaluationReason, setEvaluationReason] = useState('');
  const [readiness, setReadiness] = useState<HostOperationsReadiness | null>(null);
  const [operationsNotes, setOperationsNotes] = useState('');
  const [operationsReason, setOperationsReason] = useState('');
  const [showTarget, setShowTarget] = useState<HostShowAssignment | null>(null);
  const [showCountryId, setShowCountryId] = useState('');
  const [showCity, setShowCity] = useState('');
  const [showReason, setShowReason] = useState('');

  const editions = editionsQuery.data ?? [];
  const countries = countriesQuery.data ?? [];
  const edition = editions.find((item) => item.id === editionId)
    ?? [...editions].sort((a, b) => (b.edition_number ?? -1) - (a.edition_number ?? -1))[0]
    ?? null;
  const resolvedEditionId = edition?.id ?? '';

  const hostQuery = useQuery({
    queryKey: ['studio2-host-management', resolvedEditionId || 'none'],
    enabled: Boolean(resolvedEditionId),
    queryFn: () => loadStudio2HostManagement(resolvedEditionId),
    staleTime: 10_000,
  });
  const snapshot = hostQuery.data ?? null;
  const summary = useMemo(() => snapshot ? summarizeStudio2HostManagement(snapshot) : null, [snapshot]);
  const selectedBid = summary?.selected ?? null;

  useEffect(() => {
    if (!snapshot?.operations) {
      setReadiness(null);
      setOperationsNotes('');
      return;
    }
    setReadiness({ ...snapshot.operations.readiness });
    setOperationsNotes(snapshot.operations.notes ?? '');
  }, [snapshot?.operations?.revision]);

  const mutation = useMutation({
    mutationFn: (input: {
      action: HostOperationAction;
      reason: string;
      bidId?: string | null;
      expectedRevision?: number | null;
      payload?: Record<string, unknown>;
    }) => executeStudio2HostOperation({
      editionId: resolvedEditionId,
      action: input.action,
      reason: input.reason,
      executionId: crypto.randomUUID(),
      bidId: input.bidId,
      expectedRevision: input.expectedRevision,
      payload: input.payload,
    }),
    onSuccess: async (execution) => {
      await queryClient.invalidateQueries({ queryKey: ['studio2-host-management', resolvedEditionId] });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['editions'] }),
        queryClient.invalidateQueries({ queryKey: ['shows'] }),
        queryClient.invalidateQueries({ queryKey: ['show'] }),
      ]);
      toast.success(`${hostOperationLabel(execution.action)} completed.`);
    },
    onError: (error) => toast.error(errorText(error)),
  });

  function openCreateBid() {
    setBidSheet({ mode: 'create' });
    setBidDraft(emptyBidDraft);
    setBidReason('');
  }

  function openEditBid(bid: HostBid) {
    setBidSheet({ mode: 'edit', bid });
    setBidDraft(draftFromBid(bid));
    setBidReason('');
  }

  async function saveBid() {
    if (!bidSheet) return;
    if (!bidDraft.countryId || bidDraft.city.trim().length < 2 || bidDraft.venueName.trim().length < 2) {
      toast.error('Country, city and venue are required.');
      return;
    }
    if (bidReason.trim().length < 5) {
      toast.error('Add an audit reason of at least 5 characters.');
      return;
    }
    const payload = bidPayload(bidDraft);
    await mutation.mutateAsync({
      action: bidSheet.mode === 'create' ? 'create_bid' : 'update_bid',
      reason: bidReason,
      bidId: bidSheet.bid?.id,
      expectedRevision: bidSheet.bid?.revision,
      payload,
    });
    setBidSheet(null);
    setBidDraft(emptyBidDraft);
    setBidReason('');
  }

  function requestBidAction(bid: HostBid, action: HostOperationAction) {
    const descriptions: Partial<Record<HostOperationAction, string>> = {
      submit_bid: 'Submit this bid for formal eligibility review. Bid details remain editable until a terminal decision.',
      mark_eligible: 'Confirm that this bid meets the minimum hosting requirements and may proceed to evaluation.',
      shortlist_bid: 'Move this eligible bid onto the official host shortlist.',
      reject_bid: 'Remove this bid from active consideration. The historical bid and evaluations are preserved.',
      withdraw_bid: 'Withdraw this bid from the active host process. The historical record is preserved.',
      select_bid: 'Select this bid as the canonical edition host. Edition host country and city will update immediately; show-level overrides are preserved until explicitly synchronized.',
    };
    setPendingReason('');
    setPending({
      action,
      bidId: bid.id,
      expectedRevision: bid.revision,
      title: hostOperationLabel(action),
      description: descriptions[action] ?? 'Confirm this host management operation.',
      confirmationText: `${bid.city} · ${bid.venueName}`,
      danger: ['reject_bid', 'withdraw_bid', 'select_bid'].includes(action),
    });
  }

  async function confirmPending() {
    if (!pending) return;
    if (pendingReason.trim().length < 5) {
      toast.error('Add an audit reason of at least 5 characters.');
      return;
    }
    await mutation.mutateAsync({
      action: pending.action,
      reason: pendingReason,
      bidId: pending.bidId,
      expectedRevision: pending.expectedRevision,
      payload: pending.payload,
    });
    setPending(null);
    setPendingReason('');
  }

  function openEvaluation(bid: HostBid) {
    setEvaluationTarget(bid);
    setEvaluationCriterion('technical');
    setEvaluationScore('');
    setEvaluationComment('');
    setEvaluationReason('');
  }

  async function saveEvaluation() {
    if (!evaluationTarget) return;
    const score = Number(evaluationScore);
    if (!Number.isFinite(score) || score < 0 || score > 10) {
      toast.error('Evaluation score must be between 0 and 10.');
      return;
    }
    if (evaluationReason.trim().length < 5) {
      toast.error('Add an audit reason of at least 5 characters.');
      return;
    }
    await mutation.mutateAsync({
      action: 'evaluate_bid',
      reason: evaluationReason,
      bidId: evaluationTarget.id,
      expectedRevision: evaluationTarget.revision,
      payload: { criterion: evaluationCriterion, score, comment: evaluationComment.trim() || null },
    });
    setEvaluationTarget(null);
  }

  async function saveOperations() {
    if (!snapshot?.operations || !readiness) return;
    if (operationsReason.trim().length < 5) {
      toast.error('Add an audit reason of at least 5 characters.');
      return;
    }
    await mutation.mutateAsync({
      action: 'update_operations',
      reason: operationsReason,
      expectedRevision: snapshot.operations.revision,
      payload: { ...readiness, notes: operationsNotes.trim() || null },
    });
    setOperationsReason('');
  }

  function requestSyncShows() {
    if (!snapshot?.operations || !selectedBid) return;
    setPendingReason('');
    setPending({
      action: 'sync_show_hosts',
      expectedRevision: snapshot.operations.revision,
      title: 'Use selected host for every show',
      description: `This replaces every show-level host override in ${edition ? editionLabel(edition) : 'this edition'} with ${selectedBid.city}, ${selectedBid.countryName}. Split-host assignments will be lost unless you set them again afterwards.`,
      confirmationText: edition ? editionLabel(edition) : selectedBid.city,
      danger: true,
    });
  }

  function openShowHost(show: HostShowAssignment) {
    setShowTarget(show);
    setShowCountryId(show.hostCountryId ?? '');
    setShowCity(show.hostCity ?? '');
    setShowReason('');
  }

  async function saveShowHost() {
    if (!showTarget || !snapshot?.operations) return;
    if (showReason.trim().length < 5) {
      toast.error('Add an audit reason of at least 5 characters.');
      return;
    }
    await mutation.mutateAsync({
      action: 'set_show_host',
      reason: showReason,
      expectedRevision: snapshot.operations.revision,
      payload: { showId: showTarget.showId, countryId: showCountryId || null, city: showCity.trim() || null },
    });
    setShowTarget(null);
  }

  const loading = editionsQuery.isLoading || countriesQuery.isLoading || hostQuery.isLoading;
  const error = editionsQuery.error ?? countriesQuery.error ?? hostQuery.error;

  return (
    <AdminPage>
      <div className="mx-auto max-w-[1500px] space-y-4">
        <AdminPageHeader
          eyebrow="Solaris Studio 2 · Host Management"
          title="Host Management"
          description="Run the complete host process from candidate bids and evaluation to canonical selection, show assignments and operational readiness. Public host locations remain backed by the existing edition and show host fields."
          actions={edition ? (
            <div className="flex flex-wrap gap-2">
              <a href={`/admin/${edition.slug}`} className="admin-action-secondary">Edition <ExternalLink className="size-4" /></a>
              <a href={`/admin/design/${edition.slug}`} className="admin-action-secondary">Broadcast <RadioTower className="size-4" /></a>
              <a href="/admin/communications" className="admin-action-secondary">Communications <ExternalLink className="size-4" /></a>
            </div>
          ) : undefined}
        />

        <HostTabs view={view} onChange={setView} />

        {!edition && !editionsQuery.isLoading ? (
          <AdminCard><AdminEmptyState icon={MapPinned} title="No edition selected" description="Select an edition before managing the host process." /></AdminCard>
        ) : loading ? (
          <AdminCard><p className="py-12 text-center text-sm text-muted-foreground">Building the host management snapshot…</p></AdminCard>
        ) : error ? (
          <AdminCard><AdminEmptyState icon={AlertTriangle} title="Host Management could not load" description={errorText(error)} /></AdminCard>
        ) : snapshot && summary ? (
          <>
            {view === 'overview' ? <OverviewView snapshot={snapshot} summary={summary} onView={setView} onCreateBid={openCreateBid} /> : null}
            {view === 'bids' ? (
              <BidsView
                snapshot={snapshot}
                busy={mutation.isPending}
                onCreateBid={openCreateBid}
                onEditBid={openEditBid}
                onEvaluate={openEvaluation}
                onAction={requestBidAction}
              />
            ) : null}
            {view === 'evaluation' ? <EvaluationView snapshot={snapshot} onEvaluate={openEvaluation} /> : null}
            {view === 'selected' ? (
              <SelectedHostView
                snapshot={snapshot}
                selectedBid={selectedBid}
                countries={countries}
                busy={mutation.isPending}
                onEditShow={openShowHost}
                onSyncShows={requestSyncShows}
              />
            ) : null}
            {view === 'operations' ? (
              <OperationsView
                snapshot={snapshot}
                readiness={readiness}
                setReadiness={setReadiness}
                notes={operationsNotes}
                setNotes={setOperationsNotes}
                reason={operationsReason}
                setReason={setOperationsReason}
                busy={mutation.isPending}
                onSave={saveOperations}
              />
            ) : null}
          </>
        ) : null}

        <AdminSheet
          open={Boolean(bidSheet)}
          onClose={() => !mutation.isPending && setBidSheet(null)}
          title={bidSheet?.mode === 'edit' ? 'Edit host bid' : 'Create host bid'}
          description="Bid details are internal operational data until a host is selected. Supporting links may point to bid documents, venue plans or media."
        >
          <BidForm draft={bidDraft} setDraft={setBidDraft} countries={countries} reason={bidReason} setReason={setBidReason} busy={mutation.isPending} onSave={saveBid} onCancel={() => setBidSheet(null)} />
        </AdminSheet>

        <AdminSheet
          open={Boolean(evaluationTarget)}
          onClose={() => !mutation.isPending && setEvaluationTarget(null)}
          title={evaluationTarget ? `Evaluate ${evaluationTarget.city}` : 'Evaluate host bid'}
          description="Scores are evidence for comparison, not an automatic host-selection engine. The final selection is always an explicit organizer decision."
        >
          <div className="space-y-4">
            <label className="block">
              <span className="admin-section-label">Criterion</span>
              <select className="admin-input mt-2 w-full" value={evaluationCriterion} onChange={(event) => setEvaluationCriterion(event.target.value as HostEvaluationCriterion)}>
                {HOST_EVALUATION_CRITERIA.map((criterion) => <option key={criterion} value={criterion}>{criterionLabels[criterion]}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="admin-section-label">Score · 0–10</span>
              <input className="admin-input mt-2 w-full" type="number" min="0" max="10" step="0.5" value={evaluationScore} onChange={(event) => setEvaluationScore(event.target.value)} />
            </label>
            <label className="block">
              <span className="admin-section-label">Evaluation comment</span>
              <textarea className="admin-input mt-2 min-h-24 w-full resize-y" value={evaluationComment} onChange={(event) => setEvaluationComment(event.target.value)} />
            </label>
            <AuditReason value={evaluationReason} onChange={setEvaluationReason} disabled={mutation.isPending} />
            <div className="admin-sticky-actions grid grid-cols-[auto_minmax(0,1fr)] gap-2">
              <button type="button" className="admin-action-secondary" disabled={mutation.isPending} onClick={() => setEvaluationTarget(null)}>Cancel</button>
              <button type="button" className="admin-action-primary w-full" disabled={mutation.isPending} onClick={() => void saveEvaluation()}>{mutation.isPending ? 'Saving…' : 'Save evaluation'}</button>
            </div>
          </div>
        </AdminSheet>

        <AdminSheet
          open={Boolean(showTarget)}
          onClose={() => !mutation.isPending && setShowTarget(null)}
          title={showTarget ? `${showTarget.showName} host` : 'Show host'}
          description="Leave both fields empty to inherit the edition-level selected host. Set them to preserve a split-host show."
        >
          <div className="space-y-4">
            <label className="block">
              <span className="admin-section-label">Host country override</span>
              <select className="admin-input mt-2 w-full" value={showCountryId} onChange={(event) => setShowCountryId(event.target.value)}>
                <option value="">Inherit edition host</option>
                {[...countries].sort((a, b) => a.name.localeCompare(b.name)).map((country) => <option key={country.id} value={country.id}>{country.name}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="admin-section-label">Host city override</span>
              <input className="admin-input mt-2 w-full" value={showCity} placeholder="Leave empty to inherit edition host" onChange={(event) => setShowCity(event.target.value)} />
            </label>
            <AuditReason value={showReason} onChange={setShowReason} disabled={mutation.isPending} />
            <div className="admin-sticky-actions grid grid-cols-[auto_minmax(0,1fr)] gap-2">
              <button type="button" className="admin-action-secondary" disabled={mutation.isPending} onClick={() => setShowTarget(null)}>Cancel</button>
              <button type="button" className="admin-action-primary w-full" disabled={mutation.isPending} onClick={() => void saveShowHost()}>{mutation.isPending ? 'Saving…' : 'Save show host'}</button>
            </div>
          </div>
        </AdminSheet>

        <AdminConfirmSheet
          open={Boolean(pending)}
          onClose={() => !mutation.isPending && setPending(null)}
          onConfirm={confirmPending}
          title={pending?.title ?? 'Host operation'}
          description={pending ? (
            <div className="space-y-4">
              <p>{pending.description}</p>
              <AuditReason value={pendingReason} onChange={setPendingReason} disabled={mutation.isPending} />
            </div>
          ) : null}
          confirmLabel={pending?.title ?? 'Confirm'}
          confirmationText={pending?.confirmationText}
          confirmationHint={pending ? `Type ${pending.confirmationText} to confirm` : undefined}
          busy={mutation.isPending}
          danger={pending?.danger}
        />
      </div>
    </AdminPage>
  );
}

function HostTabs({ view, onChange }: { view: HostView; onChange: (view: HostView) => void }) {
  const tabs: Array<{ id: HostView; label: string }> = [
    { id: 'overview', label: 'Overview' },
    { id: 'bids', label: 'Bids' },
    { id: 'evaluation', label: 'Evaluation' },
    { id: 'selected', label: 'Selected host' },
    { id: 'operations', label: 'Operations' },
  ];
  return <div className="flex gap-2 overflow-x-auto pb-1" aria-label="Host management sections">
    {tabs.map((tab) => <button key={tab.id} type="button" className={view === tab.id ? 'admin-action-primary shrink-0' : 'admin-action-secondary shrink-0'} onClick={() => onChange(tab.id)}>{tab.label}</button>)}
  </div>;
}

function OverviewView({ snapshot, summary, onView, onCreateBid }: {
  snapshot: HostManagementSnapshot;
  summary: ReturnType<typeof summarizeStudio2HostManagement>;
  onView: (view: HostView) => void;
  onCreateBid: () => void;
}) {
  const selected = summary.selected;
  return <div className="space-y-4">
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <Metric label="Bids" value={summary.bids} icon={FileCheck2} />
      <Metric label="Submitted" value={summary.submitted} icon={ClipboardCheck} />
      <Metric label="Eligible" value={summary.eligible} icon={ShieldCheck} />
      <Metric label="Shortlisted" value={summary.shortlisted} icon={Star} />
      <Metric label="Operational readiness" value={`${summary.readiness.percent}%`} icon={Gauge} />
    </section>

    {selected ? (
      <AdminCard strong>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2"><AdminStatus tone="ready">Selected host</AdminStatus><AdminStatus tone="neutral">v{selected.revision}</AdminStatus></div>
            <h2 className="mt-3 text-2xl font-bold text-foreground">{selected.city}, {selected.countryName}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{selected.venueName}{selected.venueCapacity ? ` · ${selected.venueCapacity.toLocaleString()} capacity` : ''}</p>
            <p className="mt-3 text-sm text-muted-foreground">Operational readiness: {summary.readiness.ready}/{summary.readiness.total} areas complete.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="admin-action-secondary" onClick={() => onView('selected')}>Host details</button>
            <button type="button" className="admin-action-primary" onClick={() => onView('operations')}>Open operations</button>
          </div>
        </div>
      </AdminCard>
    ) : (
      <AdminCard><AdminEmptyState icon={MapPinned} title="Host selection pending" description={snapshot.bids.length ? 'Review submitted bids, establish eligibility, shortlist candidates and select the canonical host.' : 'Create the first candidate host bid to begin the selection process.'} action={<button type="button" className="admin-action-primary" onClick={onCreateBid}><Plus className="size-4" /> Create host bid</button>} /></AdminCard>
    )}

    <AdminCard>
      <div className="grid gap-3 lg:grid-cols-3">
        <OverviewStep number="1" title="Bids & eligibility" description="Capture venue, transport, accommodation, production, accessibility and supporting bid evidence." onClick={() => onView('bids')} />
        <OverviewStep number="2" title="Evaluation & selection" description="Score comparable criteria and make a deliberate human host-selection decision." onClick={() => onView('evaluation')} />
        <OverviewStep number="3" title="Host operations" description="Track delivery readiness and preserve show-level split-host assignments where required." onClick={() => onView('operations')} />
      </div>
    </AdminCard>
  </div>;
}

function BidsView({ snapshot, busy, onCreateBid, onEditBid, onEvaluate, onAction }: {
  snapshot: HostManagementSnapshot;
  busy: boolean;
  onCreateBid: () => void;
  onEditBid: (bid: HostBid) => void;
  onEvaluate: (bid: HostBid) => void;
  onAction: (bid: HostBid, action: HostOperationAction) => void;
}) {
  return <div className="space-y-4">
    <div className="flex justify-end"><button type="button" className="admin-action-primary" onClick={onCreateBid}><Plus className="size-4" /> Create bid</button></div>
    {!snapshot.bids.length ? <AdminCard><AdminEmptyState icon={Building2} title="No host bids yet" description="Create a candidate city and venue bid to begin host selection." /></AdminCard> : (
      <div className="space-y-3">
        {snapshot.bids.map((bid) => <BidCard key={bid.id} bid={bid} busy={busy} onEdit={onEditBid} onEvaluate={onEvaluate} onAction={onAction} />)}
      </div>
    )}
  </div>;
}

function BidCard({ bid, busy, onEdit, onEvaluate, onAction }: {
  bid: HostBid;
  busy: boolean;
  onEdit: (bid: HostBid) => void;
  onEvaluate: (bid: HostBid) => void;
  onAction: (bid: HostBid, action: HostOperationAction) => void;
}) {
  const actions = availableHostBidActions(bid);
  return <AdminCard className="!p-4">
    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-bold text-foreground">{bid.city}, {bid.countryName}</h2>
          <AdminStatus tone={hostBidStatusTone(bid.status)}>{hostBidStatusLabel(bid.status)}</AdminStatus>
          <AdminStatus tone="neutral">v{bid.revision}</AdminStatus>
        </div>
        <p className="mt-1 text-sm font-semibold text-foreground">{bid.venueName}{bid.venueCapacity ? ` · ${bid.venueCapacity.toLocaleString()} capacity` : ''}</p>
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
          <span>{bid.localBroadcaster || 'Broadcaster TBC'}</span>
          <span>{bid.timezone || 'Timezone TBC'}</span>
          <span>{bid.accommodationBeds != null ? `${bid.accommodationBeds.toLocaleString()} accommodation beds` : 'Accommodation capacity TBC'}</span>
          <span>{bid.averageScore != null ? `${bid.averageScore.toFixed(2)}/10 average · ${bid.evaluationCount} scores` : 'Not scored yet'}</span>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 xl:max-w-[620px] xl:justify-end">
        {actions.includes('update_bid') ? <button type="button" disabled={busy} className="admin-action-secondary" onClick={() => onEdit(bid)}><Pencil className="size-4" /> Edit</button> : null}
        {actions.includes('evaluate_bid') ? <button type="button" disabled={busy} className="admin-action-secondary" onClick={() => onEvaluate(bid)}><Star className="size-4" /> Evaluate</button> : null}
        {actions.filter((action) => !['update_bid', 'evaluate_bid'].includes(action)).map((action) => (
          <button key={action} type="button" disabled={busy} className={action === 'select_bid' ? 'admin-action-primary' : 'admin-action-secondary'} onClick={() => onAction(bid, action)}>{actionIcon(action)} {hostOperationLabel(action)}</button>
        ))}
      </div>
    </div>
    <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
      <InfoCell icon={Plane} label="Airport" value={bid.airportSummary || 'Not supplied'} />
      <InfoCell icon={TrainFront} label="Transport" value={bid.transportSummary || 'Not supplied'} />
      <InfoCell icon={RadioTower} label="Production" value={bid.productionSummary || 'Not supplied'} />
      <InfoCell icon={Users} label="Accessibility" value={bid.accessibilitySummary || 'Not supplied'} />
    </div>
    {bid.supportingLinks.length ? <div className="mt-4 flex flex-wrap gap-2 border-t border-white/[0.07] pt-4">{bid.supportingLinks.map((link) => <a key={link} href={link} target="_blank" rel="noreferrer" className="admin-action-quiet">Bid evidence <ExternalLink className="size-3.5" /></a>)}</div> : null}
  </AdminCard>;
}

function EvaluationView({ snapshot, onEvaluate }: { snapshot: HostManagementSnapshot; onEvaluate: (bid: HostBid) => void }) {
  const active = snapshot.bids.filter((bid) => ['submitted', 'eligible', 'shortlisted'].includes(bid.status));
  const averages = useMemo(() => HOST_EVALUATION_CRITERIA.map((criterion) => ({
    criterion,
    bids: active.map((bid) => {
      const scores = bid.evaluations.filter((evaluation) => evaluation.criterion === criterion).map((evaluation) => evaluation.score);
      return { bid, average: scores.length ? scores.reduce((sum, score) => sum + score, 0) / scores.length : null };
    }),
  })), [active]);

  if (!active.length) return <AdminCard><AdminEmptyState icon={Star} title="No bids ready for evaluation" description="Submit at least one host bid before scoring evaluation criteria." /></AdminCard>;

  return <div className="space-y-4">
    <AdminCard>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead><tr className="border-b border-white/[0.07] text-xs uppercase tracking-[0.16em] text-muted-foreground"><th className="px-3 py-3">Criterion</th>{active.map((bid) => <th key={bid.id} className="px-3 py-3">{bid.city}</th>)}</tr></thead>
          <tbody>{averages.map((row) => <tr key={row.criterion} className="border-b border-white/[0.05]"><td className="px-3 py-3 font-semibold text-foreground">{criterionLabels[row.criterion]}</td>{row.bids.map(({ bid, average }) => <td key={bid.id} className="px-3 py-3"><span className="numeric font-bold text-foreground">{average == null ? '—' : average.toFixed(1)}</span><span className="text-xs text-muted-foreground"> / 10</span></td>)}</tr>)}</tbody>
          <tfoot><tr><td className="px-3 py-4 font-bold text-foreground">Overall</td>{active.map((bid) => <td key={bid.id} className="px-3 py-4"><div className="flex items-center gap-2"><span className="numeric text-lg font-bold">{bid.averageScore == null ? '—' : bid.averageScore.toFixed(2)}</span><button type="button" className="admin-action-quiet" onClick={() => onEvaluate(bid)}>Score</button></div></td>)}</tr></tfoot>
        </table>
      </div>
    </AdminCard>
    <AdminCard><p className="text-sm leading-6 text-muted-foreground">Evaluation scores support comparison only. They never select or reject a host automatically. Eligibility, shortlist and final host selection remain explicit audited organizer operations.</p></AdminCard>
  </div>;
}

function SelectedHostView({ snapshot, selectedBid, countries, busy, onEditShow, onSyncShows }: {
  snapshot: HostManagementSnapshot;
  selectedBid: HostBid | null;
  countries: Array<{ id: string; name: string }>;
  busy: boolean;
  onEditShow: (show: HostShowAssignment) => void;
  onSyncShows: () => void;
}) {
  if (!selectedBid) return <AdminCard><AdminEmptyState icon={MapPin} title="No host selected" description="Select an eligible or shortlisted bid before configuring host delivery and show locations." /></AdminCard>;
  return <div className="space-y-4">
    <AdminCard strong>
      <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
        <div>
          <div className="flex flex-wrap items-center gap-2"><AdminStatus tone="ready">Canonical host</AdminStatus><AdminStatus tone="neutral">{selectedBid.countryName}</AdminStatus></div>
          <h2 className="mt-3 text-3xl font-bold text-foreground">{selectedBid.city}</h2>
          <p className="mt-1 text-base font-semibold text-foreground">{selectedBid.venueName}</p>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">Edition host fields now resolve to {snapshot.edition.hostCity || selectedBid.city}. Show-level host assignments below may intentionally differ for split-host editions.</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Detail label="Venue capacity" value={selectedBid.venueCapacity?.toLocaleString() ?? 'TBC'} />
          <Detail label="Accommodation" value={selectedBid.accommodationBeds != null ? selectedBid.accommodationBeds.toLocaleString() : 'TBC'} />
          <Detail label="Broadcaster" value={selectedBid.localBroadcaster ?? 'TBC'} />
          <Detail label="Timezone" value={selectedBid.timezone ?? 'TBC'} />
        </div>
      </div>
    </AdminCard>

    <AdminCard>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div><h3 className="font-bold text-foreground">Show host assignments</h3><p className="mt-1 text-xs text-muted-foreground">Per-show overrides are canonical in the existing show host fields. Empty overrides inherit the edition host.</p></div>
        <button type="button" className="admin-action-secondary" disabled={busy || !snapshot.operations} onClick={onSyncShows}>Use selected host for every show</button>
      </div>
      <div className="mt-4 space-y-2">
        {snapshot.shows.map((show) => {
          const country = countries.find((item) => item.id === show.effectiveCountryId);
          const overridden = Boolean(show.hostCountryId || show.hostCity);
          return <div key={show.showId} className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-white/[0.06] bg-white/[0.025] text-muted-foreground"><MapPin className="size-4" /></span>
            <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-foreground">{show.showName}</p><AdminStatus tone={overridden ? 'info' : 'neutral'}>{overridden ? 'Override' : 'Edition host'}</AdminStatus></div><p className="mt-1 text-xs text-muted-foreground">{country?.name ?? 'Country TBC'} · {show.effectiveCity ?? 'City TBC'}</p></div>
            <button type="button" className="admin-action-secondary !min-h-9 !px-3" disabled={busy || !snapshot.operations} onClick={() => onEditShow(show)}><Pencil className="size-4" /></button>
          </div>;
        })}
      </div>
    </AdminCard>
  </div>;
}

function OperationsView({ snapshot, readiness, setReadiness, notes, setNotes, reason, setReason, busy, onSave }: {
  snapshot: HostManagementSnapshot;
  readiness: HostOperationsReadiness | null;
  setReadiness: (value: HostOperationsReadiness) => void;
  notes: string;
  setNotes: (value: string) => void;
  reason: string;
  setReason: (value: string) => void;
  busy: boolean;
  onSave: () => Promise<void>;
}) {
  if (!snapshot.operations || !readiness) return <AdminCard><AdminEmptyState icon={Gauge} title="Host operations not active" description="Select the canonical host before tracking delivery readiness." /></AdminCard>;
  const progress = hostReadinessProgress({ ...snapshot.operations, readiness });
  return <div className="space-y-4">
    <AdminCard strong>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="admin-section-label">Delivery readiness</p><p className="mt-2 text-3xl font-bold text-foreground">{progress.percent}%</p><p className="mt-1 text-sm text-muted-foreground">{progress.ready} of {progress.total} operational areas ready · operations revision {snapshot.operations.revision}</p></div><Gauge className="size-9 text-sky-100" /></div>
    </AdminCard>
    <AdminCard>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {HOST_READINESS_KEYS.map((key) => <label key={key} className="flex cursor-pointer items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3"><input type="checkbox" checked={readiness[key]} onChange={(event) => setReadiness({ ...readiness, [key]: event.target.checked })} disabled={busy} /><span className="text-sm font-semibold text-foreground">{readinessLabels[key]}</span>{readiness[key] ? <CheckCircle2 className="ml-auto size-4 text-emerald-200" /> : <XCircle className="ml-auto size-4 text-muted-foreground" />}</label>)}
      </div>
      <label className="mt-4 block"><span className="admin-section-label">Operations notes</span><textarea className="admin-input mt-2 min-h-28 w-full resize-y" value={notes} onChange={(event) => setNotes(event.target.value)} disabled={busy} placeholder="Delivery risks, dependencies, owners or next actions…" /></label>
      <div className="mt-4"><AuditReason value={reason} onChange={setReason} disabled={busy} /></div>
      <div className="mt-4 flex justify-end"><button type="button" className="admin-action-primary" disabled={busy} onClick={() => void onSave()}>{busy ? 'Saving…' : 'Save readiness'}</button></div>
    </AdminCard>
  </div>;
}

function BidForm({ draft, setDraft, countries, reason, setReason, busy, onSave, onCancel }: {
  draft: BidDraft;
  setDraft: (draft: BidDraft) => void;
  countries: Array<{ id: string; name: string }>;
  reason: string;
  setReason: (value: string) => void;
  busy: boolean;
  onSave: () => Promise<void>;
  onCancel: () => void;
}) {
  const field = (key: keyof BidDraft, value: string) => setDraft({ ...draft, [key]: value });
  return <div className="space-y-5">
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="block"><span className="admin-section-label">Candidate country</span><select className="admin-input mt-2 w-full" value={draft.countryId} onChange={(event) => field('countryId', event.target.value)}><option value="">Choose country</option>{[...countries].sort((a, b) => a.name.localeCompare(b.name)).map((country) => <option key={country.id} value={country.id}>{country.name}</option>)}</select></label>
      <TextField label="City" value={draft.city} onChange={(value) => field('city', value)} />
      <TextField label="Venue" value={draft.venueName} onChange={(value) => field('venueName', value)} />
      <TextField label="Venue capacity" value={draft.venueCapacity} type="number" onChange={(value) => field('venueCapacity', value)} />
      <TextField label="Venue address" value={draft.venueAddress} onChange={(value) => field('venueAddress', value)} />
      <TextField label="Accommodation beds" value={draft.accommodationBeds} type="number" onChange={(value) => field('accommodationBeds', value)} />
      <TextField label="Local broadcaster" value={draft.localBroadcaster} onChange={(value) => field('localBroadcaster', value)} />
      <TextField label="Timezone" value={draft.timezone} placeholder="Europe/Helsinki" onChange={(value) => field('timezone', value)} />
      <TextField label="Latitude" value={draft.latitude} type="number" onChange={(value) => field('latitude', value)} />
      <TextField label="Longitude" value={draft.longitude} type="number" onChange={(value) => field('longitude', value)} />
    </div>
    <TextAreaField label="Airport & international access" value={draft.airportSummary} onChange={(value) => field('airportSummary', value)} />
    <TextAreaField label="Local transport" value={draft.transportSummary} onChange={(value) => field('transportSummary', value)} />
    <TextAreaField label="Production infrastructure" value={draft.productionSummary} onChange={(value) => field('productionSummary', value)} />
    <TextAreaField label="Accessibility" value={draft.accessibilitySummary} onChange={(value) => field('accessibilitySummary', value)} />
    <TextAreaField label="Sustainability" value={draft.sustainabilitySummary} onChange={(value) => field('sustainabilitySummary', value)} />
    <label className="block"><span className="admin-section-label">Supporting links · one URL per line</span><textarea className="admin-input mt-2 min-h-24 w-full resize-y" value={draft.supportingLinks} onChange={(event) => field('supportingLinks', event.target.value)} placeholder="https://…" /></label>
    <AuditReason value={reason} onChange={setReason} disabled={busy} />
    <div className="admin-sticky-actions grid grid-cols-[auto_minmax(0,1fr)] gap-2"><button type="button" className="admin-action-secondary" disabled={busy} onClick={onCancel}>Cancel</button><button type="button" className="admin-action-primary w-full" disabled={busy} onClick={() => void onSave()}>{busy ? 'Saving…' : 'Save host bid'}</button></div>
  </div>;
}

function AuditReason({ value, onChange, disabled }: { value: string; onChange: (value: string) => void; disabled?: boolean }) {
  return <label className="block"><span className="admin-section-label">Audit reason</span><textarea className="admin-input mt-2 min-h-20 w-full resize-y" value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled} placeholder="Why is this host operation being performed?" /><span className="mt-1 block text-xs text-muted-foreground">Required. Stored with the immutable operation receipt and Studio 2 contest event.</span></label>;
}

function Metric({ label, value, icon: Icon }: { label: string; value: string | number; icon: LucideIcon }) {
  return <div className="admin-card p-4"><div className="flex items-start justify-between gap-3"><div><p className="admin-section-label">{label}</p><p className="numeric mt-2 text-2xl font-bold text-foreground">{value}</p></div><span className="grid size-9 place-items-center rounded-xl border border-white/[0.07] bg-white/[0.03] text-sky-100"><Icon className="size-4" /></span></div></div>;
}

function OverviewStep({ number, title, description, onClick }: { number: string; title: string; description: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4 text-left transition-colors hover:bg-white/[0.04]"><span className="numeric text-xs font-bold text-sky-100">{number}</span><h3 className="mt-2 font-bold text-foreground">{title}</h3><p className="mt-2 text-xs leading-5 text-muted-foreground">{description}</p></button>;
}

function InfoCell({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3"><div className="flex items-center gap-2 text-xs text-muted-foreground"><Icon className="size-3.5" /> {label}</div><p className="mt-2 line-clamp-3 text-sm leading-5 text-foreground">{value}</p></div>;
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3"><p className="admin-section-label">{label}</p><p className="mt-2 font-semibold text-foreground">{value}</p></div>;
}

function TextField({ label, value, onChange, type = 'text', placeholder }: { label: string; value: string; onChange: (value: string) => void; type?: string; placeholder?: string }) {
  return <label className="block"><span className="admin-section-label">{label}</span><input className="admin-input mt-2 w-full" type={type} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} /></label>;
}

function TextAreaField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="block"><span className="admin-section-label">{label}</span><textarea className="admin-input mt-2 min-h-24 w-full resize-y" value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}

function draftFromBid(bid: HostBid): BidDraft {
  return {
    countryId: bid.countryId,
    city: bid.city,
    venueName: bid.venueName,
    venueCapacity: bid.venueCapacity?.toString() ?? '',
    venueAddress: bid.venueAddress ?? '',
    airportSummary: bid.airportSummary ?? '',
    transportSummary: bid.transportSummary ?? '',
    accommodationBeds: bid.accommodationBeds?.toString() ?? '',
    productionSummary: bid.productionSummary ?? '',
    sustainabilitySummary: bid.sustainabilitySummary ?? '',
    accessibilitySummary: bid.accessibilitySummary ?? '',
    localBroadcaster: bid.localBroadcaster ?? '',
    timezone: bid.timezone ?? '',
    latitude: bid.latitude?.toString() ?? '',
    longitude: bid.longitude?.toString() ?? '',
    supportingLinks: bid.supportingLinks.join('\n'),
  };
}

function bidPayload(draft: BidDraft): HostBidInput & Record<string, unknown> {
  const numberOrNull = (value: string) => value.trim() ? Number(value) : null;
  return {
    countryId: draft.countryId,
    city: draft.city.trim(),
    venueName: draft.venueName.trim(),
    venueCapacity: numberOrNull(draft.venueCapacity),
    venueAddress: draft.venueAddress.trim() || null,
    airportSummary: draft.airportSummary.trim() || null,
    transportSummary: draft.transportSummary.trim() || null,
    accommodationBeds: numberOrNull(draft.accommodationBeds),
    productionSummary: draft.productionSummary.trim() || null,
    sustainabilitySummary: draft.sustainabilitySummary.trim() || null,
    accessibilitySummary: draft.accessibilitySummary.trim() || null,
    localBroadcaster: draft.localBroadcaster.trim() || null,
    timezone: draft.timezone.trim() || null,
    latitude: numberOrNull(draft.latitude),
    longitude: numberOrNull(draft.longitude),
    supportingLinks: draft.supportingLinks.split('\n').map((link) => link.trim()).filter(Boolean),
  };
}

function actionIcon(action: HostOperationAction) {
  switch (action) {
    case 'submit_bid': return <FileCheck2 className="size-4" />;
    case 'mark_eligible': return <ShieldCheck className="size-4" />;
    case 'shortlist_bid': return <Star className="size-4" />;
    case 'select_bid': return <MapPinned className="size-4" />;
    case 'reject_bid':
    case 'withdraw_bid': return <XCircle className="size-4" />;
    default: return null;
  }
}

function errorText(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === 'object') {
    const value = error as Record<string, unknown>;
    for (const key of ['message', 'details', 'hint']) {
      if (typeof value[key] === 'string' && value[key]) return value[key] as string;
    }
  }
  return 'Host Management operation failed.';
}
