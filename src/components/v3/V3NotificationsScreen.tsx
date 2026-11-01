import { Link } from "@tanstack/react-router";
import {
  BellRing,
  CheckCircle2,
  ChevronRight,
  Mail,
  Settings2,
  ShieldCheck,
  Smartphone,
} from "lucide-react";

import type { AppPushDeliveryStatus } from "@/lib/app-notifications";
import { formatEventDateTime } from "@/lib/public-time";
import {
  V3NowCard,
  V3Screen,
  V3Section,
  V3StatusChip,
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

function AttentionLink({
  to,
  icon: Icon,
  title,
  description,
}: {
  to: string;
  icon: typeof ShieldCheck;
  title: string;
  description: string;
}) {
  return (
    <Link
      to={to as any}
      className="group flex min-h-16 items-center gap-3 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
    >
      <Icon className="size-4 shrink-0 text-primary" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{title}</span>
        <span className="mt-0.5 block text-xs leading-5 text-white/45">{description}</span>
      </span>
      <ChevronRight className="size-4 shrink-0 text-white/24 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
    </Link>
  );
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
    <V3Screen>
      <div data-v3-notifications-route="" data-v3-notifications-screen="">
        <header className="mb-6 max-w-3xl" data-v3-notifications-header="">
          <p className="v3-kicker">Me</p>
          <h1 className="mt-2 text-[clamp(2rem,9vw,3.25rem)] font-semibold leading-[0.97] tracking-[-0.055em]">
            Notifications
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-white/50">
            Official messages, attention items and delivery status without turning your inbox into a dashboard.
          </p>
        </header>

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
              <div className="border-y border-white/[0.07]">
                <AttentionLink
                  to="/my-solaris/notices"
                  icon={ShieldCheck}
                  title="Open official notices"
                  description="The summary is unavailable, but your official messages remain available directly."
                />
              </div>
            ) : attentionCount > 0 ? (
              <div className="divide-y divide-white/[0.065] border-y border-white/[0.07]">
                {acknowledgementCount > 0 ? (
                  <AttentionLink
                    to="/my-solaris/notices"
                    icon={ShieldCheck}
                    title={`${acknowledgementCount} acknowledgement${acknowledgementCount === 1 ? "" : "s"} required`}
                    description="Read and acknowledge these messages in Notices."
                  />
                ) : null}
                {unreadWithoutAction > 0 ? (
                  <AttentionLink
                    to="/my-solaris/notices"
                    icon={Mail}
                    title={`${unreadWithoutAction} unread official message${unreadWithoutAction === 1 ? "" : "s"}`}
                    description="Open Notices to read the full messages."
                  />
                ) : null}
              </div>
            ) : (
              <div className="flex items-start gap-3 border-y border-white/[0.07] py-4 text-sm text-white/50">
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
              className="text-xs font-semibold text-white/48 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
            >
              Open all
            </Link>
          }
        >
          {inboxUnavailable ? (
            <div className="border-y border-white/[0.07] py-5">
              <p className="text-sm font-semibold">Inbox status unavailable</p>
              <p className="mt-1 text-xs leading-5 text-white/45">
                Solaris couldn&apos;t load this summary. You can still open Notices directly.
              </p>
            </div>
          ) : recent.length ? (
            <div className="divide-y divide-white/[0.065] border-y border-white/[0.07]" data-v3-notification-list="">
              {recent.map((item) => (
                <Link
                  key={item.id}
                  to="/my-solaris/notices"
                  search={{ notice: item.id }}
                  className="group flex min-h-16 items-start gap-3 py-3.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
                  data-v3-notification-row=""
                >
                  <BellRing className="mt-1 size-4 shrink-0 text-white/38" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold">{item.title}</span>
                      <V3StatusChip tone={noticeTone(item)}>{noticeStateLabel(item)}</V3StatusChip>
                    </span>
                    <span className="mt-1 block text-xs leading-5 text-white/43">
                      {item.typeLabel} · {formatNoticeTime(item.sentAt)}
                    </span>
                  </span>
                  <ChevronRight className="mt-1 size-4 shrink-0 text-white/22 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                </Link>
              ))}
            </div>
          ) : (
            <div className="flex items-start gap-3 border-y border-white/[0.07] py-5">
              <Mail className="mt-0.5 size-5 shrink-0 text-white/32" aria-hidden="true" />
              <div>
                <p className="text-sm font-semibold">No official messages yet</p>
                <p className="mt-1 text-xs leading-5 text-white/45">
                  New official Solaris communications for your account will appear here when applicable.
                </p>
              </div>
            </div>
          )}
        </V3Section>

        <V3Section title="Delivery">
          <div className="border-y border-white/[0.07]">
            <div className="flex items-start gap-3 py-4">
              <Smartphone className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold">{deliveryStatus.title}</p>
                  <V3StatusChip tone={deliveryStatus.mode === "active" ? "success" : "neutral"}>
                    {deliveryStatus.mode === "active" ? "On" : "Status"}
                  </V3StatusChip>
                </div>
                <p className="mt-1 text-xs leading-5 text-white/45">{deliveryStatus.description}</p>
              </div>
            </div>

            <dl className="grid grid-cols-2 border-t border-white/[0.065] sm:grid-cols-3 sm:divide-x sm:divide-white/[0.065]">
              <div className="py-4 sm:pr-4">
                <dt className="v3-kicker">Categories</dt>
                <dd className="mt-1 text-sm font-semibold">
                  {preferencesUnavailable ? "Unavailable" : `${enabledCategoryCount} enabled`}
                </dd>
              </div>
              <div className="py-4 sm:px-4">
                <dt className="v3-kicker">Quiet hours</dt>
                <dd className="mt-1 text-sm font-semibold">
                  {preferencesUnavailable ? "Unavailable" : quietHoursLabel}
                </dd>
              </div>
              <div className="col-span-2 border-t border-white/[0.065] py-4 sm:col-span-1 sm:border-t-0 sm:pl-4">
                <dt className="v3-kicker">Urgent reminders</dt>
                <dd className="mt-1 text-sm font-semibold">
                  {preferencesUnavailable ? "Unavailable" : urgentDeadlineReminders ? "Allowed" : "Quiet hours apply"}
                </dd>
              </div>
            </dl>

            <Link
              to="/settings"
              className="group flex min-h-12 items-center gap-3 border-t border-white/[0.065] py-3 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
            >
              <Settings2 className="size-4 text-primary" aria-hidden="true" />
              <span className="flex-1">Manage notification settings</span>
              <ChevronRight className="size-4 text-white/24 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
            </Link>
          </div>
        </V3Section>

        <V3Section title="Required work">
          <div className="border-l-2 border-[var(--v3-accent)] pl-4">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
              <div className="min-w-0">
                <p className="text-sm font-semibold">Your required work is still available</p>
                <p className="mt-1 max-w-2xl text-xs leading-5 text-white/45">
                  If a notification is delayed or blocked, check Participate for current responsibilities and Notices for official messages.
                </p>
                <nav aria-label="Required work links" className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs font-semibold">
                  <Link to="/participate" className="text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70">
                    Open Participate
                  </Link>
                  <Link to="/my-solaris/notices" className="text-white/60 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70">
                    Open Notices
                  </Link>
                </nav>
              </div>
            </div>
          </div>
        </V3Section>
      </div>
    </V3Screen>
  );
}
