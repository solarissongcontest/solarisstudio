import type { PublicCapabilityMigration } from "./public-capability-registry";

export type PublicNotificationSignal = {
  signal: string;
  capabilityId: PublicCapabilityMigration["id"];
  purpose: string;
};

/**
 * Notification categories and scheduled kinds are product entry points too:
 * they can deep-link a user into a workflow, so they must not evolve outside
 * the Public V3 capability inventory.
 */
export const PUBLIC_V3_NOTIFICATION_SIGNALS: readonly PublicNotificationSignal[] = [
  { signal: "category:confirmations", capabilityId: "participant-confirmation", purpose: "Confirmation workflow reminders" },
  { signal: "category:jury", capabilityId: "participant-jury", purpose: "Jury workflow reminders" },
  { signal: "category:televoting", capabilityId: "participant-televote", purpose: "Televote workflow reminders" },
  { signal: "category:deadlines", capabilityId: "public-notifications", purpose: "Generic canonical task deadlines" },
  { signal: "category:official", capabilityId: "public-notifications", purpose: "Official participant communications" },
  { signal: "category:results", capabilityId: "public-results", purpose: "Published result notifications" },
  { signal: "category:following", capabilityId: "public-notifications", purpose: "User-owned following updates" },
  { signal: "category:predictions", capabilityId: "public-predictions", purpose: "Prediction lifecycle updates" },
  { signal: "kind:opens_soon", capabilityId: "public-notifications", purpose: "Upcoming workflow opening" },
  { signal: "kind:opened", capabilityId: "public-notifications", purpose: "Workflow opened" },
  { signal: "kind:deadline_3d", capabilityId: "public-notifications", purpose: "Three-day deadline reminder" },
  { signal: "kind:deadline_24h", capabilityId: "public-notifications", purpose: "24-hour deadline reminder" },
  { signal: "kind:deadline_3h", capabilityId: "public-notifications", purpose: "Three-hour deadline reminder" },
  { signal: "kind:deadline_1h", capabilityId: "public-notifications", purpose: "One-hour deadline reminder" },
] as const;
