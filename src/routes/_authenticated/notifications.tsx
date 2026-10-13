import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Navigate } from "@tanstack/react-router";

import { useSolarisApp } from "@/components/app/AppRuntime";
import {
  V3NotificationsScreen,
  type V3NotificationInboxItem,
} from "@/components/v3/V3NotificationsScreen";
import { V3AppShell } from "@/components/v3/V3AppShell";
import {
  describeAppPushDelivery,
  getAppPushState,
  type AppPushState,
} from "@/lib/app-notifications";
import {
  DEFAULT_SOLARIS_NOTIFICATION_CATEGORIES,
  useNotificationPreferences,
} from "@/lib/engagement-data";
import { noticeTypeLabel } from "@/lib/official-communications";
import { loadStudio2RecipientNoticeInbox } from "@/lib/studio2-recipient-inbox";
import { useV3RolloutProbe } from "@/lib/v3-primary-runtime";

export const Route = createFileRoute("/_authenticated/notifications")({
  head: () => ({
    meta: [
      { title: "Notifications — Solaris Studio" },
      {
        name: "description",
        content: "Solaris Studio notification attention, official messages and delivery status.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: NotificationsRoute,
});

const EMPTY_PUSH: AppPushState = {
  supported: false,
  configured: false,
  permission: "unsupported",
  subscribed: false,
};

function NotificationsRoute() {
  const { isAppMode, platformResolved } = useSolarisApp();
  const rollout = useV3RolloutProbe(platformResolved && isAppMode);

  if (!platformResolved || (isAppMode && rollout.isLoading)) {
    return (
      <main
        className="relative z-10 mx-auto w-full max-w-3xl px-4 py-10 sm:py-14"
        data-v3-notifications-route-boot=""
      >
        <header className="border-b border-border/70 pb-5">
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-primary">Me</p>
          <h1 className="mt-2 font-display text-3xl font-black tracking-[-0.04em] sm:text-5xl">
            Notifications
          </h1>
        </header>
        <p className="sr-only" role="status" aria-live="polite">
          Checking the current notifications experience.
        </p>
      </main>
    );
  }

  if (
    !isAppMode ||
    rollout.isError ||
    rollout.data?.notificationsEnabled !== true ||
    !rollout.data.userId
  ) {
    return <Navigate to="/settings" replace />;
  }

  return (
    <V3NotificationsRouteContent
      userId={rollout.data.userId}
      editionId={rollout.data.editionId}
    />
  );
}

function V3NotificationsRouteContent({
  userId,
  editionId,
}: {
  userId: string;
  editionId: string | null;
}) {
  const preferences = useNotificationPreferences(userId);
  const push = useQuery({
    queryKey: ["solaris-app-push-state", userId],
    queryFn: getAppPushState,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    retry: false,
  });
  const inbox = useQuery({
    queryKey: ["v3-notifications-inbox", userId, editionId ?? "current"],
    queryFn: () => loadStudio2RecipientNoticeInbox(editionId),
    staleTime: 20_000,
    refetchOnWindowFocus: true,
    retry: false,
  });

  const preferenceRow = preferences.data;
  const categories = preferenceRow?.categories?.length
    ? preferenceRow.categories
    : [...DEFAULT_SOLARIS_NOTIFICATION_CATEGORIES];
  const quietStart = (preferenceRow?.quiet_hours_start ?? "23:00").slice(0, 5);
  const quietEnd = (preferenceRow?.quiet_hours_end ?? "08:00").slice(0, 5);
  const deliveryStatus = describeAppPushDelivery(push.data ?? EMPTY_PUSH);
  const inboxItems: V3NotificationInboxItem[] = (inbox.data ?? []).map((item) => ({
    id: item.notice.id,
    title: item.notice.title,
    sentAt: item.notice.sentAt,
    typeLabel: noticeTypeLabel(item.notice.noticeType),
    severity:
      item.notice.severity === "critical"
        ? "critical"
        : item.notice.severity === "urgent" || item.notice.severity === "action_required"
          ? "important"
          : "info",
    state: item.inboxState,
    acknowledgementRequired: item.notice.acknowledgementRequired,
  }));

  return (
    <V3AppShell editionLabel="Solaris Studio" phaseLabel="Notifications" activeArea="me">
      <V3NotificationsScreen
        deliveryStatus={deliveryStatus}
        enabledCategoryCount={categories.length}
        quietHoursLabel={`${quietStart}–${quietEnd}`}
        urgentDeadlineReminders={preferenceRow?.urgent_deadline_reminders ?? true}
        preferencesUnavailable={preferences.isError}
        inboxUnavailable={inbox.isError}
        inboxItems={inboxItems}
      />
    </V3AppShell>
  );
}
