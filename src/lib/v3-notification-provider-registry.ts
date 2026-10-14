export type V3NotificationDeliveryClass = "required" | "recommended" | "optional";

export type V3NotificationCategory = {
  category: string;
  ownerDomain: string;
  deliveryClass: V3NotificationDeliveryClass;
  preferenceControlled: boolean;
  defaultRoute: string;
};

export type V3NotificationProvider = {
  id: string;
  ownerDomain: string;
  categories: readonly string[];
  eventTypes: readonly string[];
  eventSource: string;
  deliveryClass: V3NotificationDeliveryClass;
  actionRequired: boolean;
  routes: readonly string[];
  sourceFiles: readonly string[];
};

/**
 * Categories exposed to participant/fan notification preferences plus the
 * Organizer-only required delivery class. Adding a delivery category without
 * updating this registry is a capability change and must fail registry review.
 */
export const V3_NOTIFICATION_CATEGORY_REGISTRY = [
  { category: "entries", ownerDomain: "entry", deliveryClass: "optional", preferenceControlled: true, defaultRoute: "/explore" },
  { category: "running_orders", ownerDomain: "live-show", deliveryClass: "optional", preferenceControlled: true, defaultRoute: "/explore" },
  { category: "predictions", ownerDomain: "prediction", deliveryClass: "optional", preferenceControlled: true, defaultRoute: "/predictions" },
  { category: "results", ownerDomain: "results", deliveryClass: "optional", preferenceControlled: true, defaultRoute: "/results" },
  { category: "records", ownerDomain: "results", deliveryClass: "optional", preferenceControlled: true, defaultRoute: "/records" },
  { category: "confirmations", ownerDomain: "confirmation", deliveryClass: "required", preferenceControlled: true, defaultRoute: "/confirmations" },
  { category: "jury", ownerDomain: "jury", deliveryClass: "required", preferenceControlled: true, defaultRoute: "/jury-voting" },
  { category: "televoting", ownerDomain: "televote", deliveryClass: "optional", preferenceControlled: true, defaultRoute: "/televoting" },
  { category: "deadlines", ownerDomain: "task", deliveryClass: "required", preferenceControlled: true, defaultRoute: "/participate" },
  { category: "official", ownerDomain: "notice", deliveryClass: "required", preferenceControlled: true, defaultRoute: "/my-solaris/notices" },
  { category: "following", ownerDomain: "personal-preference", deliveryClass: "optional", preferenceControlled: true, defaultRoute: "/explore" },
  { category: "organizer_tasks", ownerDomain: "task", deliveryClass: "required", preferenceControlled: false, defaultRoute: "/admin/tasks" },
] as const satisfies readonly V3NotificationCategory[];

/**
 * Server-authoritative notification producers. The provider owns candidate
 * generation; `notification_deliveries` owns dedupe/delivery history and the
 * push worker owns transport. Dynamic follower events explicitly reuse the
 * canonical `content_events.event_type` instead of inventing another taxonomy.
 */
export const V3_NOTIFICATION_PROVIDER_REGISTRY = [
  {
    id: "confirmation-window-and-deadlines",
    ownerDomain: "confirmation",
    categories: ["confirmations", "deadlines"],
    eventTypes: [
      "confirmation.opens_soon",
      "confirmation.opened",
      "confirmation.deadline_3d",
      "confirmation.deadline_24h",
      "confirmation.deadline_3h",
      "confirmation.deadline_1h",
    ],
    eventSource: "submission_rounds + missing country submission state",
    deliveryClass: "required",
    actionRequired: true,
    routes: ["/confirmations"],
    sourceFiles: ["supabase/migrations/20260929214500_solaris_app_push_foundation.sql"],
  },
  {
    id: "confirmation-review",
    ownerDomain: "confirmation",
    categories: ["confirmations"],
    eventTypes: ["confirmation.reviewed"],
    eventSource: "submission_review_history",
    deliveryClass: "required",
    actionRequired: true,
    routes: ["/confirmations"],
    sourceFiles: ["supabase/migrations/20260929214500_solaris_app_push_foundation.sql"],
  },
  {
    id: "jury-open",
    ownerDomain: "jury",
    categories: ["jury"],
    eventTypes: ["jury.opened"],
    eventSource: "jury_voting_windows + authoritative ballot state",
    deliveryClass: "required",
    actionRequired: true,
    routes: ["/jury-voting"],
    sourceFiles: ["supabase/migrations/20260929214500_solaris_app_push_foundation.sql"],
  },
  {
    id: "televote-open",
    ownerDomain: "televote",
    categories: ["televoting"],
    eventTypes: ["televote.opened"],
    eventSource: "televoting.rounds",
    deliveryClass: "optional",
    actionRequired: false,
    routes: ["/televoting"],
    sourceFiles: ["supabase/migrations/20260929214500_solaris_app_push_foundation.sql"],
  },
  {
    id: "official-communications",
    ownerDomain: "notice",
    categories: ["official"],
    eventTypes: ["official.notice", "official.acknowledgement_required"],
    eventSource: "studio2_official_notices + studio2_notice_receipts",
    deliveryClass: "required",
    actionRequired: true,
    routes: ["/my-solaris/notices"],
    sourceFiles: ["supabase/migrations/20260929214500_solaris_app_push_foundation.sql"],
  },
  {
    id: "prediction-pulse",
    ownerDomain: "prediction",
    categories: ["predictions"],
    eventTypes: ["prediction_opened", "prediction_locked"],
    eventSource: "content_events",
    deliveryClass: "optional",
    actionRequired: false,
    routes: ["/predictions", "/prediction-league"],
    sourceFiles: ["supabase/migrations/20260929214500_solaris_app_push_foundation.sql"],
  },
  {
    id: "followed-entity-pulse",
    ownerDomain: "personal-preference",
    categories: ["following"],
    eventTypes: ["content_events.*"],
    eventSource: "content_events filtered by fan_follows notification_level",
    deliveryClass: "optional",
    actionRequired: false,
    routes: ["dynamic:content_events.route"],
    sourceFiles: ["supabase/migrations/20260929214500_solaris_app_push_foundation.sql"],
  },
  {
    id: "published-results",
    ownerDomain: "results",
    categories: ["results"],
    eventTypes: ["results.published"],
    eventSource: "content_events:results_published",
    deliveryClass: "optional",
    actionRequired: false,
    routes: ["dynamic:content_events.route"],
    sourceFiles: ["supabase/migrations/20260929214500_solaris_app_push_foundation.sql"],
  },
  {
    id: "organizer-task-activation",
    ownerDomain: "task",
    categories: ["organizer_tasks"],
    eventTypes: ["organizer_task.high", "organizer_task.critical"],
    eventSource: "studio2_organizer_tasks activation version",
    deliveryClass: "required",
    actionRequired: true,
    routes: ["dynamic:studio2_organizer_tasks.href"],
    sourceFiles: [
      "supabase/migrations/20261003003000_organisation_os_v5_task_notifications.sql",
      "supabase/migrations/20261005043000_pr450_review_blocker_repairs.sql",
    ],
  },
] as const satisfies readonly V3NotificationProvider[];
