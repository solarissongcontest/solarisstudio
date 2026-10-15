import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";

import { useSolarisApp } from "@/components/app/AppRuntime";
import { V3AppShell } from "@/components/v3/V3AppShell";
import {
  V3NotificationsScreen,
  type V3NotificationInboxItem,
} from "@/components/v3/V3NotificationsScreen";
import { V3OfficialNoticeDetail } from "@/components/v3/V3OfficialNoticeDetail";
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
import {
  acknowledgeStudio2InboxNotice,
  archiveStudio2Notice,
  markStudio2NoticeOpened,
} from "@/lib/studio2-communications";
import { loadStudio2RecipientNoticeInbox } from "@/lib/studio2-recipient-inbox";
import { useV3RolloutProbe } from "@/lib/v3-primary-runtime";

export const Route = createFileRoute("/_authenticated/notifications")({
  validateSearch: (search: Record<string, unknown>) => ({
    notice:
      typeof search.notice === "string" && search.notice.trim()
        ? search.notice.trim()
        : undefined,
  }),
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
  const { notice } = Route.useSearch();
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
      noticeId={notice}
    />
  );
}

function V3NotificationsRouteContent({
  userId,
  editionId,
  noticeId,
}: {
  userId: string;
  editionId: string | null;
  noticeId?: string;
}) {
  const queryClient = useQueryClient();
  const openedNoticeIds = useRef(new Set<string>());
  const preferences = useNotificationPreferences(userId);
  const push = useQuery({
    queryKey: ["solaris-app-push-state", userId],
    queryFn: getAppPushState,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    retry: false,
  });
  const inboxKey = ["v3-notifications-inbox", userId, editionId ?? "current"] as const;
  const inbox = useQuery({
    queryKey: inboxKey,
    queryFn: () => loadStudio2RecipientNoticeInbox(editionId),
    staleTime: 20_000,
    refetchOnWindowFocus: true,
    retry: false,
  });

  const refreshInbox = async () => {
    await queryClient.invalidateQueries({ queryKey: inboxKey });
  };
  const markOpened = useMutation({
    mutationFn: (id: string) => markStudio2NoticeOpened(id),
    onSuccess: refreshInbox,
  });
  const acknowledge = useMutation({
    mutationFn: (id: string) => acknowledgeStudio2InboxNotice(id),
    onSuccess: refreshInbox,
  });
  const archive = useMutation({
    mutationFn: ({ id, archived }: { id: string; archived: boolean }) =>
      archiveStudio2Notice(id, archived),
    onSuccess: refreshInbox,
  });

  const selected = noticeId
    ? (inbox.data ?? []).find((item) => item.notice.id === noticeId) ?? null
    : null;

  useEffect(() => {
    if (!noticeId || !selected) return;
    if (selected.inboxState === "read" || selected.inboxState === "acknowledged") return;
    if (openedNoticeIds.current.has(noticeId)) return;

    openedNoticeIds.current.add(noticeId);
    markOpened.mutate(noticeId, {
      onError: () => openedNoticeIds.current.delete(noticeId),
    });
    // markOpened is intentionally omitted: the mutation object is recreated by
    // React Query, while notice identity/state are the authoritative triggers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noticeId, selected?.inboxState]);

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

  const detailState = inbox.isLoading
    ? "loading"
    : inbox.isError
      ? "error"
      : selected
        ? "ready"
        : "missing";

  return (
    <V3AppShell editionLabel="Solaris Studio" phaseLabel="Notifications" activeArea="me">
      {noticeId ? (
        <V3OfficialNoticeDetail
          item={selected}
          state={detailState}
          busy={markOpened.isPending || acknowledge.isPending || archive.isPending}
          mutationError={markOpened.error || acknowledge.error || archive.error}
          onAcknowledge={() => {
            if (selected) acknowledge.mutate(selected.notice.id);
          }}
          onArchive={(archived) => {
            if (selected) archive.mutate({ id: selected.notice.id, archived });
          }}
        />
      ) : (
        <V3NotificationsScreen
          deliveryStatus={deliveryStatus}
          enabledCategoryCount={categories.length}
          quietHoursLabel={`${quietStart}–${quietEnd}`}
          urgentDeadlineReminders={preferenceRow?.urgent_deadline_reminders ?? true}
          preferencesUnavailable={preferences.isError}
          inboxUnavailable={inbox.isError}
          inboxItems={inboxItems}
        />
      )}
    </V3AppShell>
  );
}
