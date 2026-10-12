import type { V3ActionProjection, V3DeliveryClass, V3Urgency } from "./v3-experience";

export type V3NotificationChannel =
  | "home"
  | "participate"
  | "badge"
  | "in_app"
  | "push"
  | "organizer_inbox"
  | "email";

export type V3NotificationPreference = {
  enabled: boolean;
  pushEnabled: boolean;
  emailEnabled: boolean;
  quietHoursStart?: string | null;
  quietHoursEnd?: string | null;
  urgentDeadlineReminders?: boolean;
};

export type V3NotificationContext = {
  recipientId: string;
  serverNow: string;
  recipientTimeZoneOffsetMinutes?: number;
  organizer?: boolean;
};

export type V3NotificationDelivery = {
  actionId: string;
  channel: V3NotificationChannel;
  deliveryClass: V3DeliveryClass;
  urgency: V3Urgency;
  deliver: boolean;
  deferred: boolean;
  reason:
    | "required_surface"
    | "push_allowed"
    | "quiet_hours"
    | "push_disabled"
    | "email_disabled"
    | "preference_disabled"
    | "not_actionable"
    | "low_value_channel"
    | "organizer_only";
  dedupeKey: string;
  title: string;
  body: string;
  route: string;
  why: string;
};

export type V3NotificationPlan = {
  actionId: string;
  dedupeGroup: string;
  channels: readonly V3NotificationDelivery[];
};

function parseClock(value?: string | null) {
  if (!value) return null;
  const match = /^(\d{2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return null;
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) return null;
  return hour * 60 + minute;
}

export function isV3QuietHours(
  serverNow: string,
  start?: string | null,
  end?: string | null,
  offsetMinutes = 0,
) {
  const startMinutes = parseClock(start);
  const endMinutes = parseClock(end);
  if (startMinutes == null || endMinutes == null || startMinutes === endMinutes) return false;

  const timestamp = Date.parse(serverNow);
  if (!Number.isFinite(timestamp)) throw new Error("V3 notification policy requires a valid serverNow timestamp.");

  const local = new Date(timestamp + offsetMinutes * 60_000);
  const nowMinutes = local.getUTCHours() * 60 + local.getUTCMinutes();

  return startMinutes < endMinutes
    ? nowMinutes >= startMinutes && nowMinutes < endMinutes
    : nowMinutes >= startMinutes || nowMinutes < endMinutes;
}

function highEnoughToInterrupt(action: V3ActionProjection, preferences: V3NotificationPreference) {
  if (!action.actionRequired || action.completed) return false;
  if (action.urgency === "immediate" || action.urgency === "high") return true;
  if (action.urgency === "medium" && preferences.urgentDeadlineReminders) return true;
  return action.impact === "blocking" && action.deliveryClass === "required";
}

function copyFor(action: V3ActionProjection) {
  const title =
    action.urgency === "immediate"
      ? `${action.title} needs attention now`
      : action.urgency === "high"
        ? `${action.title} needs attention soon`
        : action.title;

  return {
    title,
    body: action.description,
    why: action.why || "Solaris is surfacing this because it is relevant to your current participation.",
  };
}

function delivery(
  action: V3ActionProjection,
  context: V3NotificationContext,
  channel: V3NotificationChannel,
  deliver: boolean,
  reason: V3NotificationDelivery["reason"],
  deferred = false,
): V3NotificationDelivery {
  const copy = copyFor(action);
  return {
    actionId: action.id,
    channel,
    deliveryClass: action.deliveryClass,
    urgency: action.urgency,
    deliver,
    deferred,
    reason,
    dedupeKey: ["v3-action", action.id, context.recipientId, channel, action.deadline ?? "no-deadline"].join(":"),
    title: copy.title,
    body: copy.body,
    route: action.route,
    why: copy.why,
  };
}

/**
 * Produces delivery intent from one canonical V3 action. This does not send
 * anything and does not own notification history. Existing delivery systems
 * can consume the plan while keeping preferences, dedupe history and actual
 * transport server-authoritative.
 */
export function projectV3NotificationPlan(
  action: V3ActionProjection,
  preferences: V3NotificationPreference,
  context: V3NotificationContext,
): V3NotificationPlan {
  const active = action.actionRequired && !action.completed;
  const quiet = isV3QuietHours(
    context.serverNow,
    preferences.quietHoursStart,
    preferences.quietHoursEnd,
    context.recipientTimeZoneOffsetMinutes ?? 0,
  );
  const interrupt = highEnoughToInterrupt(action, preferences);

  const channels: V3NotificationDelivery[] = [
    delivery(action, context, "home", active, active ? "required_surface" : "not_actionable"),
    delivery(action, context, "participate", true, "required_surface"),
    delivery(action, context, "badge", active, active ? "required_surface" : "not_actionable"),
    delivery(
      action,
      context,
      "in_app",
      preferences.enabled && (active || action.deliveryClass !== "optional"),
      !preferences.enabled ? "preference_disabled" : active || action.deliveryClass !== "optional" ? "required_surface" : "low_value_channel",
    ),
  ];

  if (!preferences.enabled) {
    channels.push(delivery(action, context, "push", false, "preference_disabled"));
    channels.push(delivery(action, context, "email", false, "preference_disabled"));
  } else {
    const pushEligible = preferences.pushEnabled && interrupt;
    channels.push(
      delivery(
        action,
        context,
        "push",
        pushEligible && !quiet,
        !preferences.pushEnabled
          ? "push_disabled"
          : !interrupt
            ? "low_value_channel"
            : quiet
              ? "quiet_hours"
              : "push_allowed",
        pushEligible && quiet,
      ),
    );

    const emailEligible = preferences.emailEnabled && action.deliveryClass === "required" && action.impact === "blocking";
    channels.push(
      delivery(
        action,
        context,
        "email",
        emailEligible,
        preferences.emailEnabled ? (emailEligible ? "required_surface" : "low_value_channel") : "email_disabled",
      ),
    );
  }

  channels.push(
    delivery(
      action,
      context,
      "organizer_inbox",
      Boolean(context.organizer && action.impact === "blocking"),
      context.organizer ? (action.impact === "blocking" ? "required_surface" : "low_value_channel") : "organizer_only",
    ),
  );

  return {
    actionId: action.id,
    dedupeGroup: ["v3-action", action.id, context.recipientId, action.deadline ?? "no-deadline"].join(":"),
    channels,
  };
}
