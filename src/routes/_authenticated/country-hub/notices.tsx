import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { Archive, CheckCircle2, Inbox, MailOpen, Undo2 } from 'lucide-react';
import { useEffect, useMemo } from 'react';

import { AppShell, PageHeader, Panel } from '@/components/AppShell';
import { useMyCountryAccount } from '@/lib/country-account';
import {
  type NoticeInboxState,
  type OperationalNotice,
  noticeTypeLabel,
} from '@/lib/official-communications';
import {
  acknowledgeStudio2InboxNotice,
  archiveStudio2Notice,
  loadStudio2NoticeInbox,
  markStudio2NoticeOpened,
  type Studio2NoticeInboxItem,
} from '@/lib/studio2-communications';
import { isStudio2FeatureEnabled } from '@/lib/studio2-feature-flags';

const INBOX_STATES = [
  'unread',
  'read',
  'acknowledgement_required',
  'acknowledged',
  'archived',
] as const satisfies readonly NoticeInboxState[];
const INBOX_STATE_SET = new Set<string>(INBOX_STATES);

type NoticesSearch = {
  notice?: string;
  state?: NoticeInboxState;
};

export const Route = createFileRoute('/_authenticated/country-hub/notices')({
  validateSearch: (search: Record<string, unknown>): NoticesSearch => ({
    notice: typeof search.notice === 'string' && search.notice ? search.notice : undefined,
    state:
      typeof search.state === 'string' && INBOX_STATE_SET.has(search.state)
        ? (search.state as NoticeInboxState)
        : undefined,
  }),
  head: () => ({
    meta: [
      { title: 'Official notices — Solaris Studio' },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: CountryNoticeInbox,
});

function CountryNoticeInbox() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const queryClient = useQueryClient();
  const account = useMyCountryAccount();
  const access = account.data?.access;
  const country = account.data?.country;

  const featureQuery = useQuery({
    queryKey: ['studio2-feature', 'official_communications'],
    queryFn: () => isStudio2FeatureEnabled('official_communications'),
    staleTime: 30_000,
  });

  const inboxQuery = useQuery({
    queryKey: ['studio2-hod-notice-inbox', access?.userId ?? 'none'],
    enabled:
      featureQuery.data === true &&
      Boolean(access?.userId && country?.id) &&
      access?.isOrganizer !== true &&
      access?.countryStatus === 'active',
    queryFn: () => loadStudio2NoticeInbox(undefined, access!.userId),
    refetchInterval: 30_000,
  });

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['studio2-hod-notice-inbox'] });
  };

  const markOpened = useMutation({
    mutationFn: (noticeId: string) => markStudio2NoticeOpened(noticeId),
    onSuccess: refresh,
  });

  const acknowledge = useMutation({
    mutationFn: (noticeId: string) => acknowledgeStudio2InboxNotice(noticeId),
    onSuccess: refresh,
  });

  const archive = useMutation({
    mutationFn: ({ noticeId, archived }: { noticeId: string; archived: boolean }) =>
      archiveStudio2Notice(noticeId, archived),
    onSuccess: refresh,
  });

  const items = inboxQuery.data ?? [];
  const filteredItems = useMemo(
    () => (search.state ? items.filter((item) => item.inboxState === search.state) : items),
    [items, search.state],
  );
  const selected = items.find((item) => item.notice.id === search.notice) ?? null;

  useEffect(() => {
    if (!selected || selected.inboxState !== 'unread' || markOpened.isPending) return;
    markOpened.mutate(selected.notice.id);
  }, [selected?.notice.id, selected?.inboxState]);

  if (account.isLoading || featureQuery.isLoading) {
    return (
      <AppShell>
        <p className="text-sm text-muted-foreground">Loading official notices…</p>
      </AppShell>
    );
  }

  if (featureQuery.data !== true) {
    return (
      <AppShell>
        <PageHeader
          eyebrow="Country Hub"
          title="Official notices are not enabled"
          description="The Studio 2 communications rollout is currently disabled."
          actions={<BackToWorkspace />}
        />
      </AppShell>
    );
  }

  if (access?.isOrganizer) {
    return (
      <AppShell>
        <PageHeader
          eyebrow="Organizer account"
          title="Delegation inbox is recipient-scoped"
          description="Organizer inspection rights are intentionally separate from delegation read and acknowledgement receipts. Use Official Communications for organizer-side operations."
          actions={
            <Link
              to="/admin/communications"
              className="rounded-xl border border-border bg-surface px-3 py-2 text-sm font-semibold"
            >
              Open communications →
            </Link>
          }
        />
      </AppShell>
    );
  }

  if (!country || !access?.userId) {
    return (
      <AppShell>
        <PageHeader
          eyebrow="Country Hub"
          title="No delegation account"
          description="Official delegation notices are available after a country account has been assigned."
          actions={<BackToWorkspace />}
        />
      </AppShell>
    );
  }

  if (access.countryStatus !== 'active') {
    return (
      <AppShell>
        <PageHeader
          eyebrow="Country Hub"
          title={`${country.name} is suspended`}
          description="The delegation inbox is unavailable while the country account is suspended."
          actions={<BackToWorkspace />}
        />
      </AppShell>
    );
  }

  const unreadCount = items.filter((item) => item.inboxState === 'unread').length;
  const acknowledgementCount = items.filter(
    (item) => item.inboxState === 'acknowledgement_required',
  ).length;

  return (
    <AppShell>
      <PageHeader
        eyebrow="Country Hub · Official communications"
        title={`${country.name} notices`}
        description="Authoritative TSBC notices, acknowledgement requests and communication history for your delegation."
        actions={<BackToWorkspace />}
      />

      <div className="space-y-4">
        <section className="grid gap-3 sm:grid-cols-3">
          <Metric label="Unread" value={unreadCount} />
          <Metric label="Needs acknowledgement" value={acknowledgementCount} />
          <Metric label="Total" value={items.length} />
        </section>

        <Panel title="Inbox filters">
          <div className="flex flex-wrap gap-2">
            <FilterButton
              active={!search.state}
              label="All"
              onClick={() => void navigate({ search: search.notice ? { notice: search.notice } : {}, replace: true })}
            />
            {INBOX_STATES.map((state) => (
              <FilterButton
                key={state}
                active={search.state === state}
                label={`${inboxStateLabel(state)} (${items.filter((item) => item.inboxState === state).length})`}
                onClick={() =>
                  void navigate({
                    search: { ...(search.notice ? { notice: search.notice } : {}), state },
                    replace: true,
                  })
                }
              />
            ))}
          </div>
        </Panel>

        {inboxQuery.isLoading ? (
          <Panel title="Official notices">
            <p className="text-sm text-muted-foreground">Loading notices…</p>
          </Panel>
        ) : inboxQuery.error ? (
          <Panel title="Official notices">
            <p className="text-sm text-destructive">
              {errorMessage(inboxQuery.error, 'The delegation inbox could not be loaded.')}
            </p>
          </Panel>
        ) : filteredItems.length === 0 ? (
          <Panel title="Official notices">
            <div className="flex min-h-40 flex-col items-center justify-center text-center">
              <Inbox className="mb-3 size-7 text-muted-foreground" />
              <p className="font-semibold">No notices in this view</p>
              <p className="mt-1 max-w-md text-sm text-muted-foreground">
                New official communications will appear here when your delegation is part of the target audience.
              </p>
            </div>
          </Panel>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <Panel title="Official notices">
              <div className="divide-y divide-border">
                {filteredItems.map((item) => (
                  <NoticeRow
                    key={item.notice.id}
                    item={item}
                    selected={item.notice.id === selected?.notice.id}
                    onOpen={() =>
                      void navigate({
                        search: {
                          ...(search.state ? { state: search.state } : {}),
                          notice: item.notice.id,
                        },
                        replace: true,
                      })
                    }
                  />
                ))}
              </div>
            </Panel>

            <Panel title={selected ? selected.notice.title : 'Notice details'}>
              {selected ? (
                <NoticeDetail
                  item={selected}
                  busy={acknowledge.isPending || archive.isPending || markOpened.isPending}
                  error={acknowledge.error || archive.error || markOpened.error}
                  onAcknowledge={() => acknowledge.mutate(selected.notice.id)}
                  onArchive={(archived) => archive.mutate({ noticeId: selected.notice.id, archived })}
                />
              ) : (
                <div className="flex min-h-52 flex-col items-center justify-center text-center">
                  <MailOpen className="mb-3 size-7 text-muted-foreground" />
                  <p className="font-semibold">Select a notice</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Open a notice to read its full message and acknowledgement state.
                  </p>
                </div>
              )}
            </Panel>
          </div>
        )}
      </div>
    </AppShell>
  );
}

