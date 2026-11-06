import { Link } from "@tanstack/react-router";
import {
  BellRing,
  CheckCircle2,
  Mail,
  Settings2,
  ShieldCheck,
  Smartphone,
} from "lucide-react";

import type { AppPushDeliveryStatus } from "@/lib/app-notifications";
import { formatEventDateTime } from "@/lib/public-time";
import {
  V3ActionCard,
  V3NowCard,
  V3Screen,
  V3ScreenHeader,
  V3Section,
  V3StatusChip,
  V3Surface,
} from "./V3Foundation";

export type V3NotificationInboxItem = {
  id: string;
  title: string;
  sentAt: string | null;
  typeLabel: string;
  severity: "info" | "important" | "critical";
  state: "unread" | "read" | "acknowledgement_required" | "acknowledged" | "archived";
  acknowledgementRequired: boolean;
};

export type V3NotificationsScreenProps = {
  deliveryStatus: AppPushDeliveryStatus;
  enabledCategoryCount: number;
  quietHoursLabel: string;
  urgentDeadlineReminders: boolean;
  preferencesUnavailable?: boolean;
  inboxUnavailable?: boolean;
  inboxItems: readonly V3NotificationInboxItem[];
};

function formatNoticeTime(value: string | null) {
  if (!value) return "Recently";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently";
  return formatEventDateTime(date, { locale: "en-GB" });
}

function noticeTone(item: V3NotificationInboxItem) {
  if (item.severity === "critical") return "danger" as const;
  if (item.state === "acknowledgement_required") return "required" as const;
  if (item.state === "unread") return "progress" as const;
  if (item.state === "acknowledged") return "success" as const;
  return "neutral" as const;
}

function noticeStateLabel(item: V3NotificationInboxItem) {
  if (item.state === "acknowledgement_required") return "Action required";
  if (item.state === "acknowledged") return "Acknowledged";
  if (item.state === "unread") return "Unread";
  if (item.state === "archived") return "Archived";
  return "Read";
}

