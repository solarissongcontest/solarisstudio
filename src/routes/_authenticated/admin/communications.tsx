import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import {
  Archive,
  ArchiveRestore,
  ArchiveX,
  CalendarClock,
  CheckCircle2,
  CopyPlus,
  Eye,
  Globe2,
  House,
  Mail,
  Megaphone,
  PencilLine,
  Send,
  Trash2,
  UsersRound,
} from 'lucide-react';

import { useAdminContext } from '@/components/admin/AdminContext';
import { AdminPage } from '@/components/admin/AdminShell';
import {
  AdminCard,
  AdminCardHeader,
  AdminConfirmSheet,
  AdminEmptyState,
  AdminPageHeader,
  AdminStatus,
} from '@/components/admin/AdminUI';
import { useCountries } from '@/lib/data';
import {
  NOTICE_AUDIENCES,
  NOTICE_DISPLAY_SURFACES,
  NOTICE_EDITION_GROUPS,
  NOTICE_SEVERITIES,
  NOTICE_STATES,
  NOTICE_TYPES,
  noticeStateLabel,
  noticeSurfaceLabel,
  noticeTypeLabel,
  type NoticeAudience,
  type NoticeDisplaySurface,
  type NoticeEditionGroup,
  type NoticeSeverity,
  type NoticeState,
  type NoticeType,
  type OperationalNotice,
} from '@/lib/official-communications';
import {
  archiveStudio2Communication,
  cancelStudio2Notice,
  createStudio2NoticeDraft,
  createSupersedingStudio2NoticeDraft,
  deleteStudio2Communication,
  loadStudio2NoticeRevisions,
  loadStudio2Notices,
  publishStudio2Notice,
  restoreStudio2Communication,
  scheduleStudio2Notice,
  updateStudio2NoticeDraft,
  type SaveStudio2NoticeInput,
} from '@/lib/studio2-communications';
import {
  assertCommunicationPublicationReviewCurrent,
  prepareCommunicationPublicationReview,
  type CommunicationPublicationReview,
} from '@/lib/v3-organizer-communications-review';

type CommunicationsStateFilter = NoticeState | 'archived';
const NOTICE_STATE_SET = new Set<string>([...NOTICE_STATES, 'archived']);

type CommunicationsSearch = {
  notice?: string;
  state?: CommunicationsStateFilter;
};

type PendingLifecycleReview = {
  kind: 'cancel' | 'archive' | 'restore' | 'delete';
  editionId: string;
  notice: OperationalNotice;
  reason: string;
};

