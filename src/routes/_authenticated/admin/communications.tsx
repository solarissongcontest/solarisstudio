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
  loadStudio2NoticeRevisions,
  loadStudio2Notices,
} from '@/lib/studio2-communications';
import {
  commitOrganizerNoticeLifecycleReview,
  prepareOrganizerNoticeLifecycleReview,
  saveOrganizerNoticeDraft,
  supersedeOrganizerNotice,
  type OrganizerNoticeLifecycleReview,
} from '@/lib/v3-organizer-communications-operations';
import type { V3NoticeLifecycleAction } from '@/lib/v3-official-communications-commands';

type CommunicationsStateFilter = NoticeState | 'archived';
const NOTICE_STATE_SET = new Set<string>([...NOTICE_STATES, 'archived']);

type CommunicationsSearch = {
  notice?: string;
  state?: CommunicationsStateFilter;
};

type PendingLifecycleReview = {
  action: V3NoticeLifecycleAction;
  notice: OperationalNotice;
  reason: string;
  prepared: OrganizerNoticeLifecycleReview | null;
};

type NoticeDraftContent = Parameters<typeof saveOrganizerNoticeDraft>[0]['content'];

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
  const [editingBase, setEditingBase] = useState<OperationalNotice | null>(null);
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

  const organizerContext = () => {
    if (!editionId) throw new Error('Choose an edition before operating Official Communications.');
    return { editionId };
  };

  const currentContent = (): NoticeDraftContent => ({
    noticeType,
    title,
    body,
    severity,
    displaySurfaces: [...displaySurfaces],
    audience: inboxEnabled ? audience : 'all_delegations',
    audienceGroup: inboxEnabled && audience === 'edition_group' ? audienceGroup : null,
    countryIds: inboxEnabled && audience === 'specific_countries' ? [...countryIds] : [],
    acknowledgementRequired: inboxEnabled ? acknowledgementRequired : false,
  });

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

  async function loadFreshNotice(noticeId: string): Promise<OperationalNotice> {
    const context = organizerContext();
    const current = await loadStudio2Notices(context.editionId);
    const notice = current.find((item) => item.notice.id === noticeId)?.notice ?? null;
    if (!notice || notice.editionId !== context.editionId) {
      throw new Error('Official Communications could not reconcile the operated notice in the selected edition.');
    }
    return notice;
  }

  function currentExistingNotice(): OperationalNotice | null {
    if (!editingId) {
      if (editingBase) {
        throw new Error('Official Communications editor state is inconsistent. Reload the draft before continuing.');
      }
      return null;
    }
    if (!editingBase || editingBase.id !== editingId) {
      throw new Error('The communication editor lost its reviewed base revision. Reload the draft before continuing.');
    }
    if (!editionId || editingBase.editionId !== editionId) {
      throw new Error('The communication being edited is outside the selected Organizer edition.');
    }
    return cloneNotice(editingBase);
  }

  async function saveCurrentDraft(): Promise<OperationalNotice> {
    const context = organizerContext();
    const existing = currentExistingNotice();
    const result = await saveOrganizerNoticeDraft({
      context,
      content: currentContent(),
      existing,
    });
    const noticeId = result.result?.noticeId;
    if (!noticeId) throw new Error('Official Communications draft receipt did not identify the saved notice.');
    return loadFreshNotice(noticeId);
  }

  const saveDraft = useMutation({
    mutationFn: saveCurrentDraft,
    onSuccess: async (notice) => {
      setReviewError(null);
      loadIntoComposer(notice);
      void navigate({ search: { ...search, notice: notice.id }, replace: true });
      await refresh();
    },
    onError: async (error) => {
      setReviewError(error instanceof Error ? error : new Error('The governed draft operation failed.'));
      await refresh();
    },
  });

  const preparePublicationReview = useMutation({
    mutationFn: async (action: 'schedule' | 'publish') => {
      const draft = await saveCurrentDraft();
      const exactScheduledAt = action === 'schedule' ? parseScheduledInput(scheduledAt) : null;
      const review = await prepareOrganizerNoticeLifecycleReview({
        context: organizerContext(),
        notice: draft,
        action,
        scheduledAt: exactScheduledAt,
      });
      return { action, notice: cloneNotice(draft), reason: '', prepared: review } satisfies PendingLifecycleReview;
    },
    onSuccess: (review) => {
      setReviewError(null);
      loadIntoComposer(review.notice, false);
      setLifecycleReview(review);
    },
    onError: async (error) => {
      setLifecycleReview(null);
      setReviewError(error instanceof Error ? error : new Error('The communication could not be prepared for governed review.'));
      await refresh();
    },
  });

  const prepareLifecycleReview = useMutation({
    mutationFn: async (intent: PendingLifecycleReview) => {
      const fresh = await loadFreshNotice(intent.notice.id);
      if (
        fresh.revision !== intent.notice.revision
        || fresh.state !== intent.notice.state
        || fresh.archivedAt !== intent.notice.archivedAt
      ) {
        throw new Error('The communication changed before final review. Reload its current state and review the action again.');
      }
      const review = await prepareOrganizerNoticeLifecycleReview({
        context: organizerContext(),
        notice: fresh,
        action: intent.action,
        reason: intent.reason,
      });
      return { ...intent, notice: cloneNotice(fresh), prepared: review };
    },
    onSuccess: (review) => {
      setReviewError(null);
      setLifecycleReview(review);
    },
    onError: async (error) => {
      setLifecycleReview(null);
      setReviewError(error instanceof Error ? error : new Error('The lifecycle action could not be prepared for governed review.'));
      await refresh();
    },
  });

  const commitLifecycleReview = useMutation({
    mutationFn: async (pending: PendingLifecycleReview) => {
      if (!pending.prepared) throw new Error('Prepare the final governed review before applying this action.');
      const fresh = await loadFreshNotice(pending.prepared.noticeId);
      const result = await commitOrganizerNoticeLifecycleReview({
        context: organizerContext(),
        currentNotice: fresh,
        review: pending.prepared,
      });
      return { result, pending };
    },
    onSuccess: async ({ pending }) => {
      setLifecycleReview(null);
      setReviewError(null);
      if (pending.action === 'publish') {
        resetComposer();
      } else if (pending.action === 'delete' && editingId === pending.notice.id) {
        resetComposer();
      } else if (pending.action !== 'delete') {
        try {
          const fresh = await loadFreshNotice(pending.notice.id);
          loadIntoComposer(fresh);
        } catch {
          if (pending.action !== 'delete') resetComposer();
        }
      }
      if (pending.action === 'delete' && search.notice === pending.notice.id) {
        void navigate({ search: search.state ? { state: search.state } : {}, replace: true });
      } else if (pending.action !== 'delete') {
        void navigate({ search: { ...search, notice: pending.notice.id }, replace: true });
      }
      await refresh();
    },
    onError: async (error) => {
      setLifecycleReview(null);
      setReviewError(error instanceof Error ? error : new Error('The governed communication operation could not be reconciled.'));
      await refresh();
    },
  });

  const supersedeNotice = useMutation({
    mutationFn: async (notice: OperationalNotice) => {
      const result = await supersedeOrganizerNotice({
        context: organizerContext(),
        notice,
      });
      const noticeId = result.result?.noticeId;
      if (!noticeId) throw new Error('Official Communications supersede receipt did not identify the new draft.');
      return loadFreshNotice(noticeId);
    },
    onSuccess: async (draft) => {
      setReviewError(null);
      loadIntoComposer(draft);
      void navigate({ search: { ...search, notice: draft.id }, replace: true });
      await refresh();
    },
    onError: async (error) => {
      setReviewError(error instanceof Error ? error : new Error('The governed supersede operation failed.'));
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
    || preparePublicationReview.error
    || prepareLifecycleReview.error
    || commitLifecycleReview.error
    || supersedeNotice.error;
  const busy = saveDraft.isPending
    || preparePublicationReview.isPending
    || prepareLifecycleReview.isPending
    || commitLifecycleReview.isPending
    || supersedeNotice.isPending;

  function loadIntoComposer(notice: OperationalNotice, clearReview = true) {
    setReviewError(null);
    if (clearReview) setLifecycleReview(null);
    setEditingId(notice.id);
    setEditingBase(cloneNotice(notice));
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
    setLifecycleReview(null);
    setEditingId(null);
    setEditingBase(null);
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

  function requestLifecycleReview(action: PendingLifecycleReview['action'], notice: OperationalNotice) {
    try {
      setReviewError(null);
      const context = organizerContext();
      if (notice.editionId !== context.editionId) {
        throw new Error('The communication action must match the exact selected Organizer edition.');
      }
      setLifecycleReview({ action, notice: cloneNotice(notice), reason: '', prepared: null });
    } catch (error) {
      setLifecycleReview(null);
      setReviewError(error instanceof Error ? error : new Error('The communication could not be prepared for review.'));
    }
  }

  async function confirmLifecycleReview() {
    if (!lifecycleReview) return;
    if (!lifecycleReview.prepared) {
      if (lifecycleReview.action === 'delete' && !lifecycleReview.reason.trim()) return;
      await prepareLifecycleReview.mutateAsync(lifecycleReview);
      return;
    }
    await commitLifecycleReview.mutateAsync(lifecycleReview);
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
          description="Publish one authoritative message to delegation inboxes, every MySolaris home, the public homepage, or any combination of those destinations. Governed commands bind each consequential action to the selected edition, canonical notice revision and durable operation identity."
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
                  onClick={() => preparePublicationReview.mutate('schedule')}
                  className="admin-action-secondary min-h-11 disabled:opacity-50"
                >
                  <CalendarClock className="size-4" /> Review &amp; Schedule
                </button>
                <button
                  type="button"
                  disabled={busy || !saveAllowed}
                  onClick={() => preparePublicationReview.mutate('publish')}
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
                              onClick={() => requestLifecycleReview('cancel', notice)}
                            >
                              Cancel
                            </button>
                          ) : null}
                          {notice.state === 'published' && !notice.archivedAt ? (
                            <button
                              type="button"
                              className="admin-action-secondary"
                              disabled={busy}
                              onClick={() => supersedeNotice.mutate(notice)}
                            >
                              <CopyPlus className="size-4" /> Supersede
                            </button>
                          ) : null}
                          {notice.archivedAt ? (
                            <button
                              type="button"
                              className="admin-action-secondary"
                              disabled={busy}
                              onClick={() => requestLifecycleReview('restore', notice)}
                            >
                              <ArchiveRestore className="size-4" /> Review restore
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="admin-action-secondary"
                              disabled={busy}
                              onClick={() => requestLifecycleReview('archive', notice)}
                            >
                              <ArchiveX className="size-4" /> Archive
                            </button>
                          )}
                          {(!notice.sentAt || notice.archivedAt) ? (
                            <button
                              type="button"
                              className="admin-action-secondary text-red-200"
                              disabled={busy}
                              onClick={() => requestLifecycleReview('delete', notice)}
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
                      onClick={() => requestLifecycleReview('restore', selectedNotice)}
                    >
                      <ArchiveRestore className="size-4" /> Review restore to destinations
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="admin-action-secondary"
                      disabled={busy}
                      onClick={() => requestLifecycleReview('archive', selectedNotice)}
                    >
                      <ArchiveX className="size-4" /> Archive / remove everywhere
                    </button>
                  )}
                  {(!selectedNotice.sentAt || selectedNotice.archivedAt) ? (
                    <button
                      type="button"
                      className="admin-action-secondary text-red-200"
                      disabled={busy}
                      onClick={() => requestLifecycleReview('delete', selectedNotice)}
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
          open={Boolean(lifecycleReview)}
          onClose={() => {
            if (!busy) setLifecycleReview(null);
          }}
          onConfirm={confirmLifecycleReview}
          title={reviewTitle(lifecycleReview)}
          description={lifecycleReview ? (
            <div className="space-y-3 text-xs leading-relaxed text-muted-foreground">
              <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-3">
                <p className="font-semibold text-foreground">{lifecycleReview.notice.title}</p>
                <p className="mt-1">Edition {lifecycleReview.notice.editionId} · revision r{lifecycleReview.notice.revision} · {noticeStateLabel(lifecycleReview.notice.state)}</p>
                <p className="mt-2"><span className="font-semibold text-foreground">Destinations:</span> {lifecycleReview.notice.displaySurfaces.map(noticeSurfaceLabel).join(', ')}</p>
                {lifecycleReview.notice.displaySurfaces.includes('delegation_inbox') ? (
                  <p className="mt-2"><span className="font-semibold text-foreground">Inbox audience:</span> {humanize(lifecycleReview.notice.audience)}{lifecycleReview.notice.audienceGroup ? ` · ${humanize(lifecycleReview.notice.audienceGroup)}` : ''}</p>
                ) : null}
                <p className="mt-2 whitespace-pre-wrap">{lifecycleReview.notice.body}</p>
              </div>

              {lifecycleReview.prepared ? (
                <>
                  <div className="grid gap-2 sm:grid-cols-3">
                    <ReviewFact label="Risk" value={lifecycleReview.prepared.preflight.riskClass} />
                    <ReviewFact label="Canonical revision" value={`r${lifecycleReview.prepared.preflight.currentRevision}`} />
                    <ReviewFact label="Recipient receipts" value={`${lifecycleReview.prepared.preflight.recipientReceiptCount}`} />
                  </div>
                  {lifecycleReview.prepared.scheduledAt ? (
                    <p><span className="font-semibold text-foreground">Scheduled publication:</span> {formatTimestamp(lifecycleReview.prepared.scheduledAt)}</p>
                  ) : null}
                  {lifecycleReview.prepared.reason ? (
                    <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-3">
                      <p className="font-semibold text-foreground">Frozen Organizer reason</p>
                      <p className="mt-1 whitespace-pre-wrap">{lifecycleReview.prepared.reason}</p>
                    </div>
                  ) : null}
                  <p>Server preflight reports no blockers. The same frozen edition, notice revision and operation identity will be used for commit. If state changes first, the authoritative command fails closed instead of silently substituting a newer revision.</p>
                </>
              ) : (
                <>
                  {lifecycleReview.action !== 'restore' ? (
                    <label className="block space-y-1.5">
                      <span className="font-semibold text-foreground">
                        Organizer reason {lifecycleReview.action === 'delete' ? '(required)' : '(optional)'}
                      </span>
                      <textarea
                        value={lifecycleReview.reason}
                        onChange={(event) => setLifecycleReview((current) => current ? { ...current, reason: event.target.value, prepared: null } : current)}
                        rows={3}
                        placeholder={lifecycleReview.action === 'delete' ? 'Explain why permanent deletion is required…' : 'Add an operational reason…'}
                        className="w-full rounded-xl border border-white/[0.1] bg-black/10 p-3 text-sm text-foreground outline-none focus:border-sky-300/30"
                      />
                    </label>
                  ) : null}
                  <p>The first confirmation runs authoritative preflight and freezes its canonical revision, blockers, risk class and one secure operation identity. Solaris will then show the final governed review before applying anything consequential.</p>
                </>
              )}

              {lifecycleReview.action === 'cancel' ? (
                <p>Cancelling stops this draft or scheduled communication from publishing. The lifecycle record remains available to Organizer history.</p>
              ) : lifecycleReview.action === 'archive' ? (
                <p>Archiving removes the communication from all live destinations until an organizer deliberately restores it. Its revision and audit history remain.</p>
              ) : lifecycleReview.action === 'restore' ? (
                <p>Restoring republishes this archived communication to its original destinations.</p>
              ) : lifecycleReview.action === 'delete' ? (
                <>
                  <p className="font-semibold text-red-100">Permanent deletion cannot be undone.</p>
                  <p>{lifecycleReview.notice.sentAt ? 'This communication was previously published. Its content, revisions and receipt rows will be deleted while the minimal private deletion audit record remains.' : 'This communication has never been published. Its draft record and revision history will be deleted.'}</p>
                </>
              ) : lifecycleReview.action === 'schedule' ? (
                <p>Scheduling stores the reviewed publication instant. The existing scheduler may publish it later without another Organizer action, but the schedule command itself is governed and receipted now.</p>
              ) : (
                <p>Publishing makes this reviewed canonical notice live on its configured destinations immediately.</p>
              )}
            </div>
          ) : null}
          confirmLabel={lifecycleReview
            ? lifecycleReview.prepared
              ? finalConfirmLabel(lifecycleReview)
              : 'Run preflight & prepare final review'
            : 'Confirm communication action'}
          confirmationText={lifecycleReview?.prepared && lifecycleReview.prepared.preflight.riskClass === 'R3'
            ? lifecycleReview.notice.title
            : undefined}
          confirmationHint={lifecycleReview?.prepared && lifecycleReview.prepared.preflight.riskClass === 'R3'
            ? `Type ${lifecycleReview.notice.title} to confirm this ${humanize(lifecycleReview.action)} operation.`
            : undefined}
          busy={busy}
          confirmDisabled={!lifecycleReview?.prepared && lifecycleReview?.action === 'delete' && !lifecycleReview.reason.trim()}
          danger={Boolean(lifecycleReview?.prepared && lifecycleReview.prepared.preflight.riskClass === 'R3')}
        />

        <AdminCard>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle2 className="size-4" />
            Draft, supersede, schedule, publish, cancel, archive, restore and delete operations now use the governed V3 Communications command path with exact edition scope, canonical revisions, idempotent operation identity and receipt reconciliation.
          </div>
        </AdminCard>
      </div>
    </AdminPage>
  );
}

function cloneNotice(notice: OperationalNotice): OperationalNotice {
  return {
    ...notice,
    countryIds: [...notice.countryIds],
    displaySurfaces: [...notice.displaySurfaces],
  };
}

function parseScheduledInput(value: string): string {
  if (!value) throw new Error('Choose a publication time before scheduling.');
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('The scheduled publication time is invalid.');
  return date.toISOString();
}

function reviewTitle(review: PendingLifecycleReview | null) {
  if (!review) return 'Review communication action';
  const prefix = review.prepared ? 'Final review' : 'Prepare governed review';
  if (review.action === 'delete') return `${prefix}: permanently delete “${review.notice.title}”?`;
  if (review.action === 'archive') return `${prefix}: archive “${review.notice.title}”?`;
  if (review.action === 'restore') return `${prefix}: restore “${review.notice.title}”?`;
  if (review.action === 'cancel') return `${prefix}: cancel “${review.notice.title}”?`;
  if (review.action === 'schedule') return `${prefix}: schedule “${review.notice.title}”?`;
  return `${prefix}: publish “${review.notice.title}” now?`;
}

function finalConfirmLabel(review: PendingLifecycleReview) {
  if (review.action === 'delete') return 'Delete communication permanently';
  if (review.action === 'archive') return 'Archive communication';
  if (review.action === 'restore') return 'Restore communication';
  if (review.action === 'cancel') return 'Cancel communication';
  if (review.action === 'schedule') return 'Schedule communication';
  return 'Publish communication now';
}

function ReviewFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 font-semibold text-foreground">{value}</p>
    </div>
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
