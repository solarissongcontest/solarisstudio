import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { Archive, CalendarClock, CheckCircle2, CopyPlus, Eye, Mail, Megaphone, PencilLine, Send } from 'lucide-react';

import { useAdminContext } from '@/components/admin/AdminContext';
import { AdminPage } from '@/components/admin/AdminShell';
import { AdminCard, AdminCardHeader, AdminEmptyState, AdminPageHeader, AdminStatus } from '@/components/admin/AdminUI';
import { useCountries } from '@/lib/data';
import {
  NOTICE_AUDIENCES,
  NOTICE_EDITION_GROUPS,
  NOTICE_SEVERITIES,
  NOTICE_STATES,
  NOTICE_TYPES,
  noticeStateLabel,
  noticeTypeLabel,
  type NoticeAudience,
  type NoticeEditionGroup,
  type NoticeSeverity,
  type NoticeState,
  type NoticeType,
  type OperationalNotice,
} from '@/lib/official-communications';
import {
  cancelStudio2Notice,
  createStudio2NoticeDraft,
  createSupersedingStudio2NoticeDraft,
  loadStudio2NoticeRevisions,
  loadStudio2Notices,
  publishStudio2Notice,
  scheduleStudio2Notice,
  updateStudio2NoticeDraft,
  type SaveStudio2NoticeInput,
} from '@/lib/studio2-communications';

const NOTICE_STATE_SET = new Set<string>(NOTICE_STATES);

type CommunicationsSearch = {
  notice?: string;
  state?: NoticeState;
};

