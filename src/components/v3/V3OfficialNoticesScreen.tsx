import {
  Archive,
  CheckCircle2,
  CircleHelp,
  Inbox,
  MailOpen,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";

import type { NoticeInboxState } from "@/lib/official-communications";
import { noticeTypeLabel } from "@/lib/official-communications";
import { formatEventWallTime } from "@/lib/public-time";
import type { Studio2NoticeInboxItem } from "@/lib/studio2-communications";
import {
  V3_OFFICIAL_NOTICE_FILTER_STATES,
  v3OfficialNoticeNeedsAction,
  v3OfficialNoticeReason,
} from "@/lib/v3-official-notices";
import {
  V3Screen,
  V3ScreenHeader,
  V3Section,
  V3StatusChip,
  V3Surface,
  type V3StatusTone,
} from "./V3Foundation";

export type V3OfficialNoticesScreenProps = {
  countryName: string;
  items: readonly Studio2NoticeInboxItem[];
  selectedId?: string;
  filter?: NoticeInboxState;
  loading?: boolean;
  unavailable?: boolean;
  loadError?: boolean;
  busy?: boolean;
  mutationError?: boolean;
  onSelect: (noticeId: string) => void;
  onFilter: (state?: NoticeInboxState) => void;
  onAcknowledge: (noticeId: string) => void;
  onArchive: (noticeId: string, archived: boolean) => void;
};

function formatTimestamp(value: string | null | undefined) {
  if (!value) return "Not recorded";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not recorded";
  return formatEventWallTime(date, { locale: "en-GB" });
}

function stateLabel(state: NoticeInboxState) {
  switch (state) {
    case "unread":
      return "Unread";
    case "read":
      return "Read";
    case "acknowledgement_required":
      return "Action required";
    case "acknowledged":
      return "Acknowledged";
    case "archived":
      return "Archived";
  }
}

function stateTone(state: NoticeInboxState): V3StatusTone {
  switch (state) {
    case "acknowledgement_required":
      return "required";
    case "acknowledged":
      return "success";
    case "unread":
      return "progress";
    default:
      return "neutral";
  }
}

function severityTone(severity: Studio2NoticeInboxItem["notice"]["severity"]): V3StatusTone {
  return severity === "critical" ? "danger" : severity === "urgent" ? "required" : "neutral";
}

export function V3OfficialNoticesScreen({
  countryName,
  items,
  selectedId,
  filter,
  loading = false,
  unavailable = false,
  loadError = false,
  busy = false,
  mutationError = false,
  onSelect,
  onFilter,
  onAcknowledge,
  onArchive,
}: V3OfficialNoticesScreenProps) {
  const filteredItems = filter
    ? items.filter((item) => item.inboxState === filter)
    : items;
  const selected = selectedId
    ? items.find((item) => item.notice.id === selectedId) ?? null
    : null;
  const actionCount = items.filter((item) =>
    v3OfficialNoticeNeedsAction(item.notice, item.inboxState),
  ).length;
  const unreadCount = items.filter((item) => item.inboxState === "unread").length;

  return (
    <V3Screen className="pb-8">
      <div data-v3-official-notices-route="" data-v3-official-notices-screen="">
        <V3ScreenHeader
          kicker="Me · Official notices"
          title={`${countryName} notices`}
          description="Official Solaris messages for your delegation. Reading a notice and formally acknowledging it are separate actions."
        />

        <V3Section title="Status">
          <div className="grid gap-2.5 sm:grid-cols-3">
            <V3Surface>
              <p className="text-[10px] font-black uppercase tracking-[0.13em] text-[var(--v3-text-tertiary)]">
                Action required
              </p>
              <p className="mt-1 text-2xl font-semibold">{actionCount}</p>
            </V3Surface>
            <V3Surface>
              <p className="text-[10px] font-black uppercase tracking-[0.13em] text-[var(--v3-text-tertiary)]">
                Unread
              </p>
              <p className="mt-1 text-2xl font-semibold">{unreadCount}</p>
            </V3Surface>
            <V3Surface>
              <p className="text-[10px] font-black uppercase tracking-[0.13em] text-[var(--v3-text-tertiary)]">
                Total
              </p>
              <p className="mt-1 text-2xl font-semibold">{items.length}</p>
            </V3Surface>
          </div>
        </V3Section>

        <V3Section title="Inbox">
          <nav className="mb-3 flex gap-2 overflow-x-auto pb-1" aria-label="Filter official notices">
            <FilterButton active={!filter} label="All" onClick={() => onFilter(undefined)} />
            {V3_OFFICIAL_NOTICE_FILTER_STATES.map((state) => (
              <FilterButton
                key={state}
                active={filter === state}
                label={`${stateLabel(state)} (${items.filter((item) => item.inboxState === state).length})`}
                onClick={() => onFilter(state)}
              />
            ))}
          </nav>

          {unavailable ? (
            <V3Surface>
              <div className="flex items-start gap-3" role="status">
                <ShieldCheck className="mt-0.5 size-5 shrink-0 text-[var(--v3-text-secondary)]" aria-hidden="true" />
                <div>
                  <p className="text-sm font-semibold">Official notices are unavailable</p>
                  <p className="mt-1 text-xs leading-5 text-[var(--v3-text-secondary)]">
                    The official-communications service is not currently enabled for this context.
                  </p>
                </div>
              </div>
            </V3Surface>
          ) : loading ? (
            <V3Surface>
              <p className="text-sm text-[var(--v3-text-secondary)]" role="status" aria-live="polite">
                Loading official notices…
              </p>
            </V3Surface>
          ) : loadError ? (
            <V3Surface>
              <div role="alert">
                <p className="text-sm font-semibold">The delegation inbox could not be loaded.</p>
                <p className="mt-1 text-xs leading-5 text-[var(--v3-text-secondary)]">
                  Solaris has not changed any notice or acknowledgement state.
                </p>
              </div>
            </V3Surface>
          ) : filteredItems.length === 0 ? (
            <V3Surface>
              <div className="flex min-h-32 flex-col items-center justify-center text-center">
                <Inbox className="mb-3 size-6 text-[var(--v3-text-secondary)]" aria-hidden="true" />
                <p className="text-sm font-semibold">No notices in this view</p>
                <p className="mt-1 max-w-md text-xs leading-5 text-[var(--v3-text-secondary)]">
                  New official messages for your delegation will appear here.
                </p>
              </div>
            </V3Surface>
          ) : (
            <div className="grid gap-3 lg:grid-cols-[minmax(0,.9fr)_minmax(0,1.1fr)]">
              <V3Surface className="p-2">
                <div className="divide-y divide-white/[0.07]">
                  {filteredItems.map((item) => (
                    <button
                      key={item.notice.id}
                      type="button"
                      onClick={() => onSelect(item.notice.id)}
                      aria-pressed={selected?.notice.id === item.notice.id}
                      className="flex min-h-16 w-full items-start justify-between gap-3 rounded-xl px-3 py-3 text-left transition hover:bg-white/[0.035] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/45"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-[var(--v3-text-primary)]">
                            {item.notice.title}
                          </span>
                          <V3StatusChip tone={stateTone(item.inboxState)}>
                            {stateLabel(item.inboxState)}
                          </V3StatusChip>
                        </span>
                        <span className="mt-1 block text-xs leading-5 text-[var(--v3-text-secondary)]">
                          {noticeTypeLabel(item.notice.noticeType)} · {formatTimestamp(item.notice.sentAt)}
                        </span>
                      </span>
                      {item.notice.severity === "critical" ? (
                        <V3StatusChip tone="danger">Critical</V3StatusChip>
                      ) : null}
                    </button>
                  ))}
                </div>
              </V3Surface>

              <V3Surface level="raised">
                {selected ? (
                  <NoticeDetail
                    item={selected}
                    busy={busy}
                    mutationError={mutationError}
                    onAcknowledge={() => onAcknowledge(selected.notice.id)}
                    onArchive={(archived) => onArchive(selected.notice.id, archived)}
                  />
                ) : selectedId ? (
                  <div className="flex min-h-48 flex-col items-center justify-center text-center" role="status">
                    <MailOpen className="mb-3 size-6 text-[var(--v3-text-secondary)]" aria-hidden="true" />
                    <p className="text-sm font-semibold">This notice is no longer available</p>
                    <p className="mt-1 max-w-md text-xs leading-5 text-[var(--v3-text-secondary)]">
                      The link may be stale or the notice may no longer be available to this account. No action was taken.
                    </p>
                  </div>
                ) : (
                  <div className="flex min-h-48 flex-col items-center justify-center text-center">
                    <MailOpen className="mb-3 size-6 text-[var(--v3-text-secondary)]" aria-hidden="true" />
                    <p className="text-sm font-semibold">Select a notice</p>
                    <p className="mt-1 text-xs leading-5 text-[var(--v3-text-secondary)]">
                      Open a message to read its official content and current receipt state.
                    </p>
                  </div>
                )}
              </V3Surface>
            </div>
          )}
        </V3Section>
      </div>
    </V3Screen>
  );
}

function NoticeDetail({
  item,
  busy,
  mutationError,
  onAcknowledge,
  onArchive,
}: {
  item: Studio2NoticeInboxItem;
  busy: boolean;
  mutationError: boolean;
  onAcknowledge: () => void;
  onArchive: (archived: boolean) => void;
}) {
  const { notice, receipt, inboxState } = item;
  const archived = inboxState === "archived";
  const acknowledged = inboxState === "acknowledged";
  const needsAction = v3OfficialNoticeNeedsAction(notice, inboxState);

  return (
    <article className="space-y-5" data-v3-official-notice-detail={notice.id}>
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <V3StatusChip tone={stateTone(inboxState)}>{stateLabel(inboxState)}</V3StatusChip>
          <V3StatusChip tone={severityTone(notice.severity)}>{notice.severity.replace(/_/g, " ")}</V3StatusChip>
        </div>
        <h2 className="mt-3 text-xl font-bold tracking-[-0.02em]">{notice.title}</h2>
        <p className="mt-1 text-xs text-[var(--v3-text-secondary)]">
          {noticeTypeLabel(notice.noticeType)} · Sent {formatTimestamp(notice.sentAt)}
        </p>
      </div>

      <p className="whitespace-pre-wrap text-sm leading-6 text-[var(--v3-text-secondary)]">
        {notice.body}
      </p>

      <div className="rounded-2xl border border-[var(--v3-border-subtle)] bg-white/[0.025] p-4">
        <div className="flex items-start gap-3">
          <CircleHelp className="mt-0.5 size-4 shrink-0 text-[var(--v3-text-secondary)]" aria-hidden="true" />
          <div>
            <p className="text-sm font-semibold">Why am I seeing this?</p>
            <p className="mt-1 text-xs leading-5 text-[var(--v3-text-secondary)]">
              {v3OfficialNoticeReason(notice)}
            </p>
          </div>
        </div>
      </div>

      {notice.acknowledgementRequired ? (
        <div className="rounded-2xl border border-[var(--v3-border-subtle)] bg-white/[0.025] p-4">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[var(--v3-text-secondary)]" aria-hidden="true" />
            <div>
              <p className="text-sm font-semibold">
                {acknowledged ? "Acknowledgement recorded" : "Acknowledgement required"}
              </p>
              <p className="mt-1 text-xs leading-5 text-[var(--v3-text-secondary)]">
                {acknowledged
                  ? `Recorded ${formatTimestamp(receipt?.acknowledgedAt)}.`
                  : "Reading this notice does not acknowledge it. Use the button below only after you have read the official message."}
              </p>
            </div>
          </div>
        </div>
      ) : null}

      <dl className="grid gap-3 text-xs sm:grid-cols-2">
        <ReceiptItem label="Delivered" value={formatTimestamp(receipt?.deliveredAt)} />
        <ReceiptItem label="Opened" value={formatTimestamp(receipt?.openedAt)} />
      </dl>

      {mutationError ? (
        <div className="rounded-xl border border-rose-300/25 bg-rose-300/[0.06] px-3 py-2" role="alert">
          <p className="text-sm font-semibold">The notice could not be updated.</p>
          <p className="mt-1 text-xs text-[var(--v3-text-secondary)]">
            Solaris has not assumed the operation succeeded. The inbox still reflects the last confirmed server state.
          </p>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {needsAction && !archived ? (
          <button
            type="button"
            disabled={busy}
            onClick={onAcknowledge}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-white px-4 text-xs font-bold text-black disabled:opacity-50"
          >
            <ShieldCheck className="size-4" aria-hidden="true" />
            {busy ? "Recording…" : "Acknowledge notice"}
          </button>
        ) : null}
        <button
          type="button"
          disabled={busy}
          onClick={() => onArchive(!archived)}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[var(--v3-border-subtle)] bg-white/[0.035] px-4 text-xs font-semibold disabled:opacity-50"
        >
          {archived ? <RotateCcw className="size-4" aria-hidden="true" /> : <Archive className="size-4" aria-hidden="true" />}
          {archived ? "Restore to inbox" : "Archive"}
        </button>
      </div>
    </article>
  );
}

function ReceiptItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-black uppercase tracking-[0.12em] text-[var(--v3-text-tertiary)]">{label}</dt>
      <dd className="mt-1 text-[var(--v3-text-secondary)]">{value}</dd>
    </div>
  );
}

function FilterButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`min-h-10 shrink-0 rounded-xl border px-3 text-xs font-semibold transition ${
        active
          ? "border-white/20 bg-white/[0.09] text-[var(--v3-text-primary)]"
          : "border-[var(--v3-border-subtle)] bg-white/[0.025] text-[var(--v3-text-secondary)]"
      }`}
    >
      {label}
    </button>
  );
}
