import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Archive, CheckCircle2, Inbox, MailOpen, Undo2 } from "lucide-react";

import { AppShell, PageHeader, Panel } from "@/components/AppShell";
import { useMyCountryAccount } from "@/lib/country-account";
import { noticeTypeLabel } from "@/lib/official-communications";
import {
  acknowledgeStudio2InboxNotice,
  archiveStudio2Notice,
  markStudio2NoticeOpened,
  type Studio2NoticeInboxItem,
} from "@/lib/studio2-communications";
import { loadStudio2RecipientNoticeInbox } from "@/lib/studio2-recipient-inbox";

export function OrganizerRecipientNoticesModule() {
  const account = useMyCountryAccount();
  const queryClient = useQueryClient();
  const access = account.data?.access;
  const country = account.data?.country;

  const inboxQuery = useQuery({
    queryKey: ["studio2-recipient-notice-inbox", access?.userId ?? "none"],
    enabled:
      Boolean(access?.userId && country?.id) &&
      access?.isOrganizer === true &&
      access?.countryStatus === "active",
    queryFn: () => loadStudio2RecipientNoticeInbox(),
    refetchInterval: 120_000,
    refetchOnWindowFocus: false,
  });

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["studio2-recipient-notice-inbox"] }),
      queryClient.invalidateQueries({ queryKey: ["mysolaris-notice-summary"] }),
      queryClient.invalidateQueries({ queryKey: ["studio2-official-notices"] }),
    ]);
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
  const unreadCount = items.filter((item) => item.inboxState === "unread").length;
  const acknowledgementCount = items.filter(
    (item) =>
      item.inboxState === "acknowledgement_required" ||
      (item.notice.acknowledgementRequired && item.inboxState === "unread"),
  ).length;
  const busy = markOpened.isPending || acknowledge.isPending || archive.isPending;
  const mutationError = markOpened.error || acknowledge.error || archive.error;

  return (
    <AppShell>
      <PageHeader
        eyebrow="MySolaris · Official communications"
        title={`${country?.name ?? "Delegation"} notices`}
        description="Your delegation recipient inbox. Organizer permissions do not replace this view, so acknowledgement requests can be completed here normally."
        actions={
          <Link
            to="/admin/communications"
            className="rounded-xl border border-border bg-surface px-3 py-2 text-sm font-semibold"
          >
            Organizer communications →
          </Link>
        }
      />

      <div className="space-y-4">
        <section className="grid gap-3 sm:grid-cols-3">
          <Metric label="Unread" value={unreadCount} />
          <Metric label="Needs acknowledgement" value={acknowledgementCount} />
          <Metric label="Total" value={items.length} />
        </section>

        {mutationError ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {errorMessage(mutationError, "The notice could not be updated.")}
          </div>
        ) : null}

        {account.isLoading || inboxQuery.isLoading ? (
          <Panel title="Official notices">
            <p className="text-sm text-muted-foreground">Loading notices…</p>
          </Panel>
        ) : inboxQuery.isError ? (
          <Panel title="Official notices">
            <p className="text-sm text-destructive">
              {errorMessage(inboxQuery.error, "The delegation inbox could not be loaded.")}
            </p>
          </Panel>
        ) : items.length === 0 ? (
          <Panel title="Official notices">
            <div className="flex min-h-40 flex-col items-center justify-center text-center">
              <Inbox className="mb-3 size-7 text-muted-foreground" />
              <p className="font-semibold">No delegation notices</p>
              <p className="mt-1 max-w-md text-sm text-muted-foreground">
                Communications addressed to your delegation will appear here.
              </p>
            </div>
          </Panel>
        ) : (
          <div className="space-y-3">
            {items.map((item) => (
              <NoticeCard
                key={item.notice.id}
                item={item}
                busy={busy}
                onMarkOpened={() => markOpened.mutate(item.notice.id)}
                onAcknowledge={() => acknowledge.mutate(item.notice.id)}
                onArchive={(archived) => archive.mutate({ noticeId: item.notice.id, archived })}
              />
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}

function NoticeCard({
  item,
  busy,
  onMarkOpened,
  onAcknowledge,
  onArchive,
}: {
  item: Studio2NoticeInboxItem;
  busy: boolean;
  onMarkOpened: () => void;
  onAcknowledge: () => void;
  onArchive: (archived: boolean) => void;
}) {
  const notice = item.notice;
  const archived = item.inboxState === "archived";
  const acknowledged = item.inboxState === "acknowledged";
  const acknowledgementPending = notice.acknowledgementRequired && !acknowledged && !archived;

  return (
    <Panel title={notice.title}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <InboxBadge state={item.inboxState} />
          <span>{noticeTypeLabel(notice.noticeType)}</span>
          <span>·</span>
          <span>{formatTimestamp(notice.sentAt)}</span>
        </div>

        <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
          {notice.body}
        </p>

        {notice.acknowledgementRequired ? (
          <div className="rounded-xl border border-border bg-muted/20 p-3 text-sm">
            <div className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
              <div>
                <p className="font-semibold">
                  {acknowledged ? "Acknowledged" : "Acknowledgement required"}
                </p>
                <p className="mt-1 text-muted-foreground">
                  {acknowledged
                    ? "Your delegation acknowledgement has been recorded."
                    : "TSBC requires your delegation to explicitly acknowledge this communication."}
                </p>
              </div>
            </div>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {acknowledgementPending ? (
            <button
              type="button"
              disabled={busy}
              onClick={onAcknowledge}
              className="min-h-10 rounded-xl bg-aurora px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              Acknowledge notice
            </button>
          ) : item.inboxState === "unread" ? (
            <button
              type="button"
              disabled={busy}
              onClick={onMarkOpened}
              className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-border bg-surface px-4 text-sm font-semibold disabled:opacity-50"
            >
              <MailOpen className="size-4" /> Mark as read
            </button>
          ) : null}

          <button
            type="button"
            disabled={busy}
            onClick={() => onArchive(!archived)}
            className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-border bg-surface px-4 text-sm font-semibold disabled:opacity-50"
          >
            {archived ? <Undo2 className="size-4" /> : <Archive className="size-4" />}
            {archived ? "Restore to inbox" : "Archive"}
          </button>
        </div>
      </div>
    </Panel>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
    </div>
  );
}

function InboxBadge({ state }: { state: Studio2NoticeInboxItem["inboxState"] }) {
  const label = state.replace(/_/g, " ");
  return (
    <span className="rounded-full border border-border bg-muted/20 px-2 py-0.5 font-semibold capitalize">
      {label}
    </span>
  );
}

function formatTimestamp(value: string | null) {
  if (!value) return "Not sent";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}
