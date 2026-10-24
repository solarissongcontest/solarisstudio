import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { AlertTriangle, CheckCircle2, RadioTower, ShieldAlert } from 'lucide-react';

import { useAdminContext } from '@/components/admin/AdminContext';
import { ControlRoomImmediateAttention } from '@/components/admin/ControlRoomImmediateAttention';
import { AdminPage } from '@/components/admin/AdminShell';
import {
  AdminCard,
  AdminCardHeader,
  AdminConfirmSheet,
  AdminEmptyState,
  AdminPageHeader,
  AdminStatus,
} from '@/components/admin/AdminUI';
import { buildEditionReadiness, type EditionReadiness } from '@/lib/admin-readiness';
import { useAdminReadinessData } from '@/lib/admin-readiness-data';
import { useEditions, useShows } from '@/lib/data';
import { EDITION_STATES, getEditionTransition, type EditionState } from '@/lib/edition-state';
import {
  INCIDENT_SEVERITIES,
  INCIDENT_STATUSES,
  canTransitionIncident,
  type IncidentSeverity,
  type IncidentStatus,
} from '@/lib/incident-command';
import { studio2ControlRoom, type Studio2ControlRoomSnapshot } from '@/lib/studio2-control-room';

type TransitionRisk = 'normal' | 'elevated' | 'critical';

type PendingControlReview =
  | {
      kind: 'edition-transition';
      editionId: string;
      editionLabel: string;
      from: EditionState;
      to: EditionState;
      risk: TransitionRisk;
      commandReason: string;
      runtimeVersion: number;
      approvalRequestId?: string | null;
      approvalExpiresAt?: string | null;
    }
  | {
      kind: 'approve-transition';
      editionId: string;
      editionLabel: string;
      requestId: string;
      from: EditionState;
      to: EditionState;
      requestReason: string;
      expiresAt: string;
      runtimeVersion: number;
    }
  | {
      kind: 'incident-transition';
      editionId: string;
      editionLabel: string;
      incidentId: string;
      title: string;
      from: IncidentStatus;
      to: IncidentStatus;
      severity: IncidentSeverity;
    };

