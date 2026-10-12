import { AlertTriangle, Bell, CalendarDays, Radio } from "lucide-react";

import type {
  V3OrganizerOverviewProjection,
  V3OrganizerTask,
} from "@/lib/v3-organizer-ia";
import {
  V3ActionCard,
  V3Progress,
  V3Screen,
  V3ScreenHeader,
  V3Section,
  V3StatusChip,
  V3Surface,
  type V3ActionTone,
  type V3StatusTone,
} from "./V3Foundation";

export type V3OrganizerOverviewScreenProps = {
  projection: V3OrganizerOverviewProjection;
};

function taskTone(task: V3OrganizerTask): V3ActionTone {
  if (task.state === "blocked") return "problem";
  if (task.priority === "critical" || task.priority === "high") return "urgent";
  return "neutral";
}

function readinessTone(
  status: V3OrganizerOverviewProjection["readiness"]["status"],
): V3StatusTone {
  if (status === "ready") return "success";
  if (status === "blocked") return "danger";
  return "warning";
}

function taskDescription(task: V3OrganizerTask): string {
  if (task.state === "blocked" && task.blockedReason) {
    return `${task.detail} · Blocked: ${task.blockedReason}`;
  }
  return task.detail;
}

/**
 * Exception-first mobile Organizer overview.
 *
 * Canonical task, inbox, readiness and Live truth is projected upstream. This
 * screen deliberately performs no capability, risk, mutation or clock logic.
 */
export function V3OrganizerOverviewScreen({ projection }: V3OrganizerOverviewScreenProps) {
  const inboxMeta = [
    projection.unresolvedInboxCount
      ? `${projection.unresolvedInboxCount} need action`
      : "No unresolved action",
    projection.unreadInboxCount ? `${projection.unreadInboxCount} unread` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <V3Screen>
      <V3ScreenHeader
        kicker="Organizer"
        title={projection.context.editionLabel}
        description="Exceptions first: what needs action, operational readiness, communication and the next known event."
      />

      <V3Section
        title="Readiness"
        meta={
          <V3StatusChip tone={readinessTone(projection.readiness.status)}>
            {projection.readiness.status === "ready"
              ? "Ready"
              : projection.readiness.status === "blocked"
                ? "Blocked"
                : "Attention"}
          </V3StatusChip>
        }
      >
        <V3Surface level="raised" className="p-5">
          <p className="text-sm font-semibold">{projection.readiness.label}</p>
          <div className="mt-4">
            <V3Progress value={projection.readiness.progress} label="Edition readiness" />
          </div>
        </V3Surface>
      </V3Section>

      <V3Section
        title="Do now"
        meta={
          projection.remainingTaskCount
            ? `+${projection.remainingTaskCount} more`
            : projection.doNow.length
              ? `${projection.doNow.length} active`
              : "Clear"
        }
      >
        {projection.doNow.length ? (
          <div className="grid gap-3">
            {projection.doNow.map((task) => (
              <V3ActionCard
                key={task.id}
                title={task.title}
                description={taskDescription(task)}
                meta={<span>{task.domain}</span>}
                icon={task.state === "blocked" ? AlertTriangle : undefined}
                tone={taskTone(task)}
                to={task.href}
              />
            ))}
          </div>
        ) : (
          <V3Surface className="p-4">
            <p className="text-sm font-semibold">No operational exceptions</p>
            <p className="mt-1 text-xs leading-5 text-white/48">
              New canonical tasks will appear here when Organizer action is required.
            </p>
          </V3Surface>
        )}
      </V3Section>

      <V3Section title="Inbox" meta={inboxMeta}>
        {projection.inbox.length ? (
          <div className="grid gap-3">
            {projection.inbox.map((item) =>
              item.href ? (
                <V3ActionCard
                  key={item.id}
                  title={item.title}
                  description={item.detail ?? "Organizer communication requiring attention"}
                  icon={Bell}
                  tone="neutral"
                  to={item.href}
                  meta={item.unread ? <V3StatusChip>Unread</V3StatusChip> : undefined}
                />
              ) : (
                <V3Surface key={item.id} className="p-4">
                  <div className="flex items-start gap-3">
                    <Bell className="mt-0.5 size-4 shrink-0 text-white/45" aria-hidden="true" />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{item.title}</p>
                      {item.detail ? (
                        <p className="mt-1 text-xs leading-5 text-white/48">{item.detail}</p>
                      ) : null}
                    </div>
                  </div>
                </V3Surface>
              ),
            )}
          </div>
        ) : (
          <V3Surface className="p-4">
            <p className="text-sm font-semibold">Nothing needs action in Inbox</p>
          </V3Surface>
        )}
      </V3Section>

      {projection.upcoming ? (
        <V3Section title="Upcoming">
          {projection.upcoming.href ? (
            <V3ActionCard
              title={projection.upcoming.label}
              description={projection.upcoming.detail}
              icon={CalendarDays}
              tone="neutral"
              to={projection.upcoming.href}
            />
          ) : (
            <V3Surface className="p-4">
              <p className="text-sm font-semibold">{projection.upcoming.label}</p>
              <p className="mt-1 text-xs leading-5 text-white/48">{projection.upcoming.detail}</p>
            </V3Surface>
          )}
        </V3Section>
      ) : null}

      {projection.live ? (
        <V3Section title="Live" meta={<V3StatusChip tone="live">Available</V3StatusChip>}>
          {projection.live.route ? (
            <V3ActionCard
              title={projection.live.label}
              description={projection.live.detail}
              icon={Radio}
              tone="neutral"
              to={projection.live.route}
            />
          ) : (
            <V3Surface className="p-4">
              <p className="text-sm font-semibold">{projection.live.label}</p>
              <p className="mt-1 text-xs leading-5 text-white/48">{projection.live.detail}</p>
            </V3Surface>
          )}
        </V3Section>
      ) : null}
    </V3Screen>
  );
}