export const Route = createFileRoute('/_authenticated/admin/communications')({
  validateSearch: (search: Record<string, unknown>): CommunicationsSearch => ({
    notice: typeof search.notice === 'string' && search.notice ? search.notice : undefined,
    state: typeof search.state === 'string' && NOTICE_STATE_SET.has(search.state)
      ? search.state as CommunicationsStateFilter
      : undefined,
  }),
  head: () => ({
    meta: [
      { title: 'Official Communications — Solaris Organizer' },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: CommunicationsRoute,
});

function CommunicationsRoute() {
  const { editionId } = useAdminContext();
  return <CommunicationsCentre key={editionId || 'unscoped'} />;
}

function CommunicationsCentre() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const { editionId } = useAdminContext();
  const queryClient = useQueryClient();
  const { data: countries = [] } = useCountries();

  const [noticeType, setNoticeType] = useState<NoticeType>('official_notice');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [severity, setSeverity] = useState<NoticeSeverity>('info');
  const [displaySurfaces, setDisplaySurfaces] = useState<NoticeDisplaySurface[]>(['delegation_inbox']);
  const [audience, setAudience] = useState<NoticeAudience>('all_delegations');
  const [audienceGroup, setAudienceGroup] = useState<NoticeEditionGroup | null>(null);
  const [countryIds, setCountryIds] = useState<string[]>([]);
  const [acknowledgementRequired, setAcknowledgementRequired] = useState(false);
  const [scheduledAt, setScheduledAt] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [publicationReview, setPublicationReview] = useState<CommunicationPublicationReview | null>(null);
  const [lifecycleReview, setLifecycleReview] = useState<PendingLifecycleReview | null>(null);
  const [reviewError, setReviewError] = useState<Error | null>(null);

  const inboxEnabled = displaySurfaces.includes('delegation_inbox');

  const noticesQuery = useQuery({
    queryKey: ['studio2-official-notices', editionId ?? 'unscoped'],
    enabled: Boolean(editionId),
    queryFn: () => {
      if (!editionId) throw new Error('Choose an edition before loading Official Communications.');
      return loadStudio2Notices(editionId);
    },
    refetchInterval: 120_000,
  });

  const notices = noticesQuery.data ?? [];
  const selectedNotice = notices.find((item) => item.notice.id === search.notice)?.notice ?? null;
  const revisionsQuery = useQuery({
    queryKey: ['studio2-notice-revisions', editionId ?? 'unscoped', selectedNotice?.id ?? 'none'],
    enabled: Boolean(editionId && selectedNotice),
    queryFn: () => {
      if (!editionId || !selectedNotice || selectedNotice.editionId !== editionId) {
        throw new Error('The selected communication is outside the current edition scope.');
      }
      return loadStudio2NoticeRevisions(selectedNotice.id);
    },
  });

  const currentInput = (): SaveStudio2NoticeInput => {
    if (!editionId) throw new Error('Choose an edition before creating Official Communications.');
    return {
      editionId,
      noticeType,
      title,
      body,
      severity,
      displaySurfaces,
      audience: inboxEnabled ? audience : 'all_delegations',
      audienceGroup: inboxEnabled && audience === 'edition_group' ? audienceGroup : null,
      countryIds: inboxEnabled && audience === 'specific_countries' ? countryIds : [],
      acknowledgementRequired: inboxEnabled ? acknowledgementRequired : false,
    };
  };

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['studio2-official-notices'] }),
      queryClient.invalidateQueries({ queryKey: ['official-announcements'] }),
    ]);
    if (editionId && selectedNotice) {
      await queryClient.invalidateQueries({
        queryKey: ['studio2-notice-revisions', editionId, selectedNotice.id],
      });
    }
  };

  const saveDraft = useMutation({
    mutationFn: async () => editingId
      ? updateStudio2NoticeDraft(editingId, currentInput())
      : createStudio2NoticeDraft(currentInput()),
    onSuccess: async (notice) => {
      setReviewError(null);
      setEditingId(notice.id);
      void navigate({ search: { ...search, notice: notice.id }, replace: true });
      await refresh();
    },
  });

  async function assertReviewAgainstFreshNotice(review: CommunicationPublicationReview) {
    if (!editionId || editionId !== review.editionId) {
      throw new Error('Organizer edition changed after this communication was reviewed. Review it again.');
    }
    if (!review.noticeId) {
      assertCommunicationPublicationReviewCurrent(review, editionId, null);
      return;
    }

    const latest = await noticesQuery.refetch();
    if (latest.error) throw latest.error;
    const currentNotice = (latest.data ?? []).find((item) => item.notice.id === review.noticeId)?.notice ?? null;
    assertCommunicationPublicationReviewCurrent(review, editionId, currentNotice);
  }

  const scheduleNotice = useMutation({
    mutationFn: async (review: CommunicationPublicationReview) => {
      if (review.kind !== 'schedule' || !review.scheduledAtIso) {
        throw new Error('The reviewed communication does not contain a valid schedule operation.');
      }
      await assertReviewAgainstFreshNotice(review);
      const draft = review.noticeId
        ? await updateStudio2NoticeDraft(review.noticeId, review.input)
        : await createStudio2NoticeDraft(review.input);
      if (draft.editionId !== review.editionId) {
        throw new Error('Official Communications returned a draft outside the reviewed edition scope.');
      }
      return scheduleStudio2Notice(draft.id, review.scheduledAtIso);
    },
    onSuccess: async (notice) => {
      setPublicationReview(null);
      setReviewError(null);
      setEditingId(notice.id);
      void navigate({ search: { ...search, notice: notice.id }, replace: true });
      await refresh();
    },
    onError: async (error) => {
      setPublicationReview(null);
      setReviewError(error instanceof Error ? error : new Error('The reviewed schedule could not be applied.'));
      await refresh();
    },
  });

  const publishNotice = useMutation({
    mutationFn: async (review: CommunicationPublicationReview) => {
      if (review.kind !== 'publish') {
        throw new Error('The reviewed communication does not contain a publish operation.');
      }
      await assertReviewAgainstFreshNotice(review);
      const draft = review.noticeId
        ? await updateStudio2NoticeDraft(review.noticeId, review.input)
        : await createStudio2NoticeDraft(review.input);
      if (draft.editionId !== review.editionId) {
        throw new Error('Official Communications returned a draft outside the reviewed edition scope.');
      }
      return publishStudio2Notice(draft.id);
    },
    onSuccess: async (notice) => {
      setPublicationReview(null);
      setReviewError(null);
      resetComposer();
      void navigate({ search: { ...search, notice: notice.id }, replace: true });
      await refresh();
    },
    onError: async (error) => {
      setPublicationReview(null);
      setReviewError(error instanceof Error ? error : new Error('The reviewed publication could not be applied.'));
      await refresh();
    },
  });

  const cancelNotice = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => cancelStudio2Notice(id, reason),
    onSuccess: async () => {
      setLifecycleReview(null);
      setReviewError(null);
      await refresh();
    },
  });

  const supersedeNotice = useMutation({
    mutationFn: (id: string) => createSupersedingStudio2NoticeDraft(id),
    onSuccess: async (draft) => {
      loadIntoComposer(draft);
      void navigate({ search: { ...search, notice: draft.id }, replace: true });
      await refresh();
    },
  });

  const archiveCommunication = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => archiveStudio2Communication(id, reason),
    onSuccess: async () => {
      setLifecycleReview(null);
      setReviewError(null);
      await refresh();
    },
  });

  const restoreCommunication = useMutation({
    mutationFn: (id: string) => restoreStudio2Communication(id),
    onSuccess: async () => {
      setLifecycleReview(null);
      setReviewError(null);
      await refresh();
    },
  });

  const deleteCommunication = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => deleteStudio2Communication(id, reason),
    onSuccess: async (_result, variables) => {
      setLifecycleReview(null);
      setReviewError(null);
      if (editingId === variables.id) resetComposer();
      if (search.notice === variables.id) {
        void navigate({ search: search.state ? { state: search.state } : {}, replace: true });
      }
      await refresh();
    },
  });

  const acknowledgementCount = useMemo(
    () => notices.reduce((sum, item) => sum + item.receipts.acknowledged, 0),
    [notices],
  );
  const filteredNotices = useMemo(() => {
    if (search.state === 'archived') return notices.filter((item) => Boolean(item.notice.archivedAt));
    if (search.state) return notices.filter((item) => item.notice.state === search.state);
    return notices;
  }, [notices, search.state]);

  const mutationError = reviewError
    || saveDraft.error
    || scheduleNotice.error
    || publishNotice.error
    || cancelNotice.error
    || supersedeNotice.error
    || archiveCommunication.error
    || restoreCommunication.error
    || deleteCommunication.error;
  const busy = saveDraft.isPending
    || scheduleNotice.isPending
    || publishNotice.isPending
    || cancelNotice.isPending
    || supersedeNotice.isPending
    || archiveCommunication.isPending
    || restoreCommunication.isPending
    || deleteCommunication.isPending;

  function loadIntoComposer(notice: OperationalNotice) {
    setReviewError(null);
    setPublicationReview(null);
    setEditingId(notice.id);
    setNoticeType(notice.noticeType);
    setTitle(notice.title);
    setBody(notice.body);
    setSeverity(notice.severity);
    setDisplaySurfaces([...notice.displaySurfaces]);
    setAudience(notice.audience);
    setAudienceGroup(notice.audienceGroup);
    setCountryIds([...notice.countryIds]);
    setAcknowledgementRequired(notice.acknowledgementRequired);
    setScheduledAt(toDateTimeLocal(notice.scheduledAt));
  }

  function resetComposer() {
    setPublicationReview(null);
    setEditingId(null);
    setNoticeType('official_notice');
    setTitle('');
    setBody('');
    setSeverity('info');
    setDisplaySurfaces(['delegation_inbox']);
    setAudience('all_delegations');
    setAudienceGroup(null);
    setCountryIds([]);
    setAcknowledgementRequired(false);
    setScheduledAt('');
  }

  function requestPublicationReview(kind: CommunicationPublicationReview['kind']) {
    try {
      setReviewError(null);
      if (!editionId) throw new Error('Choose an edition before reviewing Official Communications.');
      const existingNotice = editingId
        ? notices.find((item) => item.notice.id === editingId)?.notice ?? null
        : null;
      if (editingId && !existingNotice) {
        throw new Error('The communication being edited is no longer in the selected edition. Reload it before reviewing.');
      }
      setPublicationReview(prepareCommunicationPublicationReview({
        kind,
        editionId,
        input: currentInput(),
        scheduledAt: kind === 'schedule' ? scheduledAt : null,
        existingNotice,
      }));
    } catch (error) {
      setPublicationReview(null);
      setReviewError(error instanceof Error ? error : new Error('The communication could not be prepared for review.'));
    }
  }

  function requestLifecycleReview(kind: PendingLifecycleReview['kind'], notice: OperationalNotice) {
    try {
      setReviewError(null);
      if (!editionId || notice.editionId !== editionId) {
        throw new Error('The communication action must match the exact selected Organizer edition.');
      }
      setLifecycleReview({ kind, editionId, notice: { ...notice, displaySurfaces: [...notice.displaySurfaces], countryIds: [...notice.countryIds] }, reason: '' });
    } catch (error) {
      setLifecycleReview(null);
      setReviewError(error instanceof Error ? error : new Error('The communication could not be prepared for review.'));
    }
  }

  function requestCancel(notice: OperationalNotice) {
    requestLifecycleReview('cancel', notice);
  }

  function requestArchive(notice: OperationalNotice) {
    requestLifecycleReview('archive', notice);
  }

  function requestRestore(notice: OperationalNotice) {
    requestLifecycleReview('restore', notice);
  }

  function requestDelete(notice: OperationalNotice) {
    requestLifecycleReview('delete', notice);
  }

  async function confirmLifecycleReview() {
    if (!lifecycleReview) return;
    const reason = lifecycleReview.reason.trim();
    if (lifecycleReview.kind === 'delete' && !reason) return;

    try {
      if (!editionId || editionId !== lifecycleReview.editionId) {
        throw new Error('Organizer edition changed after this communication action was reviewed. Review it again.');
      }
      const latest = await noticesQuery.refetch();
      if (latest.error) throw latest.error;
      const currentNotice = (latest.data ?? []).find((item) => item.notice.id === lifecycleReview.notice.id)?.notice ?? null;
      if (
        !currentNotice
        || currentNotice.editionId !== lifecycleReview.editionId
        || currentNotice.revision !== lifecycleReview.notice.revision
        || currentNotice.state !== lifecycleReview.notice.state
        || currentNotice.archivedAt !== lifecycleReview.notice.archivedAt
      ) {
        throw new Error('The communication changed after this action was reviewed. Review the latest state before continuing.');
      }

      const variables = { id: lifecycleReview.notice.id, reason };
      if (lifecycleReview.kind === 'cancel') {
        await cancelNotice.mutateAsync(variables);
        return;
      }
      if (lifecycleReview.kind === 'archive') {
        await archiveCommunication.mutateAsync(variables);
        return;
      }
      if (lifecycleReview.kind === 'restore') {
        await restoreCommunication.mutateAsync(lifecycleReview.notice.id);
        return;
      }
      await deleteCommunication.mutateAsync(variables);
    } catch (error) {
      setLifecycleReview(null);
      setReviewError(error instanceof Error ? error : new Error('The reviewed communication action could not be applied.'));
      await refresh();
    }
  }

  const toggleCountry = (countryId: string) => {
    setCountryIds((current) => current.includes(countryId)
      ? current.filter((id) => id !== countryId)
      : [...current, countryId]);
  };

  const toggleSurface = (surface: NoticeDisplaySurface) => {
    setDisplaySurfaces((current) => {
      const next = current.includes(surface)
        ? current.filter((candidate) => candidate !== surface)
        : [...current, surface];
      if (surface === 'delegation_inbox' && current.includes(surface)) {
        setAcknowledgementRequired(false);
      }
      return next;
    });
  };

  const saveAllowed = canSave(
    title,
    body,
    displaySurfaces,
    inboxEnabled ? audience : 'all_delegations',
    inboxEnabled ? countryIds : [],
    inboxEnabled ? audienceGroup : null,
  );

  const reviewedInput = publicationReview?.input ?? null;
  const reviewedInboxEnabled = reviewedInput?.displaySurfaces.includes('delegation_inbox') ?? false;

  if (!editionId) {
    return (
      <AdminPage>
        <div className="mx-auto max-w-7xl space-y-4">
          <AdminPageHeader
            eyebrow="Operations · Communications"
            title="Official Communications"
            description="Communications are always operated inside one explicit edition context."
          />
          <AdminCard>
            <AdminEmptyState
              icon={Megaphone}
              title="Choose an edition"
              description="Select the edition in the Organizer toolbar before loading, drafting, scheduling or publishing communications. Solaris never broadens a missing edition into an all-editions view."
            />
          </AdminCard>
        </div>
      </AdminPage>
    );
  }

  return (
    <AdminPage>
      <div className="mx-auto max-w-7xl space-y-4">
        <AdminPageHeader
          eyebrow="Operations · Communications"
          title="Official Communications"
          description="Publish one authoritative message to delegation inboxes, every MySolaris home, the public homepage, or any combination of those destinations. Archive removes a publication everywhere without erasing its audit history."
          actions={
            <button
              type="button"
              onClick={() => {
                setReviewError(null);
                resetComposer();
                void navigate({ search: search.state ? { state: search.state } : {}, replace: true });
              }}
              className="admin-action-secondary"
            >
              New draft
            </button>
          }
        />

        <section className="grid gap-4 md:grid-cols-5">
          <Metric label="Total" value={notices.length} />
          <Metric label="Draft / scheduled" value={notices.filter((item) => ['draft', 'scheduled'].includes(item.notice.state)).length} />
          <Metric label="Published" value={notices.filter((item) => item.notice.state === 'published' && !item.notice.archivedAt).length} />
          <Metric label="Archived" value={notices.filter((item) => Boolean(item.notice.archivedAt)).length} />
          <Metric label="Acknowledged" value={acknowledgementCount} />
        </section>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
          <AdminCard strong>
            <AdminCardHeader
              eyebrow={editingId ? 'Edit lifecycle' : 'Compose'}
              title={editingId ? 'Edit communication' : 'Create communication'}
            />
            <div className="mt-4 space-y-4">
              <fieldset>
                <legend className="text-sm font-semibold">Where should this appear?</legend>
                <p className="mt-1 text-xs text-muted-foreground">
                  Choose one or more destinations. Home-page placements are broadcasts to everyone on that surface; delegation targeting only applies to the inbox.
                </p>
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  <DestinationOption
                    checked={displaySurfaces.includes('delegation_inbox')}
                    onChange={() => toggleSurface('delegation_inbox')}
                    icon={UsersRound}
                    title="Delegation inbox"
                    description="Target HODs, jurors, countries or staff."
                  />
                  <DestinationOption
                    checked={displaySurfaces.includes('mysolaris_home')}
                    onChange={() => toggleSurface('mysolaris_home')}
                    icon={House}
                    title="MySolaris Home"
                    description="Show to every signed-in MySolaris user."
                  />
                  <DestinationOption
                    checked={displaySurfaces.includes('public_home')}
                    onChange={() => toggleSurface('public_home')}
                    icon={Globe2}
                    title="Public Home"
                    description="Show on Solaris Today to everyone."
                  />
                </div>
                {!displaySurfaces.length ? (
                  <p className="mt-2 text-xs font-semibold text-red-200">Choose at least one destination.</p>
                ) : null}
              </fieldset>

              <div className="grid gap-3 sm:grid-cols-2">
                <SelectField label="Communication type" value={noticeType} onChange={(value) => setNoticeType(value as NoticeType)} options={NOTICE_TYPES} />
                <SelectField label="Severity" value={severity} onChange={(value) => setSeverity(value as NoticeSeverity)} options={NOTICE_SEVERITIES} />
              </div>

              <label className="block space-y-1.5 text-sm">
                <span className="font-semibold">Title</span>
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  className="min-h-11 w-full rounded-xl border border-white/[0.09] bg-black/10 px-3 outline-none focus:border-sky-300/30"
                  placeholder="Submission deadline updated"
                />
              </label>

              <label className="block space-y-1.5 text-sm">
                <span className="font-semibold">Message</span>
                <textarea
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                  className="min-h-36 w-full rounded-xl border border-white/[0.09] bg-black/10 p-3 outline-none focus:border-sky-300/30"
                  placeholder="Write the official TSBC communication…"
                />
              </label>

              {inboxEnabled ? (
                <div className="space-y-3 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4">
                  <div>
                    <p className="text-sm font-semibold">Delegation inbox targeting</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      These controls only affect the Delegation inbox. Public Home and MySolaris Home remain broadcast surfaces.
                    </p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <SelectField
                      label="Audience"
                      value={audience}
                      onChange={(value) => {
                        const next = value as NoticeAudience;
                        setAudience(next);
                        if (next !== 'specific_countries') setCountryIds([]);
                        if (next !== 'edition_group') setAudienceGroup(null);
                      }}
                      options={NOTICE_AUDIENCES}
                    />
                    {audience === 'edition_group' ? (
                      <SelectField
                        label="Edition group"
                        value={audienceGroup ?? ''}
                        onChange={(value) => setAudienceGroup(value as NoticeEditionGroup)}
                        options={NOTICE_EDITION_GROUPS}
                        placeholder="Choose group"
                      />
                    ) : (
                      <div className="rounded-xl border border-white/[0.07] bg-black/10 p-3 text-xs text-muted-foreground">
                        Recipient eligibility is resolved server-side from country ownership, jury assignments, roles and capabilities.
                      </div>
                    )}
                  </div>

                  {audience === 'specific_countries' ? (
                    <fieldset className="rounded-xl border border-white/[0.07] p-3">
                      <legend className="px-1 text-sm font-semibold">Countries</legend>
                      <div className="mt-2 grid max-h-56 gap-2 overflow-y-auto sm:grid-cols-2">
                        {countries.map((country) => (
                          <label key={country.id} className="flex items-center gap-2 rounded-lg border border-white/[0.06] px-3 py-2 text-sm">
                            <input type="checkbox" checked={countryIds.includes(country.id)} onChange={() => toggleCountry(country.id)} />
                            <span className="truncate">{country.name}</span>
                          </label>
                        ))}
                      </div>
                    </fieldset>
                  ) : null}

                  <label className="flex items-start gap-3 rounded-xl border border-white/[0.07] p-3 text-sm">
                    <input
                      type="checkbox"
                      checked={acknowledgementRequired}
                      onChange={(event) => setAcknowledgementRequired(event.target.checked)}
                      className="mt-0.5"
                    />
                    <span>
                      <span className="block font-semibold">Require acknowledgement</span>
                      <span className="text-muted-foreground">Recipients acknowledge it from MySolaris → Notices.</span>
                    </span>
                  </label>
                </div>
              ) : null}

              <AdminCard>
                <AdminCardHeader eyebrow="Preview" title={title.trim() || 'Untitled communication'} />
                <div className="mt-3 flex flex-wrap gap-2">
                  <AdminStatus tone={severityTone(severity)}>{humanize(severity)}</AdminStatus>
                  <AdminStatus tone="neutral">{noticeTypeLabel(noticeType)}</AdminStatus>
                  {displaySurfaces.map((surface) => (
                    <AdminStatus key={surface} tone="info">{noticeSurfaceLabel(surface)}</AdminStatus>
                  ))}
                  {inboxEnabled ? <AdminStatus tone="neutral">{humanize(audience)}</AdminStatus> : null}
                </div>
                <p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">
                  {body.trim() || 'Your message preview will appear here.'}
                </p>
              </AdminCard>

              <label className="block space-y-1.5 text-sm">
                <span className="font-semibold">Scheduled publication</span>
                <input
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(event) => setScheduledAt(event.target.value)}
                  className="min-h-11 w-full rounded-xl border border-white/[0.09] bg-background px-3"
                />
              </label>

              {mutationError ? (
                <div className="rounded-xl border border-red-300/25 bg-red-300/10 px-4 py-3 text-sm text-red-100">
                  {errorMessage(mutationError, 'The communication operation failed.')}
                </div>
              ) : null}

              <div className="grid gap-2 sm:grid-cols-3">
                <button
                  type="button"
                  disabled={busy || !saveAllowed}
                  onClick={() => saveDraft.mutate()}
                  className="admin-action-secondary min-h-11 disabled:opacity-50"
                >
                  <PencilLine className="size-4" /> Save draft
                </button>
                <button
                  type="button"
                  disabled={busy || !scheduledAt || !saveAllowed}
                  onClick={() => requestPublicationReview('schedule')}
                  className="admin-action-secondary min-h-11 disabled:opacity-50"
                >
                  <CalendarClock className="size-4" /> Review &amp; Schedule
                </button>
                <button
                  type="button"
                  disabled={busy || !saveAllowed}
                  onClick={() => requestPublicationReview('publish')}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"
                >
                  <Send className="size-4" /> Review &amp; publish
                </button>
              </div>
            </div>
          </AdminCard>

          <div className="space-y-4">
            <AdminCard>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <AdminCardHeader eyebrow="Operations history" title="Communications" />
                <select
                  value={search.state ?? ''}
                  onChange={(event) => void navigate({
                    search: {
                      ...search,
                      state: event.target.value ? event.target.value as CommunicationsStateFilter : undefined,
                    },
                    replace: true,
                  })}
                  className="min-h-10 rounded-xl border border-white/[0.09] bg-background px-3 text-sm"
                  aria-label="Filter communications by state"
                >
                  <option value="">All states</option>
                  <option value="archived">Archived</option>
                  {NOTICE_STATES.map((state) => (
                    <option key={state} value={state}>{noticeStateLabel(state)}</option>
                  ))}
                </select>
              </div>

              <div className="mt-4">
                {noticesQuery.isLoading ? (
                  <p className="py-10 text-center text-sm text-muted-foreground">Loading communications…</p>
                ) : noticesQuery.error ? (
                  <AdminEmptyState
                    icon={Mail}
                    title="Communications unavailable"
                    description={errorMessage(noticesQuery.error, 'The communications service could not be loaded.')}
                  />
                ) : filteredNotices.length === 0 ? (
                  <AdminEmptyState
                    icon={Megaphone}
                    title="No communications in this view"
                    description="Drafts, scheduled messages, published communication and archived history will appear here."
                  />
                ) : (
                  <div className="divide-y divide-white/[0.07]">
                    {filteredNotices.map(({ notice, receipts }) => (
                      <article key={notice.id} className="py-4 first:pt-0 last:pb-0">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <button
                              type="button"
                              className="text-left font-semibold hover:underline"
                              onClick={() => void navigate({ search: { ...search, notice: notice.id }, replace: true })}
                            >
                              {notice.title}
                            </button>
                            <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
                              <span>{noticeTypeLabel(notice.noticeType)}</span>
                              <span>·</span>
                              <span>r{notice.revision}</span>
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {notice.archivedAt ? <AdminStatus tone="neutral">Archived</AdminStatus> : null}
                            <AdminStatus tone={stateTone(notice.state)}>{noticeStateLabel(notice.state)}</AdminStatus>
                            <AdminStatus tone={severityTone(notice.severity)}>{humanize(notice.severity)}</AdminStatus>
                          </div>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {notice.displaySurfaces.map((surface) => (
                            <AdminStatus key={surface} tone="info">{noticeSurfaceLabel(surface)}</AdminStatus>
                          ))}
                        </div>
                        <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm text-muted-foreground">{notice.body}</p>
                        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          {notice.state === 'scheduled' ? <span>Scheduled {formatTimestamp(notice.scheduledAt)}</span> : null}
                          {notice.sentAt ? <span>Published {formatTimestamp(notice.sentAt)}</span> : null}
                          {notice.archivedAt ? <span>Archived {formatTimestamp(notice.archivedAt)}</span> : null}
                          {notice.displaySurfaces.includes('delegation_inbox') ? <span>Inbox: {humanize(notice.audience)}</span> : null}
                          {notice.acknowledgementRequired ? <span>{receipts.acknowledged} acknowledged</span> : null}
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {['draft', 'scheduled'].includes(notice.state) && !notice.archivedAt ? (
                            <button
                              type="button"
                              className="admin-action-secondary"
                              onClick={() => {
                                loadIntoComposer(notice);
                                void navigate({ search: { ...search, notice: notice.id }, replace: true });
                              }}
                            >
                              Edit
                            </button>
                          ) : null}
                          {['draft', 'scheduled'].includes(notice.state) && !notice.archivedAt ? (
                            <button
                              type="button"
                              className="admin-action-secondary"
                              onClick={() => requestCancel(notice)}
                            >
                              Cancel
                            </button>
                          ) : null}
                          {notice.state === 'published' && !notice.archivedAt ? (
                            <button
                              type="button"
                              className="admin-action-secondary"
                              onClick={() => supersedeNotice.mutate(notice.id)}
                            >
                              <CopyPlus className="size-4" /> Supersede
                            </button>
                          ) : null}
                          {notice.archivedAt ? (
                            <button
                              type="button"
                              className="admin-action-secondary"
                              disabled={busy}
                              onClick={() => requestRestore(notice)}
                            >
                              <ArchiveRestore className="size-4" /> Review restore
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="admin-action-secondary"
                              disabled={busy}
                              onClick={() => requestArchive(notice)}
                            >
                              <ArchiveX className="size-4" /> Archive
                            </button>
                          )}
                          {(!notice.sentAt || notice.archivedAt) ? (
                            <button
                              type="button"
                              className="admin-action-secondary text-red-200"
                              disabled={busy}
                              onClick={() => requestDelete(notice)}
                            >
                              <Trash2 className="size-4" /> Delete permanently
                            </button>
                          ) : null}
                          <button
                            type="button"
                            className="admin-action-secondary"
                            onClick={() => void navigate({ search: { ...search, notice: notice.id }, replace: true })}
                          >
                            <Eye className="size-4" /> Inspect
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </div>
            </AdminCard>

            {selectedNotice ? (
              <AdminCard strong>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <AdminCardHeader eyebrow="Communication detail" title={selectedNotice.title} />
                  <button
                    type="button"
                    className="admin-action-secondary"
                    onClick={() => void navigate({ search: search.state ? { state: search.state } : {}, replace: true })}
                  >
                    Close
                  </button>
                </div>
                <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                  <Detail label="State" value={noticeStateLabel(selectedNotice.state)} />
                  <Detail label="Archived" value={selectedNotice.archivedAt ? formatTimestamp(selectedNotice.archivedAt) : 'No'} />
                  <Detail label="Type" value={noticeTypeLabel(selectedNotice.noticeType)} />
                  <Detail label="Destinations" value={selectedNotice.displaySurfaces.map(noticeSurfaceLabel).join(', ')} />
                  <Detail
                    label="Inbox audience"
                    value={selectedNotice.displaySurfaces.includes('delegation_inbox')
                      ? selectedNotice.audienceGroup
                        ? `${humanize(selectedNotice.audience)} · ${humanize(selectedNotice.audienceGroup)}`
                        : humanize(selectedNotice.audience)
                      : 'Not sent to inbox'}
                  />
                  <Detail label="Revision" value={`r${selectedNotice.revision}`} />
                  <Detail label="Published" value={formatTimestamp(selectedNotice.sentAt)} />
                </div>
                <p className="mt-4 whitespace-pre-wrap text-sm text-muted-foreground">{selectedNotice.body}</p>

                <div className="mt-4 flex flex-wrap gap-2">
                  {selectedNotice.archivedAt ? (
                    <button
                      type="button"
                      className="admin-action-secondary"
                      disabled={busy}
                      onClick={() => requestRestore(selectedNotice)}
                    >
                      <ArchiveRestore className="size-4" /> Review restore to destinations
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="admin-action-secondary"
                      disabled={busy}
                      onClick={() => requestArchive(selectedNotice)}
                    >
                      <ArchiveX className="size-4" /> Archive / remove everywhere
                    </button>
                  )}
                  {(!selectedNotice.sentAt || selectedNotice.archivedAt) ? (
                    <button
                      type="button"
                      className="admin-action-secondary text-red-200"
                      disabled={busy}
                      onClick={() => requestDelete(selectedNotice)}
                    >
                      <Trash2 className="size-4" /> Delete permanently
                    </button>
                  ) : null}
                </div>

                <div className="mt-5 border-t border-white/[0.07] pt-4">
                  <div className="flex items-center gap-2 font-semibold">
                    <Archive className="size-4" /> Revision history
                  </div>
                  {revisionsQuery.isLoading ? <p className="mt-3 text-sm text-muted-foreground">Loading revisions…</p> : null}
                  {revisionsQuery.error ? (
                    <p className="mt-3 text-sm text-red-200">{errorMessage(revisionsQuery.error, 'Revision history is unavailable.')}</p>
                  ) : null}
                  <div className="mt-3 space-y-2">
                    {(revisionsQuery.data ?? []).map((revision) => (
                      <div key={revision.revision} className="rounded-xl border border-white/[0.07] p-3 text-sm">
                        <div className="flex flex-wrap justify-between gap-2">
                          <strong>Revision {revision.revision}</strong>
                          <span className="text-xs text-muted-foreground">{formatTimestamp(revision.changedAt)}</span>
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {noticeStateLabel(revision.state)} · {noticeTypeLabel(revision.noticeType)} · {revision.displaySurfaces.map(noticeSurfaceLabel).join(', ')}
                          {revision.archivedAt ? ' · archived snapshot' : ''}
                        </div>
                      </div>
                    ))}
                    {!revisionsQuery.isLoading && (revisionsQuery.data ?? []).length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No earlier revisions. The current record is revision {selectedNotice.revision}.
                      </p>
                    ) : null}
                  </div>
                </div>
              </AdminCard>
            ) : null}
          </div>
        </div>

        <AdminConfirmSheet
          open={publicationReview?.kind === 'schedule'}
          onClose={() => {
            if (!scheduleNotice.isPending) setPublicationReview(null);
          }}
          onConfirm={async () => {
            if (publicationReview?.kind !== 'schedule') return;
            await scheduleNotice.mutateAsync(publicationReview);
          }}
          title="Schedule this communication?"
          description={publicationReview?.kind === 'schedule' && reviewedInput ? (
            <div className="space-y-3 text-xs leading-relaxed text-muted-foreground">
              <p>Review the frozen publication time, message, destinations and audience before scheduling.</p>
              <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-3">
                <p className="font-semibold text-foreground">{reviewedInput.title.trim() || 'Untitled communication'}</p>
                <p className="mt-1">Edition scope: {publicationReview.editionId}{publicationReview.expectedRevision ? ` · reviewed revision r${publicationReview.expectedRevision}` : ' · new draft'}</p>
                <p className="mt-2"><span className="font-semibold text-foreground">Publishes:</span> {formatTimestamp(publicationReview.scheduledAtIso)}</p>
                <p className="mt-2"><span className="font-semibold text-foreground">Destinations:</span> {reviewedInput.displaySurfaces.map(noticeSurfaceLabel).join(', ')}</p>
                {reviewedInboxEnabled ? <p className="mt-2"><span className="font-semibold text-foreground">Inbox audience:</span> {humanize(reviewedInput.audience)}{reviewedInput.audienceGroup ? ` · ${humanize(reviewedInput.audienceGroup)}` : ''}{reviewedInput.audience === 'specific_countries' ? ` · ${reviewedInput.countryIds.length} countr${reviewedInput.countryIds.length === 1 ? 'y' : 'ies'}` : ''}</p> : null}
                <p className="mt-2"><span className="font-semibold text-foreground">Acknowledgement:</span> {reviewedInput.acknowledgementRequired && reviewedInboxEnabled ? 'required' : 'not required'}</p>
                <p className="mt-2 whitespace-pre-wrap">{reviewedInput.body.trim()}</p>
              </div>
              <p>Solaris re-reads the exact communication immediately before apply and rejects edition, revision or lifecycle drift. Once scheduled, the existing server scheduler can publish it at that time without another Organizer action.</p>
              <p>System #599 still owns the final atomic expected-version/CAS, idempotency, operation receipt and deterministic uncertain-outcome contract.</p>
            </div>
          ) : null}
          confirmLabel="Schedule communication"
          busy={scheduleNotice.isPending}
          confirmDisabled={!publicationReview || publicationReview.kind !== 'schedule'}
        />

        <AdminConfirmSheet
          open={publicationReview?.kind === 'publish'}
          onClose={() => {
            if (!publishNotice.isPending) setPublicationReview(null);
          }}
          onConfirm={async () => {
            if (publicationReview?.kind !== 'publish') return;
            await publishNotice.mutateAsync(publicationReview);
          }}
          title="Publish this communication now?"
          description={publicationReview?.kind === 'publish' && reviewedInput ? (
            <div className="space-y-3 text-xs leading-relaxed text-muted-foreground">
              <p>Review the frozen message, destinations and audience before it becomes live.</p>
              <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-3">
                <p className="font-semibold text-foreground">{reviewedInput.title.trim() || 'Untitled communication'}</p>
                <p className="mt-1">Edition scope: {publicationReview.editionId}{publicationReview.expectedRevision ? ` · reviewed revision r${publicationReview.expectedRevision}` : ' · new draft'}</p>
                <p className="mt-2 whitespace-pre-wrap">{reviewedInput.body.trim()}</p>
                <p className="mt-3"><span className="font-semibold text-foreground">Destinations:</span> {reviewedInput.displaySurfaces.map(noticeSurfaceLabel).join(', ')}</p>
                {reviewedInboxEnabled ? <p className="mt-2"><span className="font-semibold text-foreground">Inbox audience:</span> {humanize(reviewedInput.audience)}{reviewedInput.audienceGroup ? ` · ${humanize(reviewedInput.audienceGroup)}` : ''}{reviewedInput.audience === 'specific_countries' ? ` · ${reviewedInput.countryIds.length} countr${reviewedInput.countryIds.length === 1 ? 'y' : 'ies'}` : ''}</p> : null}
                <p className="mt-2"><span className="font-semibold text-foreground">Acknowledgement:</span> {reviewedInput.acknowledgementRequired && reviewedInboxEnabled ? 'required' : 'not required'}</p>
              </div>
              <p>Solaris re-reads the exact communication immediately before apply and rejects edition, revision or lifecycle drift. The compatibility publication authority then applies the frozen reviewed content.</p>
              <p>System #599 still owns the final atomic expected-version/CAS, idempotency, operation receipt and deterministic uncertain-outcome contract.</p>
            </div>
          ) : null}
          confirmLabel="Publish communication now"
          busy={publishNotice.isPending}
          confirmDisabled={!publicationReview || publicationReview.kind !== 'publish'}
        />

        <AdminConfirmSheet
          open={Boolean(lifecycleReview)}
          onClose={() => {
            if (!busy) setLifecycleReview(null);
          }}
          onConfirm={confirmLifecycleReview}
          title={lifecycleReview
            ? lifecycleReview.kind === 'delete'
              ? `Permanently delete “${lifecycleReview.notice.title}”?`
              : lifecycleReview.kind === 'archive'
                ? `Archive “${lifecycleReview.notice.title}”?`
                : lifecycleReview.kind === 'restore'
                  ? `Restore “${lifecycleReview.notice.title}” to its destinations?`
                  : `Cancel “${lifecycleReview.notice.title}”?`
            : 'Review communication action'}
          description={lifecycleReview ? (
            <div className="space-y-3 text-xs leading-relaxed text-muted-foreground">
              <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-3">
                <p className="font-semibold text-foreground">{lifecycleReview.notice.title}</p>
                <p className="mt-1">Edition scope: {lifecycleReview.editionId} · Revision {lifecycleReview.notice.revision} · {noticeStateLabel(lifecycleReview.notice.state)}</p>
                <p className="mt-2"><span className="font-semibold text-foreground">Destinations:</span> {lifecycleReview.notice.displaySurfaces.map(noticeSurfaceLabel).join(', ')}</p>
              </div>
              {lifecycleReview.kind !== 'restore' ? (
                <label className="block space-y-1.5">
                  <span className="font-semibold text-foreground">
                    Organizer reason {lifecycleReview.kind === 'delete' ? '(required)' : '(optional)'}
                  </span>
                  <textarea
                    value={lifecycleReview.reason}
                    onChange={(event) => setLifecycleReview((current) => current ? { ...current, reason: event.target.value } : current)}
                    rows={3}
                    placeholder={lifecycleReview.kind === 'delete' ? 'Explain why permanent deletion is required…' : 'Add an operational reason…'}
                    className="w-full rounded-xl border border-white/[0.1] bg-black/10 p-3 text-sm text-foreground outline-none focus:border-sky-300/30"
                  />
                </label>
              ) : null}
              {lifecycleReview.kind === 'cancel' ? (
                <p>Cancelling stops this draft or scheduled communication from publishing. The lifecycle record remains available to Organizer history.</p>
              ) : lifecycleReview.kind === 'archive' ? (
                <p>Archiving removes the communication from all live destinations until an organizer deliberately restores it. Its revision and audit history remain.</p>
              ) : lifecycleReview.kind === 'restore' ? (
                <p>Restoring republishes this archived communication to its original destinations using the existing server restore authority. Verify the destinations above before making it live again.</p>
              ) : (
                <>
                  <p className="font-semibold text-red-100">Permanent deletion cannot be undone.</p>
                  <p>{lifecycleReview.notice.sentAt ? 'This communication was previously published. Its content, revisions and receipt rows will be deleted while the minimal private deletion audit record remains.' : 'This communication has never been published. Its draft record and revision history will be deleted.'}</p>
                </>
              )}
              <p>Solaris re-reads the exact notice immediately before applying this reviewed lifecycle action and rejects edition, revision, state or archive drift. System #599 still owns the final atomic version/CAS, idempotency, operation receipt and uncertain-outcome contract.</p>
            </div>
          ) : null}
          confirmLabel={lifecycleReview
            ? lifecycleReview.kind === 'delete'
              ? 'Delete communication permanently'
              : lifecycleReview.kind === 'archive'
                ? 'Archive communication'
                : lifecycleReview.kind === 'restore'
                  ? 'Restore communication'
                  : 'Cancel communication'
            : 'Confirm'}
          confirmationText={lifecycleReview?.kind === 'delete' ? lifecycleReview.notice.title : undefined}
          confirmationHint={lifecycleReview?.kind === 'delete' ? `Type ${lifecycleReview.notice.title} to confirm permanent deletion.` : undefined}
          busy={busy}
          confirmDisabled={lifecycleReview?.kind === 'delete' && !lifecycleReview.reason.trim()}
          danger={lifecycleReview?.kind === 'delete'}
        />

        <AdminCard>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle2 className="size-4" />
            Publication, scheduling, surface placement, archive/restore, permanent deletion, recipient access and acknowledgement are validated server-side.
          </div>
        </AdminCard>
      </div>
    </AdminPage>
  );
}

function DestinationOption({
  checked,
  onChange,
  icon: Icon,
  title,
  description,
}: {
  checked: boolean;
  onChange: () => void;
  icon: typeof UsersRound;
  title: string;
  description: string;
}) {
  return (
    <label className={`flex cursor-pointer gap-3 rounded-xl border p-3 transition ${checked ? 'border-sky-300/25 bg-sky-300/[0.07]' : 'border-white/[0.07] bg-white/[0.015]'}`}>
      <input type="checkbox" checked={checked} onChange={onChange} className="mt-1" />
      <Icon className="mt-0.5 size-4 shrink-0 text-sky-100" />
      <span>
        <span className="block text-sm font-semibold">{title}</span>
        <span className="mt-0.5 block text-[11px] leading-relaxed text-muted-foreground">{description}</span>
      </span>
    </label>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <AdminCard><AdminCardHeader eyebrow={label} title={`${value}`} /></AdminCard>;
}

function SelectField({
  label,
  value,
  onChange,
  options,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly string[];
  placeholder?: string;
}) {
  return (
    <label className="space-y-1.5 text-sm">
      <span className="font-semibold">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-11 w-full rounded-xl border border-white/[0.09] bg-background px-3"
      >
        {placeholder ? <option value="">{placeholder}</option> : null}
        {options.map((option) => <option key={option} value={option}>{humanize(option)}</option>)}
      </select>
    </label>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/[0.07] p-3">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 font-medium">{value}</div>
    </div>
  );
}

function canSave(
  title: string,
  body: string,
  displaySurfaces: NoticeDisplaySurface[],
  audience: NoticeAudience,
  countryIds: string[],
  audienceGroup: NoticeEditionGroup | null,
) {
  if (!title.trim() || !body.trim() || displaySurfaces.length === 0) return false;
  if (!displaySurfaces.includes('delegation_inbox')) return true;
  if (audience === 'specific_countries' && countryIds.length === 0) return false;
  if (audience === 'edition_group' && !audienceGroup) return false;
  return true;
}

function severityTone(severity: NoticeSeverity): 'neutral' | 'info' | 'attention' | 'blocked' {
  if (severity === 'critical') return 'blocked';
  if (severity === 'urgent' || severity === 'action_required') return 'attention';
  if (severity === 'info') return 'info';
  return 'neutral';
}

function stateTone(state: NoticeState): 'neutral' | 'info' | 'ready' | 'attention' | 'blocked' {
  if (state === 'published') return 'ready';
  if (state === 'scheduled') return 'info';
  if (state === 'cancelled' || state === 'superseded') return 'neutral';
  return 'attention';
}

function humanize(value: string) {
  return value.split('_').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
}

function formatTimestamp(value: string | null) {
  if (!value) return 'Not set';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function toDateTimeLocal(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) return message;
  }
  return fallback;
}