export const Route = createFileRoute('/_authenticated/admin/control-room')({
  head: () => ({
    meta: [
      { title: 'Control Room — Solaris Organizer' },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: ControlRoomV2,
});

function ControlRoomV2() {
  const { editionId } = useAdminContext();
  const editionIdRef = useRef(editionId);
  editionIdRef.current = editionId;
  const queryClient = useQueryClient();
  const { data: editions = [] } = useEditions();
  const showsQuery = useShows(editionId || undefined);
  const selectedEdition = useMemo(
    () => editions.find((edition) => edition.id === editionId) ?? null,
    [editionId, editions],
  );
  const readinessDataQuery = useAdminReadinessData(editionId || undefined);
  const readiness = useMemo(
    () =>
      selectedEdition && readinessDataQuery.data && showsQuery.data
        ? buildEditionReadiness({
            edition: selectedEdition,
            shows: showsQuery.data,
            participants: readinessDataQuery.data.participants,
            voters: readinessDataQuery.data.voters,
            juryVotes: readinessDataQuery.data.juryVotes,
            juryBallotStatuses: readinessDataQuery.data.juryBallotStatuses,
            televotes: readinessDataQuery.data.televotes,
            results: readinessDataQuery.data.results,
          })
        : null,
    [readinessDataQuery.data, selectedEdition, showsQuery.data],
  );
  const [reason, setReason] = useState('');
  const [incidentTitle, setIncidentTitle] = useState('');
  const [incidentSeverity, setIncidentSeverity] = useState<IncidentSeverity>('sev3');
  const [pendingReview, setPendingReview] = useState<PendingControlReview | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [reviewChecking, setReviewChecking] = useState(false);

  useEffect(() => {
    setPendingReview(null);
    setReviewError(null);
    setReviewChecking(false);
  }, [editionId]);

  const snapshotQuery = useQuery({
    queryKey: ['studio2-control-room', editionId ?? 'none'],
    enabled: Boolean(editionId),
    queryFn: () => studio2ControlRoom.loadSnapshot(editionId!),
    refetchInterval: 60_000,
  });

  const approvalsQuery = useQuery({
    queryKey: ['studio2-transition-approvals', editionId ?? 'none'],
    enabled: Boolean(editionId),
    queryFn: () => studio2ControlRoom.listTransitionApprovals(editionId!),
    refetchInterval: 60_000,
  });

  const refresh = async (targetEditionId = editionId) => {
    if (!targetEditionId) return;
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['studio2-control-room', targetEditionId] }),
      queryClient.invalidateQueries({ queryKey: ['studio2-transition-approvals', targetEditionId] }),
    ]);
  };

  const transitionEdition = useMutation({
    mutationFn: ({
      commandEditionId,
      to,
      approvalRequestId,
      commandReason,
      expectedVersion,
    }: {
      commandEditionId: string;
      to: EditionState;
      approvalRequestId?: string | null;
      commandReason: string;
      expectedVersion: number;
    }) =>
      studio2ControlRoom.transitionEdition({
        editionId: commandEditionId,
        to,
        reason: commandReason || null,
        approvalRequestId: approvalRequestId ?? null,
        expectedVersion,
      }),
    onSuccess: async (_data, variables) => {
      setReason('');
      setPendingReview(null);
      await refresh(variables.commandEditionId);
    },
  });

  const requestApproval = useMutation({
    mutationFn: (to: EditionState) => {
      if (!editionId) throw new Error('Choose an edition before requesting approval.');
      const requestReason = reason.trim();
      if (!requestReason) throw new Error('A reason is required before requesting second approval.');
      return studio2ControlRoom.requestTransitionApproval(editionId, to, requestReason);
    },
    onSuccess: refresh,
  });

  const approveTransition = useMutation({
    mutationFn: ({ requestId }: { requestId: string; commandEditionId: string }) =>
      studio2ControlRoom.approveTransition(requestId),
    onSuccess: async (_data, variables) => {
      setPendingReview(null);
      await refresh(variables.commandEditionId);
    },
  });

  const createIncident = useMutation({
    mutationFn: () => {
      if (!editionId) throw new Error('Choose an edition before creating an incident.');
      return studio2ControlRoom.createIncident({
        editionId,
        title: incidentTitle.trim(),
        severity: incidentSeverity,
      });
    },
    onSuccess: async () => {
      setIncidentTitle('');
      setIncidentSeverity('sev3');
      await refresh();
    },
  });

  const transitionIncident = useMutation({
    mutationFn: ({ id, to }: { id: string; to: IncidentStatus; commandEditionId: string }) =>
      studio2ControlRoom.transitionIncident(id, to),
    onSuccess: async (_data, variables) => {
      setPendingReview(null);
      await refresh(variables.commandEditionId);
    },
  });

  const submitIncident = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!incidentTitle.trim()) return;
    createIncident.mutate();
  };

  const snapshot = snapshotQuery.data;
  const currentState = snapshot?.runtime.runtime.edition;
  const transitions = currentState
    ? EDITION_STATES.map((to) => getEditionTransition(currentState, to)).filter(
        (transition): transition is NonNullable<typeof transition> => transition !== null,
      )
    : [];
  const approvals = approvalsQuery.data ?? [];
  const commandError =
    transitionEdition.error ??
    requestApproval.error ??
    approveTransition.error ??
    createIncident.error ??
    transitionIncident.error ??
    approvalsQuery.error;
  const reviewBusy =
    reviewChecking || transitionEdition.isPending || approveTransition.isPending || transitionIncident.isPending;

  const openEditionReview = (
    transition: NonNullable<ReturnType<typeof getEditionTransition>>,
    approvalRequestId?: string | null,
  ) => {
    if (!snapshot || !editionId) return;
    const reviewedApproval = approvalRequestId
      ? approvals.find((approval) => approval.id === approvalRequestId) ?? null
      : null;
    if (approvalRequestId && !reviewedApproval) {
      setReviewError('The approved rollback is no longer available. Reload Control Room before reviewing it.');
      return;
    }
    setReviewError(null);
    setPendingReview({
      kind: 'edition-transition',
      editionId,
      editionLabel: selectedEdition?.name ?? editionId,
      from: transition.from,
      to: transition.to,
      risk: transition.risk,
      commandReason: reason.trim(),
      runtimeVersion: snapshot.runtime.version,
      approvalRequestId: approvalRequestId ?? null,
      approvalExpiresAt: reviewedApproval?.expiresAt ?? null,
    });
  };

  const openApprovalReview = (approval: (typeof approvals)[number]) => {
    if (!snapshot || !editionId) return;
    setReviewError(null);
    setPendingReview({
      kind: 'approve-transition',
      editionId,
      editionLabel: selectedEdition?.name ?? editionId,
      requestId: approval.id,
      from: approval.from,
      to: approval.to,
      requestReason: approval.reason,
      expiresAt: approval.expiresAt,
      runtimeVersion: snapshot.runtime.version,
    });
  };

  const openIncidentReview = (
    incident: Studio2ControlRoomSnapshot['incidents'][number],
    to: IncidentStatus,
  ) => {
    if (!editionId) return;
    setReviewError(null);
    setPendingReview({
      kind: 'incident-transition',
      editionId,
      editionLabel: selectedEdition?.name ?? editionId,
      incidentId: incident.id,
      title: incident.title,
      from: incident.status,
      to,
      severity: incident.severity,
    });
  };

  const applyReviewedCommand = async () => {
    if (!pendingReview) return;
    const reviewedEditionId = pendingReview.editionId;
    setReviewError(null);
    setReviewChecking(true);
    try {
      if (editionIdRef.current !== reviewedEditionId) {
        throw new Error('Organizer edition context changed after this review opened. Nothing was applied.');
      }

      const needsApprovals =
        pendingReview.kind === 'approve-transition' ||
        (pendingReview.kind === 'edition-transition' && Boolean(pendingReview.approvalRequestId));
      const [freshSnapshot, freshApprovals] = await Promise.all([
        studio2ControlRoom.loadSnapshot(reviewedEditionId),
        needsApprovals
          ? studio2ControlRoom.listTransitionApprovals(reviewedEditionId)
          : Promise.resolve([]),
      ]);

      if (
        editionIdRef.current !== reviewedEditionId ||
        freshSnapshot.editionId !== reviewedEditionId
      ) {
        throw new Error('Organizer edition context changed while this review was being revalidated. Nothing was applied.');
      }

      if (pendingReview.kind === 'edition-transition') {
        if (
          freshSnapshot.runtime.version !== pendingReview.runtimeVersion ||
          freshSnapshot.runtime.runtime.edition !== pendingReview.from
        ) {
          throw new Error(
            'Edition state changed after this review opened. Reload the current Control Room state before applying the transition.',
          );
        }

        if (pendingReview.approvalRequestId) {
          const freshApproval = freshApprovals.find(
            (approval) => approval.id === pendingReview.approvalRequestId,
          );
          if (
            !freshApproval ||
            freshApproval.editionId !== reviewedEditionId ||
            !freshApproval.canApply ||
            freshApproval.from !== pendingReview.from ||
            freshApproval.to !== pendingReview.to ||
            freshApproval.reason !== pendingReview.commandReason ||
            freshApproval.expiresAt !== pendingReview.approvalExpiresAt
          ) {
            throw new Error(
              'The critical-transition approval changed, expired or is no longer applicable. Reload before acting.',
            );
          }
        }

        await transitionEdition.mutateAsync({
          commandEditionId: reviewedEditionId,
          to: pendingReview.to,
          approvalRequestId: pendingReview.approvalRequestId,
          commandReason: pendingReview.commandReason,
          expectedVersion: pendingReview.runtimeVersion,
        });
        return;
      }

      if (pendingReview.kind === 'approve-transition') {
        if (
          freshSnapshot.runtime.version !== pendingReview.runtimeVersion ||
          freshSnapshot.runtime.runtime.edition !== pendingReview.from
        ) {
          throw new Error(
            'Edition state changed after this approval review opened. Reload the approval before approving it.',
          );
        }
        const freshApproval = freshApprovals.find(
          (approval) => approval.id === pendingReview.requestId,
        );
        if (
          !freshApproval ||
          freshApproval.editionId !== reviewedEditionId ||
          !freshApproval.canApprove ||
          freshApproval.from !== pendingReview.from ||
          freshApproval.to !== pendingReview.to ||
          freshApproval.reason !== pendingReview.requestReason ||
          freshApproval.expiresAt !== pendingReview.expiresAt
        ) {
          throw new Error('This approval request changed or is no longer approvable. Reload before acting.');
        }
        await approveTransition.mutateAsync({
          requestId: pendingReview.requestId,
          commandEditionId: reviewedEditionId,
        });
        return;
      }

      if (pendingReview.to === 'resolved') {
        throw new Error('Resolve incidents from Incident Command so a resolution record is reviewed with the transition.');
      }
      const liveIncident = freshSnapshot.incidents.find(
        (incident) => incident.id === pendingReview.incidentId,
      );
      if (
        !liveIncident ||
        liveIncident.editionId !== reviewedEditionId ||
        liveIncident.title !== pendingReview.title ||
        liveIncident.status !== pendingReview.from ||
        liveIncident.severity !== pendingReview.severity
      ) {
        throw new Error('Incident state changed after this review opened. Reload before applying the transition.');
      }
      await transitionIncident.mutateAsync({
        id: pendingReview.incidentId,
        to: pendingReview.to,
        commandEditionId: reviewedEditionId,
      });
    } catch (caught) {
      setReviewError(errorMessage(caught, 'The reviewed Control Room command could not be applied.'));
      await refresh(reviewedEditionId).catch(() => undefined);
    } finally {
      setReviewChecking(false);
    }
  };

  return (
    <AdminPage>
      <div className="mx-auto max-w-7xl">
        <AdminPageHeader
          eyebrow="Solaris Studio 2"
          title="Live Control Room"
          description="Run the current contest phase, incidents and live operations. Solaris checks the edition setup before forward lifecycle changes."
        />

        {!editionId ? (
          <AdminCard>
            <AdminEmptyState
              icon={RadioTower}
              title="Choose an edition"
              description="The Control Room follows the edition selected in Solaris Organizer."
            />
          </AdminCard>
        ) : snapshotQuery.isLoading ? (
          <AdminCard>
            <p className="py-10 text-center text-sm text-muted-foreground">Loading current contest state…</p>
          </AdminCard>
        ) : snapshotQuery.error || !snapshot ? (
          <AdminCard>
            <AdminEmptyState
              icon={AlertTriangle}
              title="Control Room data unavailable"
              description={errorMessage(
                snapshotQuery.error,
                'The Studio 2 persistence migrations may not be deployed for this environment yet.',
              )}
            />
          </AdminCard>
        ) : (
          <div className="space-y-4">
            {commandError ? (
              <div className="rounded-xl border border-red-300/25 bg-red-300/10 px-4 py-3 text-sm text-red-100">
                {errorMessage(commandError, 'The Control Room command failed.')}
              </div>
            ) : null}

            {snapshot.incidentSummary.crisisMode ? (
              <div className="flex items-start gap-3 rounded-2xl border border-red-300/30 bg-red-300/10 p-4 text-red-50">
                <ShieldAlert className="mt-0.5 size-5 shrink-0" />
                <div>
                  <p className="font-semibold">Crisis mode required</p>
                  <p className="mt-1 text-sm text-red-100/80">
                    At least one active SEV-1 incident exists. Resolve or downgrade the incident only after the underlying failure is controlled.
                  </p>
                </div>
              </div>
            ) : null}

            <ControlRoomImmediateAttention
              readiness={readiness}
              incidents={snapshot.incidents}
              readinessLoading={readinessDataQuery.isLoading || showsQuery.isLoading}
              readinessError={readinessDataQuery.error ?? showsQuery.error}
            />

            <section className="grid gap-4 md:grid-cols-3">
              <AdminCard strong>
                <AdminCardHeader eyebrow="Edition state" title={humanize(snapshot.runtime.runtime.edition)} />
                <div className="mt-3 flex items-center gap-2">
                  <AdminStatus tone="info">Version {snapshot.runtime.version}</AdminStatus>
                  <span className="text-xs text-muted-foreground">
                    Updated {formatTimestamp(snapshot.runtime.updatedAt)}
                  </span>
                </div>
              </AdminCard>

              <AdminCard>
                <AdminCardHeader eyebrow="Active incidents" title={`${snapshot.incidentSummary.activeCount}`} />
                <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                  {snapshot.incidentSummary.criticalCount ? (
                    <ShieldAlert className="size-4" />
                  ) : (
                    <CheckCircle2 className="size-4" />
                  )}
                  {snapshot.incidentSummary.criticalCount} SEV-1
                </div>
              </AdminCard>

              <AdminCard>
                <AdminCardHeader eyebrow="Operational history" title={`${snapshot.recentEvents.length} recent events`} />
                <p className="mt-3 text-sm text-muted-foreground">
                  Canonical state, incident, voting and communications events for this edition.
                </p>
              </AdminCard>
            </section>

            <section className="grid gap-4 xl:grid-cols-[1.15fr_.85fr]">
              <AdminCard>
                <AdminCardHeader
                  eyebrow="Edition command"
                  title={transitions.length ? 'Available state transitions' : 'No further transitions'}
                  description="Elevated transitions require a reason. Critical rollbacks require a short-lived approval from a different authorized operator. Final approval and apply steps are reviewed against the displayed runtime snapshot and revalidated from canonical state immediately before commit."
                />

                {approvals.length ? (
                  <div className="mb-4 space-y-2 rounded-xl border border-amber-200/15 bg-amber-200/[0.04] p-3">
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-amber-100/80">
                      Active critical-transition approvals
                    </p>
                    {approvals.map((approval) => (
                      <div
                        key={approval.id}
                        className="flex flex-col gap-2 rounded-lg border border-white/[0.06] bg-black/10 p-3 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-semibold">
                              {humanize(approval.from)} → {humanize(approval.to)}
                            </p>
                            <AdminStatus tone={approval.approvedBy ? 'ready' : 'attention'}>
                              {approval.approvedBy ? 'approved' : 'awaiting approval'}
                            </AdminStatus>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">{approval.reason}</p>
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            Expires {formatTimestamp(approval.expiresAt)}
                          </p>
                        </div>
                        {approval.canApprove ? (
                          <button
                            type="button"
                            disabled={approveTransition.isPending || reviewChecking}
                            onClick={() => openApprovalReview(approval)}
                            className="min-h-10 shrink-0 rounded-xl border border-amber-200/25 bg-amber-200/10 px-3 text-xs font-semibold text-amber-50 disabled:opacity-45"
                          >
                            Review second-operator approval
                          </button>
                        ) : approval.canApply ? (
                          <AdminStatus tone="ready">ready for requester to apply</AdminStatus>
                        ) : (
                          <AdminStatus tone="neutral">waiting for another operator</AdminStatus>
                        )}
                      </div>
                    ))}
                  </div>
                ) : null}

                {transitions.length ? (
                  <div className="space-y-3">
                    <label className="block text-xs font-semibold text-muted-foreground">
                      Reason for rollback / exception
                      <textarea
                        value={reason}
                        onChange={(event) => setReason(event.target.value)}
                        rows={3}
                        maxLength={500}
                        className="mt-1.5 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground"
                        placeholder="Required for elevated and critical transitions"
                      />
                    </label>

                    <div className="space-y-2">
                      {transitions.map((transition) => {
                        const missingReason = transition.risk !== 'normal' && !reason.trim();
                        const matchingApprovals = approvals.filter(
                          (approval) =>
                            approval.from === transition.from &&
                            approval.to === transition.to &&
                            approval.reason === reason.trim(),
                        );
                        const approvedForRequester = matchingApprovals.find((approval) => approval.canApply);
                        const requesterWaiting = matchingApprovals.some(
                          (approval) => !approval.approvedBy && !approval.canApprove,
                        );
                        const busy = transitionEdition.isPending || requestApproval.isPending || reviewChecking;
                        const forward = isForwardTransition(transition.from, transition.to);
                        const blockers = transitionReadinessBlockers(transition.from, transition.to, readiness);
                        const readinessUnavailable =
                          forward &&
                          EDITION_STATES.indexOf(transition.to) >= EDITION_STATES.indexOf('pre_show') &&
                          (readinessDataQuery.isLoading ||
                            showsQuery.isLoading ||
                            Boolean(readinessDataQuery.error) ||
                            Boolean(showsQuery.error) ||
                            !readiness);
                        const blockedByReadiness = blockers.length > 0 || readinessUnavailable;

                        return (
                          <div
                            key={transition.to}
                            className="flex flex-col gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] p-4 sm:flex-row sm:items-center sm:justify-between"
                          >
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="text-sm font-semibold text-foreground">
                                  {humanize(transition.from)} → {humanize(transition.to)}
                                </p>
                                <AdminStatus tone={riskTone(transition.risk)}>{transition.risk}</AdminStatus>
                              </div>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {transition.risk === 'normal'
                                  ? 'Normal lifecycle progression.'
                                  : transition.risk === 'elevated'
                                    ? 'Rollback or exceptional transition. A reason is mandatory.'
                                    : 'Critical rollback. The requester and second approver must be different authenticated operators.'}
                              </p>
                              {readinessUnavailable ? (
                                <p className="mt-2 text-xs font-semibold text-amber-100">
                                  Readiness evidence is loading or unavailable. Solaris will not advance the edition until it can verify the required setup.
                                </p>
                              ) : blockers.length ? (
                                <div className="mt-2 rounded-lg border border-rose-200/15 bg-rose-200/[0.05] p-2.5">
                                  <p className="text-xs font-semibold text-rose-100">
                                    Complete {blockers.length} prerequisite{blockers.length === 1 ? '' : 's'} before this phase.
                                  </p>
                                  <ul className="mt-1 space-y-1 text-[11px] leading-4 text-rose-100/75">
                                    {blockers.slice(0, 4).map((issue) => <li key={issue.id}>• {issue.title}</li>)}
                                  </ul>
                                </div>
                              ) : forward && EDITION_STATES.indexOf(transition.to) >= EDITION_STATES.indexOf('pre_show') ? (
                                <p className="mt-2 text-xs font-semibold text-emerald-100">
                                  Required setup checks pass for this transition.
                                </p>
                              ) : null}
                            </div>

                            {transition.risk === 'critical' ? (
                              approvedForRequester ? (
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => openEditionReview(transition, approvedForRequester.id)}
                                  className="min-h-10 shrink-0 rounded-xl border border-emerald-200/25 bg-emerald-200/10 px-3 text-xs font-semibold text-emerald-50 disabled:opacity-45"
                                >
                                  Review approved rollback
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  disabled={busy || missingReason || requesterWaiting || blockedByReadiness}
                                  onClick={() => requestApproval.mutate(transition.to)}
                                  className="min-h-10 shrink-0 rounded-xl border border-amber-200/25 bg-amber-200/10 px-3 text-xs font-semibold text-amber-50 disabled:opacity-45"
                                >
                                  {requestApproval.isPending
                                    ? 'Requesting…'
                                    : requesterWaiting
                                      ? 'Waiting for second approval'
                                      : 'Request second approval'}
                                </button>
                              )
                            ) : (
                              <button
                                type="button"
                                disabled={busy || missingReason || blockedByReadiness}
                                onClick={() => openEditionReview(transition)}
                                className="min-h-10 shrink-0 rounded-xl border border-border bg-surface px-3 text-xs font-semibold text-foreground disabled:opacity-45"
                              >
                                Review move to {humanize(transition.to)}
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">This edition has reached a terminal lifecycle state.</p>
                )}
              </AdminCard>

              <AdminCard>
                <AdminCardHeader eyebrow="Subsystems" title="Lifecycle-derived state" />
                <div className="space-y-2">
                  {Object.entries(snapshot.runtime.runtime.subsystems).map(([name, state]) => (
                    <div
                      key={name}
                      className="flex items-center justify-between gap-3 rounded-lg border border-white/[0.06] px-3 py-2"
                    >
                      <span className="text-sm text-muted-foreground">{humanize(name)}</span>
                      <AdminStatus tone={state === 'open' ? 'ready' : state === 'locked' ? 'info' : 'neutral'}>
                        {humanize(state)}
                      </AdminStatus>
                    </div>
                  ))}
                </div>
              </AdminCard>
            </section>

            <section className="grid gap-4 xl:grid-cols-[.9fr_1.1fr]">
              <AdminCard>
                <AdminCardHeader
                  eyebrow="Incident command"
                  title="Active operational incidents"
                  description="SEV-1 automatically puts Control Room into crisis mode. Compact transitions are reviewed here; resolution belongs in Incident Command so its resolution record is reviewed too."
                />

                <form onSubmit={submitIncident} className="mb-4 grid gap-2 sm:grid-cols-[1fr_110px_auto]">
                  <input
                    value={incidentTitle}
                    onChange={(event) => setIncidentTitle(event.target.value)}
                    maxLength={200}
                    placeholder="Describe the operational incident"
                    className="min-h-10 rounded-xl border border-border bg-background px-3 text-sm text-foreground"
                  />
                  <select
                    value={incidentSeverity}
                    onChange={(event) => setIncidentSeverity(event.target.value as IncidentSeverity)}
                    className="min-h-10 rounded-xl border border-border bg-background px-2 text-sm text-foreground"
                  >
                    {INCIDENT_SEVERITIES.map((severity) => (
                      <option key={severity} value={severity}>
                        {severity.toUpperCase()}
                      </option>
                    ))}
                  </select>
                  <button
                    type="submit"
                    disabled={!incidentTitle.trim() || createIncident.isPending || reviewChecking}
                    className="min-h-10 rounded-xl border border-border bg-surface px-3 text-xs font-semibold disabled:opacity-45"
                  >
                    {createIncident.isPending ? 'Creating…' : 'Create incident'}
                  </button>
                </form>

                {snapshot.incidents.length ? (
                  <div className="space-y-2">
                    {snapshot.incidents.map((incident) => {
                      const nextStatuses = INCIDENT_STATUSES.filter((status) =>
                        canTransitionIncident(incident.status, status),
                      );
                      const compactStatuses = nextStatuses.filter((status) => status !== 'resolved');
                      const canResolve = nextStatuses.includes('resolved');
                      return (
                        <div key={incident.id} className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm font-semibold">{incident.title}</p>
                              <AdminStatus tone={incident.severity === 'sev1' ? 'blocked' : 'attention'}>
                                {incident.severity.toUpperCase()}
                              </AdminStatus>
                            </div>
                            <AdminStatus tone="neutral">{humanize(incident.status)}</AdminStatus>
                          </div>
                          {compactStatuses.length || canResolve ? (
                            <div className="mt-3 flex flex-wrap gap-2">
                              {compactStatuses.map((status) => (
                                <button
                                  key={status}
                                  type="button"
                                  disabled={transitionIncident.isPending || reviewChecking}
                                  onClick={() => openIncidentReview(incident, status)}
                                  className="rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-semibold disabled:opacity-45"
                                >
                                  Review {humanize(status)}
                                </button>
                              ))}
                              {canResolve ? (
                                <a
                                  href={`/admin/incidents?incident=${encodeURIComponent(incident.id)}`}
                                  className="rounded-lg border border-emerald-200/20 bg-emerald-200/[0.05] px-2.5 py-1.5 text-[11px] font-semibold text-emerald-100"
                                >
                                  Resolve in Incident Command
                                </a>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No active incidents.</p>
                )}
              </AdminCard>

              <AdminCard>
                <AdminCardHeader eyebrow="Event stream" title="Recent operational history" />
                {snapshot.recentEvents.length ? (
                  <div className="max-h-[560px] space-y-2 overflow-auto pr-1">
                    {snapshot.recentEvents.map((event) => (
                      <div key={event.id} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold">{humanize(event.type)}</p>
                            <p className="mt-1 text-[11px] text-muted-foreground">
                              {event.entityType ? `${humanize(event.entityType)} · ` : ''}
                              {formatTimestamp(event.occurredAt)}
                            </p>
                          </div>
                          {event.actorUserId ? <AdminStatus tone="info">actor recorded</AdminStatus> : null}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No Studio 2 events recorded for this edition yet.</p>
                )}
              </AdminCard>
            </section>
          </div>
        )}
      </div>

      <AdminConfirmSheet
        open={Boolean(pendingReview)}
        onClose={() => {
          if (!reviewBusy) {
            setPendingReview(null);
            setReviewError(null);
          }
        }}
        onConfirm={applyReviewedCommand}
        title={controlReviewTitle(pendingReview)}
        description={pendingReview ? (
          <div className="space-y-3 text-xs leading-relaxed text-muted-foreground">
            <p className="font-semibold text-foreground">{pendingReview.editionLabel}</p>
            {pendingReview.kind === 'edition-transition' ? (
              <>
                <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-3">
                  <p className="font-semibold text-foreground">Edition lifecycle transition</p>
                  <p className="mt-1">{humanize(pendingReview.from)} → {humanize(pendingReview.to)}</p>
                  <p className="mt-1">Risk: {pendingReview.risk} · reviewed runtime version {pendingReview.runtimeVersion}</p>
                  <p className="mt-1">Reason: {pendingReview.commandReason || 'No reason required for this normal transition.'}</p>
                  {pendingReview.approvalRequestId ? <p className="mt-1 break-all font-mono">Approval: {pendingReview.approvalRequestId}</p> : null}
                </div>
                <p>Control Room re-reads canonical state immediately before commit and refuses this reviewed action if the edition state, runtime version or reviewed approval changed.</p>
                <p>System #587 still owns server-side expected-version/CAS, stable idempotency and canonical operation-receipt semantics. This client review does not pretend to replace that authority.</p>
              </>
            ) : pendingReview.kind === 'approve-transition' ? (
              <>
                <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-3">
                  <p className="font-semibold text-foreground">Second-operator approval</p>
                  <p className="mt-1">{humanize(pendingReview.from)} → {humanize(pendingReview.to)}</p>
                  <p className="mt-1">Reason: {pendingReview.requestReason}</p>
                  <p className="mt-1">Expires {formatTimestamp(pendingReview.expiresAt)} · reviewed runtime version {pendingReview.runtimeVersion}</p>
                </div>
                <p>Approving does not execute the rollback itself. It authorizes the original requester to perform the separately reviewed critical transition while this approval remains valid.</p>
                <p>The exact edition runtime and approval request are re-read immediately before approval. Any scope, expiry, reason, lifecycle or approvability drift fails closed.</p>
              </>
            ) : (
              <>
                <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-3">
                  <p className="font-semibold text-foreground">{pendingReview.title}</p>
                  <p className="mt-1">{pendingReview.severity.toUpperCase()} · {humanize(pendingReview.from)} → {humanize(pendingReview.to)}</p>
                  <p className="mt-1 break-all font-mono">{pendingReview.incidentId}</p>
                </div>
                <p>The exact edition snapshot is re-read immediately before apply. Title, severity or lifecycle drift invalidates this compact incident review.</p>
                <p>Resolution is intentionally unavailable here because Incident Command reviews the resolution record together with the lifecycle decision.</p>
              </>
            )}
            {reviewError ? (
              <p className="rounded-xl border border-rose-200/20 bg-rose-200/[0.05] p-3 font-semibold text-rose-100">{reviewError}</p>
            ) : null}
          </div>
        ) : null}
        confirmLabel={controlReviewConfirmLabel(pendingReview)}
        confirmationText={pendingReview?.kind === 'edition-transition' && pendingReview.risk === 'critical' ? humanize(pendingReview.to) : undefined}
        confirmationHint={pendingReview?.kind === 'edition-transition' && pendingReview.risk === 'critical' ? `Type ${humanize(pendingReview.to)} exactly to apply this critical rollback` : undefined}
        busy={reviewBusy}
        danger={pendingReview?.kind === 'edition-transition' && pendingReview.risk === 'critical'}
      />
    </AdminPage>
  );
}

function controlReviewTitle(review: PendingControlReview | null) {
  if (!review) return 'Review Control Room command';
  if (review.kind === 'edition-transition') return `Review move to ${humanize(review.to)}`;
  if (review.kind === 'approve-transition') return `Approve ${humanize(review.from)} → ${humanize(review.to)}?`;
  return `Review ${review.title}: ${humanize(review.from)} → ${humanize(review.to)}`;
}

function controlReviewConfirmLabel(review: PendingControlReview | null) {
  if (!review) return 'Confirm command';
  if (review.kind === 'edition-transition') return review.risk === 'critical' ? 'Apply approved critical rollback' : `Move to ${humanize(review.to)}`;
  if (review.kind === 'approve-transition') return 'Approve as second operator';
  return `Move incident to ${humanize(review.to)}`;
}

function humanize(value: string) {
  return value
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[._-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatTimestamp(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function isForwardTransition(from: EditionState, to: EditionState) {
  return EDITION_STATES.indexOf(to) > EDITION_STATES.indexOf(from);
}

function transitionReadinessBlockers(
  from: EditionState,
  to: EditionState,
  readiness: EditionReadiness | null,
) {
  if (!readiness || !isForwardTransition(from, to)) return [];
  const targetIndex = EDITION_STATES.indexOf(to);
  if (targetIndex < EDITION_STATES.indexOf('pre_show')) return [];

  const blockedAreas = new Set<string>(['setup', 'entries']);
  if (targetIndex >= EDITION_STATES.indexOf('jury_voting')) blockedAreas.add('jury');
  if (targetIndex >= EDITION_STATES.indexOf('vote_verification')) blockedAreas.add('televote');
  if (targetIndex >= EDITION_STATES.indexOf('results')) blockedAreas.add('results');

  return readiness.issues.filter(
    (issue) =>
      blockedAreas.has(issue.area) &&
      (issue.severity === 'critical' || issue.severity === 'action'),
  );
}

function riskTone(risk: TransitionRisk) {
  return risk === 'critical'
    ? ('blocked' as const)
    : risk === 'elevated'
      ? ('attention' as const)
      : ('info' as const);
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}