export const Route = createFileRoute('/_authenticated/admin/communications')({
  validateSearch: (search: Record<string, unknown>): CommunicationsSearch => ({
    notice: typeof search.notice === 'string' && search.notice ? search.notice : undefined,
    state: typeof search.state === 'string' && NOTICE_STATE_SET.has(search.state)
      ? search.state as NoticeState
      : undefined,
  }),
  head: () => ({
    meta: [
      { title: 'Official Communications — Solaris Organizer' },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: CommunicationsCentre,
});

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
  const [audience, setAudience] = useState<NoticeAudience>('all_delegations');
  const [audienceGroup, setAudienceGroup] = useState<NoticeEditionGroup | null>(null);
  const [countryIds, setCountryIds] = useState<string[]>([]);
  const [acknowledgementRequired, setAcknowledgementRequired] = useState(false);
  const [scheduledAt, setScheduledAt] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

  const noticesQuery = useQuery({
    queryKey: ['studio2-official-notices', editionId ?? 'all'],
    queryFn: () => loadStudio2Notices(editionId),
    refetchInterval: 30_000,
  });

  const notices = noticesQuery.data ?? [];
  const selectedNotice = notices.find((item) => item.notice.id === search.notice)?.notice ?? null;
  const revisionsQuery = useQuery({
    queryKey: ['studio2-notice-revisions', search.notice ?? 'none'],
    enabled: Boolean(search.notice),
    queryFn: () => loadStudio2NoticeRevisions(search.notice!),
  });

  const currentInput = (): SaveStudio2NoticeInput => ({
    editionId: editionId ?? null,
    noticeType,
    title,
    body,
    severity,
    audience,
    audienceGroup: audience === 'edition_group' ? audienceGroup : null,
    countryIds: audience === 'specific_countries' ? countryIds : [],
    acknowledgementRequired,
  });

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['studio2-official-notices'] });
    if (search.notice) await queryClient.invalidateQueries({ queryKey: ['studio2-notice-revisions', search.notice] });
  };

  const saveDraft = useMutation({
    mutationFn: async () => editingId
      ? updateStudio2NoticeDraft(editingId, currentInput())
      : createStudio2NoticeDraft(currentInput()),
    onSuccess: async (notice) => {
      setEditingId(notice.id);
      void navigate({ search: { ...search, notice: notice.id }, replace: true });
      await refresh();
    },
  });

  const scheduleNotice = useMutation({
    mutationFn: async () => {
      const draft = editingId
        ? await updateStudio2NoticeDraft(editingId, currentInput())
        : await createStudio2NoticeDraft(currentInput());
      if (!scheduledAt) throw new Error('Choose a publication time before scheduling.');
      const date = new Date(scheduledAt);
      if (Number.isNaN(date.getTime())) throw new Error('The scheduled publication time is invalid.');
      return scheduleStudio2Notice(draft.id, date.toISOString());
    },
    onSuccess: async (notice) => {
      setEditingId(notice.id);
      void navigate({ search: { ...search, notice: notice.id }, replace: true });
      await refresh();
    },
  });

  const publishNotice = useMutation({
    mutationFn: async () => {
      const draft = editingId
        ? await updateStudio2NoticeDraft(editingId, currentInput())
        : await createStudio2NoticeDraft(currentInput());
      return publishStudio2Notice(draft.id);
    },
    onSuccess: async (notice) => {
      resetComposer();
      void navigate({ search: { ...search, notice: notice.id }, replace: true });
      await refresh();
    },
  });

  const cancelNotice = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => cancelStudio2Notice(id, reason),
    onSuccess: refresh,
  });

  const supersedeNotice = useMutation({
    mutationFn: (id: string) => createSupersedingStudio2NoticeDraft(id),
    onSuccess: async (draft) => {
      loadIntoComposer(draft);
      void navigate({ search: { ...search, notice: draft.id }, replace: true });
      await refresh();
    },
  });

  const acknowledgementCount = useMemo(
    () => notices.reduce((sum, item) => sum + item.receipts.acknowledged, 0),
    [notices],
  );
  const filteredNotices = useMemo(
    () => search.state ? notices.filter((item) => item.notice.state === search.state) : notices,
    [notices, search.state],
  );

  const mutationError = saveDraft.error
    || scheduleNotice.error
    || publishNotice.error
    || cancelNotice.error
    || supersedeNotice.error;
  const busy = saveDraft.isPending
    || scheduleNotice.isPending
    || publishNotice.isPending
    || cancelNotice.isPending
    || supersedeNotice.isPending;

  function loadIntoComposer(notice: OperationalNotice) {
    setEditingId(notice.id);
    setNoticeType(notice.noticeType);
    setTitle(notice.title);
    setBody(notice.body);
    setSeverity(notice.severity);
    setAudience(notice.audience);
    setAudienceGroup(notice.audienceGroup);
    setCountryIds([...notice.countryIds]);
    setAcknowledgementRequired(notice.acknowledgementRequired);
    setScheduledAt(toDateTimeLocal(notice.scheduledAt));
  }

  function resetComposer() {
    setEditingId(null);
    setNoticeType('official_notice');
    setTitle('');
    setBody('');
    setSeverity('info');
    setAudience('all_delegations');
    setAudienceGroup(null);
    setCountryIds([]);
    setAcknowledgementRequired(false);
    setScheduledAt('');
  }

  const toggleCountry = (countryId: string) => {
    setCountryIds((current) => current.includes(countryId)
      ? current.filter((id) => id !== countryId)
      : [...current, countryId]);
  };

  return (
    <AdminPage>
      <div className="mx-auto max-w-7xl space-y-4">
        <AdminPageHeader
          eyebrow="Solaris Studio 2 · Operations"
          title="Official Communications"
          description="Draft, preview, schedule and publish authoritative notices with edition-aware targeting, acknowledgement tracking, revision history and controlled superseding."
          actions={
            <button
              type="button"
              onClick={() => { resetComposer(); void navigate({ search: search.state ? { state: search.state } : {}, replace: true }); }}
              className="admin-action-secondary"
            >
              New draft
            </button>
          }
        />

        <section className="grid gap-4 md:grid-cols-4">
          <Metric label="Total" value={notices.length} />
          <Metric label="Draft / scheduled" value={notices.filter((item) => ['draft', 'scheduled'].includes(item.notice.state)).length} />
          <Metric label="Published" value={notices.filter((item) => item.notice.state === 'published').length} />
          <Metric label="Acknowledged" value={acknowledgementCount} />
        </section>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
          <AdminCard strong>
            <AdminCardHeader eyebrow={editingId ? 'Edit lifecycle' : 'Compose'} title={editingId ? 'Edit notice draft' : 'Create notice draft'} />
            <div className="mt-4 space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <SelectField label="Communication type" value={noticeType} onChange={(value) => setNoticeType(value as NoticeType)} options={NOTICE_TYPES} />
                <SelectField label="Severity" value={severity} onChange={(value) => setSeverity(value as NoticeSeverity)} options={NOTICE_SEVERITIES} />
              </div>

              <label className="block space-y-1.5 text-sm">
                <span className="font-semibold">Title</span>
                <input value={title} onChange={(event) => setTitle(event.target.value)} className="min-h-11 w-full rounded-xl border border-white/[0.09] bg-black/10 px-3 outline-none focus:border-sky-300/30" placeholder="Submission deadline updated" />
              </label>

              <label className="block space-y-1.5 text-sm">
                <span className="font-semibold">Message</span>
                <textarea value={body} onChange={(event) => setBody(event.target.value)} className="min-h-36 w-full rounded-xl border border-white/[0.09] bg-black/10 p-3 outline-none focus:border-sky-300/30" placeholder="Write the official TSBC notice…" />
              </label>

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
                  <SelectField label="Edition group" value={audienceGroup ?? ''} onChange={(value) => setAudienceGroup(value as NoticeEditionGroup)} options={NOTICE_EDITION_GROUPS} placeholder="Choose group" />
                ) : (
                  <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3 text-xs text-muted-foreground">
                    Audience resolution is enforced server-side from canonical country, juror, role and capability data.
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
                <input type="checkbox" checked={acknowledgementRequired} onChange={(event) => setAcknowledgementRequired(event.target.checked)} className="mt-0.5" />
                <span>
                  <span className="block font-semibold">Require acknowledgement</span>
                  <span className="text-muted-foreground">Recipients must explicitly acknowledge this notice in Country Hub.</span>
                </span>
              </label>

              <AdminCard>
                <AdminCardHeader eyebrow="Preview" title={title.trim() || 'Untitled notice'} />
                <div className="mt-3 flex flex-wrap gap-2">
                  <AdminStatus tone={severityTone(severity)}>{humanize(severity)}</AdminStatus>
                  <AdminStatus tone="neutral">{noticeTypeLabel(noticeType)}</AdminStatus>
                  <AdminStatus tone="neutral">{humanize(audience)}</AdminStatus>
                </div>
                <p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">{body.trim() || 'Your message preview will appear here.'}</p>
              </AdminCard>

              <label className="block space-y-1.5 text-sm">
                <span className="font-semibold">Scheduled publication</span>
                <input type="datetime-local" value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} className="min-h-11 w-full rounded-xl border border-white/[0.09] bg-background px-3" />
              </label>

              {mutationError ? (
                <div className="rounded-xl border border-red-300/25 bg-red-300/10 px-4 py-3 text-sm text-red-100">
                  {errorMessage(mutationError, 'The notice operation failed.')}
                </div>
              ) : null}

              <div className="grid gap-2 sm:grid-cols-3">
                <button type="button" disabled={busy || !canSave(title, body, audience, countryIds, audienceGroup)} onClick={() => saveDraft.mutate()} className="admin-action-secondary min-h-11 disabled:opacity-50">
                  <PencilLine className="size-4" /> Save draft
                </button>
                <button type="button" disabled={busy || !scheduledAt || !canSave(title, body, audience, countryIds, audienceGroup)} onClick={() => scheduleNotice.mutate()} className="admin-action-secondary min-h-11 disabled:opacity-50">
                  <CalendarClock className="size-4" /> Schedule
                </button>
                <button
                  type="button"
                  disabled={busy || !canSave(title, body, audience, countryIds, audienceGroup)}
                  onClick={() => {
                    if (window.confirm('Publish this official notice now? Recipients may see it immediately.')) publishNotice.mutate();
                  }}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"
                >
                  <Send className="size-4" /> Publish now
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
                  onChange={(event) => void navigate({ search: { ...search, state: event.target.value ? event.target.value as NoticeState : undefined }, replace: true })}
                  className="min-h-10 rounded-xl border border-white/[0.09] bg-background px-3 text-sm"
                  aria-label="Filter notices by state"
                >
                  <option value="">All states</option>
                  {NOTICE_STATES.map((state) => <option key={state} value={state}>{noticeStateLabel(state)}</option>)}
                </select>
              </div>

              <div className="mt-4">
                {noticesQuery.isLoading ? (
                  <p className="py-10 text-center text-sm text-muted-foreground">Loading notices…</p>
                ) : noticesQuery.error ? (
                  <AdminEmptyState icon={Mail} title="Communications unavailable" description={errorMessage(noticesQuery.error, 'The communications service could not be loaded.')} />
                ) : filteredNotices.length === 0 ? (
                  <AdminEmptyState icon={Megaphone} title="No notices in this view" description="Drafts, scheduled messages and published communication will appear here." />
                ) : (
                  <div className="divide-y divide-white/[0.07]">
                    {filteredNotices.map(({ notice, receipts }) => (
                      <article key={notice.id} className="py-4 first:pt-0 last:pb-0">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <button type="button" className="text-left font-semibold hover:underline" onClick={() => void navigate({ search: { ...search, notice: notice.id }, replace: true })}>{notice.title}</button>
                            <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
                              <span>{noticeTypeLabel(notice.noticeType)}</span><span>·</span><span>{humanize(notice.audience)}</span><span>·</span><span>r{notice.revision}</span>
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <AdminStatus tone={stateTone(notice.state)}>{noticeStateLabel(notice.state)}</AdminStatus>
                            <AdminStatus tone={severityTone(notice.severity)}>{humanize(notice.severity)}</AdminStatus>
                          </div>
                        </div>
                        <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm text-muted-foreground">{notice.body}</p>
                        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          {notice.state === 'scheduled' ? <span>Scheduled {formatTimestamp(notice.scheduledAt)}</span> : null}
                          {notice.sentAt ? <span>Published {formatTimestamp(notice.sentAt)}</span> : null}
                          {notice.acknowledgementRequired ? <span>{receipts.acknowledged} acknowledged</span> : null}
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {['draft', 'scheduled'].includes(notice.state) ? (
                            <button type="button" className="admin-action-secondary" onClick={() => { loadIntoComposer(notice); void navigate({ search: { ...search, notice: notice.id }, replace: true }); }}>Edit</button>
                          ) : null}
                          {['draft', 'scheduled'].includes(notice.state) ? (
                            <button
                              type="button"
                              className="admin-action-secondary"
                              onClick={() => {
                                const reason = window.prompt('Reason for cancelling this notice (optional):') ?? '';
                                if (window.confirm('Cancel this draft/scheduled notice?')) cancelNotice.mutate({ id: notice.id, reason });
                              }}
                            >Cancel</button>
                          ) : null}
                          {notice.state === 'published' ? (
                            <button type="button" className="admin-action-secondary" onClick={() => supersedeNotice.mutate(notice.id)}><CopyPlus className="size-4" /> Supersede</button>
                          ) : null}
                          <button type="button" className="admin-action-secondary" onClick={() => void navigate({ search: { ...search, notice: notice.id }, replace: true })}><Eye className="size-4" /> Inspect</button>
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
                  <AdminCardHeader eyebrow="Notice detail" title={selectedNotice.title} />
                  <button type="button" className="admin-action-secondary" onClick={() => void navigate({ search: search.state ? { state: search.state } : {}, replace: true })}>Close</button>
                </div>
                <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                  <Detail label="State" value={noticeStateLabel(selectedNotice.state)} />
                  <Detail label="Type" value={noticeTypeLabel(selectedNotice.noticeType)} />
                  <Detail label="Audience" value={selectedNotice.audienceGroup ? `${humanize(selectedNotice.audience)} · ${humanize(selectedNotice.audienceGroup)}` : humanize(selectedNotice.audience)} />
                  <Detail label="Revision" value={`r${selectedNotice.revision}`} />
                  <Detail label="Scheduled" value={formatTimestamp(selectedNotice.scheduledAt)} />
                  <Detail label="Published" value={formatTimestamp(selectedNotice.sentAt)} />
                </div>
                <p className="mt-4 whitespace-pre-wrap text-sm text-muted-foreground">{selectedNotice.body}</p>
                <div className="mt-5 border-t border-white/[0.07] pt-4">
                  <div className="flex items-center gap-2 font-semibold"><Archive className="size-4" /> Revision history</div>
                  {revisionsQuery.isLoading ? <p className="mt-3 text-sm text-muted-foreground">Loading revisions…</p> : null}
                  {revisionsQuery.error ? <p className="mt-3 text-sm text-red-200">{errorMessage(revisionsQuery.error, 'Revision history is unavailable.')}</p> : null}
                  <div className="mt-3 space-y-2">
                    {(revisionsQuery.data ?? []).map((revision) => (
                      <div key={revision.revision} className="rounded-xl border border-white/[0.07] p-3 text-sm">
                        <div className="flex flex-wrap justify-between gap-2"><strong>Revision {revision.revision}</strong><span className="text-xs text-muted-foreground">{formatTimestamp(revision.changedAt)}</span></div>
                        <div className="mt-1 text-xs text-muted-foreground">{noticeStateLabel(revision.state)} · {noticeTypeLabel(revision.noticeType)}</div>
                      </div>
                    ))}
                    {!revisionsQuery.isLoading && (revisionsQuery.data ?? []).length === 0 ? <p className="text-sm text-muted-foreground">No earlier revisions. The current record is revision {selectedNotice.revision}.</p> : null}
                  </div>
                </div>
              </AdminCard>
            ) : null}
          </div>
        </div>

        <AdminCard>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle2 className="size-4" />
            Publish, scheduling, cancellation, superseding and recipient access are validated server-side. Scheduled publication uses the existing database cron infrastructure.
          </div>
        </AdminCard>
      </div>
    </AdminPage>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <AdminCard><AdminCardHeader eyebrow={label} title={`${value}`} /></AdminCard>;
}

function SelectField({ label, value, onChange, options, placeholder }: { label: string; value: string; onChange: (value: string) => void; options: readonly string[]; placeholder?: string }) {
  return (
    <label className="space-y-1.5 text-sm">
      <span className="font-semibold">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="min-h-11 w-full rounded-xl border border-white/[0.09] bg-background px-3">
        {placeholder ? <option value="">{placeholder}</option> : null}
        {options.map((option) => <option key={option} value={option}>{humanize(option)}</option>)}
      </select>
    </label>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-white/[0.07] p-3"><div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div><div className="mt-1 font-medium">{value}</div></div>;
}

function canSave(title: string, body: string, audience: NoticeAudience, countryIds: string[], audienceGroup: NoticeEditionGroup | null) {
  if (!title.trim() || !body.trim()) return false;
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
  return error instanceof Error && error.message ? error.message : fallback;
}