export function V3NotificationsScreen({
  deliveryStatus,
  enabledCategoryCount,
  quietHoursLabel,
  urgentDeadlineReminders,
  preferencesUnavailable = false,
  inboxUnavailable = false,
  inboxItems,
}: V3NotificationsScreenProps) {
  const activeItems = inboxItems.filter((item) => item.state !== "archived");
  const acknowledgementCount = activeItems.filter(
    (item) =>
      item.state === "acknowledgement_required" ||
      (item.acknowledgementRequired && item.state === "unread"),
  ).length;
  const unreadWithoutAction = activeItems.filter(
    (item) => item.state === "unread" && !item.acknowledgementRequired,
  ).length;
  const attentionCount = acknowledgementCount + unreadWithoutAction;
  const recent = [...activeItems]
    .sort((a, b) => {
      const aTime = a.sentAt ? new Date(a.sentAt).getTime() : 0;
      const bTime = b.sentAt ? new Date(b.sentAt).getTime() : 0;
      return bTime - aTime;
    })
    .slice(0, 8);

  return (
    <V3Screen className="pb-8">
      <div data-v3-notifications-route="" data-v3-notifications-screen="">
        <V3ScreenHeader
          kicker="Me"
          title="Notifications"
          description="Official updates, important messages and delivery settings in one place."
        />

        <V3Section title="Needs attention">
          <V3NowCard
            eyebrow={attentionCount > 0 ? "Action & unread" : "Inbox"}
            title={
              inboxUnavailable
                ? "Official messages are temporarily unavailable"
                : attentionCount > 0
                  ? `${attentionCount} item${attentionCount === 1 ? "" : "s"} need your attention`
                  : "You're caught up"
            }
            count={inboxUnavailable ? undefined : attentionCount > 0 ? attentionCount : "✓"}
          >
            {inboxUnavailable ? (
              <V3ActionCard
                title="Open official notices"
                description="If the notification summary is unavailable, you can still open your official messages directly."
                icon={ShieldCheck}
                tone="neutral"
                to="/my-solaris/notices"
              />
            ) : attentionCount > 0 ? (
              <div className="grid gap-2.5">
                {acknowledgementCount > 0 ? (
                  <V3ActionCard
                    title={`${acknowledgementCount} acknowledgement${acknowledgementCount === 1 ? "" : "s"} required`}
                    description="Read and acknowledge these messages in Notices."
                    icon={ShieldCheck}
                    tone="required"
                    to="/my-solaris/notices"
                  />
                ) : null}
                {unreadWithoutAction > 0 ? (
                  <V3ActionCard
                    title={`${unreadWithoutAction} unread official message${unreadWithoutAction === 1 ? "" : "s"}`}
                    description="Open Notices to read the full messages."
                    icon={Mail}
                    tone="neutral"
                    to="/my-solaris/notices"
                  />
                ) : null}
              </div>
            ) : (
              <div className="flex items-start gap-3 text-sm text-[var(--v3-text-secondary)]">
                <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-[var(--v3-success)]" aria-hidden="true" />
                <p>No unread official messages or acknowledgement requests are waiting here.</p>
              </div>
            )}
          </V3NowCard>
        </V3Section>

        <V3Section
          title="Official messages"
          meta={
            <Link
              to="/my-solaris/notices"
              className="text-xs font-semibold text-[var(--v3-text-secondary)] hover:text-[var(--v3-text-primary)]"
            >
              Open all
            </Link>
          }
        >
          {inboxUnavailable ? (
            <V3Surface>
              <p className="text-sm font-semibold">Inbox status unavailable</p>
              <p className="mt-1 text-xs leading-5 text-[var(--v3-text-secondary)]">
                Solaris couldn't load this summary. You can still open Notices directly.
              </p>
            </V3Surface>
          ) : recent.length ? (
            <div data-v3-notification-list="">
              <V3Surface className="overflow-hidden p-0">
                <div className="divide-y divide-[var(--v3-border-subtle)]">
                  {recent.map((item) => (
                    <Link
                      key={item.id}
                      to="/my-solaris/notices"
                      search={{ notice: item.id }}
                      className="flex min-h-16 items-start gap-3 px-3 py-3 transition hover:bg-white/[0.025] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/35 sm:px-4"
                      data-v3-notification-row=""
                    >
                      <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl bg-white/[0.045] text-[var(--v3-text-secondary)]">
                        <BellRing className="size-4" aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-[var(--v3-text-primary)]">
                            {item.title}
                          </span>
                          <V3StatusChip tone={noticeTone(item)}>{noticeStateLabel(item)}</V3StatusChip>
                        </span>
                        <span className="mt-1 block text-xs leading-5 text-[var(--v3-text-secondary)]">
                          {item.typeLabel} · {formatNoticeTime(item.sentAt)}
                        </span>
                      </span>
                    </Link>
                  ))}
                </div>
              </V3Surface>
            </div>
          ) : (
            <V3Surface>
              <div className="flex items-start gap-3">
                <Mail className="mt-0.5 size-5 shrink-0 text-[var(--v3-text-secondary)]" aria-hidden="true" />
                <div>
                  <p className="text-sm font-semibold">No official messages yet</p>
                  <p className="mt-1 text-xs leading-5 text-[var(--v3-text-secondary)]">
                    New official Solaris communications for your account will appear here when applicable.
                  </p>
                </div>
              </div>
            </V3Surface>
          )}
        </V3Section>

        <V3Section title="Delivery">
          <div className="grid gap-2.5">
            <V3Surface level="raised">
              <div className="flex items-start gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-white/[0.055] text-[var(--v3-text-secondary)]">
                  <Smartphone className="size-4" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold">{deliveryStatus.title}</p>
                    <V3StatusChip tone={deliveryStatus.mode === "active" ? "success" : "neutral"}>
                      {deliveryStatus.mode === "active" ? "On" : "Status"}
                    </V3StatusChip>
                  </div>
                  <p className="mt-1 text-xs leading-5 text-[var(--v3-text-secondary)]">
                    {deliveryStatus.description}
                  </p>
                </div>
              </div>
            </V3Surface>

            <V3Surface>
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.13em] text-[var(--v3-text-tertiary)]">
                    Categories
                  </p>
                  <p className="mt-1 text-sm font-semibold">
                    {preferencesUnavailable ? "Unavailable" : `${enabledCategoryCount} enabled`}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.13em] text-[var(--v3-text-tertiary)]">
                    Quiet hours
                  </p>
                  <p className="mt-1 text-sm font-semibold">
                    {preferencesUnavailable ? "Unavailable" : quietHoursLabel}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.13em] text-[var(--v3-text-tertiary)]">
                    Urgent reminders
                  </p>
                  <p className="mt-1 text-sm font-semibold">
                    {preferencesUnavailable ? "Unavailable" : urgentDeadlineReminders ? "Allowed" : "Quiet hours apply"}
                  </p>
                </div>
              </div>
              <Link
                to="/settings"
                className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl border border-[var(--v3-border-subtle)] bg-white/[0.035] px-4 text-xs font-semibold text-[var(--v3-text-primary)]"
              >
                <Settings2 className="size-4" aria-hidden="true" />
                Manage notification settings
              </Link>
            </V3Surface>
          </div>
        </V3Section>

        <V3Section title="Required work">
          <V3Surface>
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 size-5 shrink-0 text-[var(--v3-text-secondary)]" aria-hidden="true" />
              <div className="min-w-0">
                <p className="text-sm font-semibold">Your required work is still available</p>
                <p className="mt-1 text-xs leading-5 text-[var(--v3-text-secondary)]">
                  If a notification is delayed or blocked, check Participate for current responsibilities and Notices for official messages.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link
                    to="/participate"
                    className="inline-flex min-h-10 items-center rounded-xl border border-[var(--v3-border-subtle)] px-3 text-xs font-semibold"
                  >
                    Open Participate
                  </Link>
                  <Link
                    to="/my-solaris/notices"
                    className="inline-flex min-h-10 items-center rounded-xl border border-[var(--v3-border-subtle)] px-3 text-xs font-semibold"
                  >
                    Open Notices
                  </Link>
                </div>
              </div>
            </div>
          </V3Surface>
        </V3Section>
      </div>
    </V3Screen>
  );
}