function NoticeRow({
  item,
  selected,
  onOpen,
}: {
  item: Studio2NoticeInboxItem;
  selected: boolean;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`w-full px-1 py-4 text-left first:pt-0 last:pb-0 ${selected ? 'text-foreground' : 'text-muted-foreground'}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={item.inboxState === 'unread' ? 'font-bold text-foreground' : 'font-semibold text-foreground'}>
              {item.notice.title}
            </span>
            <InboxBadge state={item.inboxState} />
          </div>
          <p className="mt-1 text-xs">
            {noticeTypeLabel(item.notice.noticeType)} · {formatTimestamp(item.notice.sentAt)}
          </p>
        </div>
        {item.notice.severity === 'critical' ? (
          <span className="rounded-full border border-red-400/30 bg-red-400/10 px-2 py-0.5 text-[11px] font-semibold text-red-300">
            Critical
          </span>
        ) : null}
      </div>
    </button>
  );
}

function NoticeDetail({
  item,
  busy,
  error,
  onAcknowledge,
  onArchive,
}: {
  item: Studio2NoticeInboxItem;
  busy: boolean;
  error: unknown;
  onAcknowledge: () => void;
  onArchive: (archived: boolean) => void;
}) {
  const notice = item.notice;
  const archived = item.inboxState === 'archived';
  const acknowledged = item.inboxState === 'acknowledged';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <InboxBadge state={item.inboxState} />
        <span>{noticeTypeLabel(notice.noticeType)}</span>
        <span>·</span>
        <span>{formatTimestamp(notice.sentAt)}</span>
      </div>

      <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{notice.body}</p>

      {notice.acknowledgementRequired ? (
        <div className="rounded-xl border border-border bg-muted/20 p-3 text-sm">
          <div className="flex items-start gap-2">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
            <div>
              <p className="font-semibold">
                {acknowledged ? 'Acknowledged' : 'Acknowledgement required'}
              </p>
              <p className="mt-1 text-muted-foreground">
                {acknowledged
                  ? 'Your delegation acknowledgement has been recorded.'
                  : 'TSBC requires your delegation to explicitly acknowledge this notice.'}
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {error ? (
        <p className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {errorMessage(error, 'The notice could not be updated.')}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {notice.acknowledgementRequired && !acknowledged && !archived ? (
          <button
            type="button"
            disabled={busy}
            onClick={onAcknowledge}
            className="min-h-10 rounded-xl bg-aurora px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            Acknowledge notice
          </button>
        ) : null}
        <button
          type="button"
          disabled={busy}
          onClick={() => onArchive(!archived)}
          className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-border bg-surface px-4 text-sm font-semibold disabled:opacity-50"
        >
          {archived ? <Undo2 className="size-4" /> : <Archive className="size-4" />}
          {archived ? 'Restore to inbox' : 'Archive'}
        </button>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
    </div>
  );
}

function FilterButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-9 rounded-xl border px-3 text-sm font-semibold ${
        active ? 'border-primary/40 bg-primary/10 text-foreground' : 'border-border bg-background text-muted-foreground'
      }`}
    >
      {label}
    </button>
  );
}

function InboxBadge({ state }: { state: NoticeInboxState }) {
  const tone = state === 'unread'
    ? 'border-sky-400/30 bg-sky-400/10 text-sky-300'
    : state === 'acknowledgement_required'
      ? 'border-amber-400/30 bg-amber-400/10 text-amber-300'
      : state === 'acknowledged'
        ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300'
        : 'border-border bg-muted/20 text-muted-foreground';
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${tone}`}>
      {inboxStateLabel(state)}
    </span>
  );
}

function BackToWorkspace() {
  return (
    <Link
      to="/country-hub/hod"
      className="rounded-xl border border-border bg-surface px-3 py-2 text-sm font-semibold"
    >
      Delegation workspace →
    </Link>
  );
}

function inboxStateLabel(state: NoticeInboxState) {
  if (state === 'acknowledgement_required') return 'Needs acknowledgement';
  return state.charAt(0).toUpperCase() + state.slice(1);
}

function formatTimestamp(value: string | null) {
  if (!value) return 'Not published';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}
