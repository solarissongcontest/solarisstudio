import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { AlertTriangle, Inbox, UserRound } from "lucide-react";

import { useMyCountryAccount } from "@/lib/country-account";
import {
  acknowledgeStudio2InboxNotice,
  archiveStudio2Notice,
  markStudio2NoticeOpened,
} from "@/lib/studio2-communications";
import { isStudio2FeatureEnabled } from "@/lib/studio2-feature-flags";
import { loadStudio2RecipientNoticeInbox } from "@/lib/studio2-recipient-inbox";
import { parseV3OfficialNoticeFilter } from "@/lib/v3-official-notices";
import { V3AppShell } from "./V3AppShell";
import {
  V3Screen,
  V3ScreenHeader,
  V3Surface,
} from "./V3Foundation";
import { V3OfficialNoticesScreen } from "./V3OfficialNoticesScreen";

export type V3OfficialNoticesRouteContentProps = {
  userId: string;
  editionId: string | null;
};

type RouteSearch = {
  notice?: unknown;
  state?: unknown;
};

export function V3OfficialNoticesRouteContent({
  userId,
  editionId,
}: V3OfficialNoticesRouteContentProps) {
  const account = useMyCountryAccount();
  const access = account.data?.access;
  const country = account.data?.country;

  if (account.isLoading) {
    return (
      <V3AppShell editionLabel="Solaris Studio" phaseLabel="Official notices" activeArea="me">
        <V3Screen>
          <V3ScreenHeader kicker="Me · Official notices" title="Delegation notices" />
          <V3Surface>
            <p className="text-sm text-[var(--v3-text-secondary)]" role="status" aria-live="polite">
              Loading delegation access…
            </p>
          </V3Surface>
        </V3Screen>
      </V3AppShell>
    );
  }

  if (!access?.userId || access.userId !== userId) {
    return (
      <OfficialNoticesBoundaryState
        title="Delegation access changed"
        description="Solaris could not bind this notice inbox to the currently authenticated account. Reload the current session before continuing."
      />
    );
  }

  if (!country) {
    return (
      <OfficialNoticesBoundaryState
        title="No delegation account"
        description="Official delegation notices become available when this account has an active country context."
      />
    );
  }

  if (access.countryStatus !== "active") {
    return (
      <OfficialNoticesBoundaryState
        title={`${country.name} is suspended`}
        description="Official delegation notice actions are unavailable while this country account is suspended."
      />
    );
  }

  return (
    <V3OfficialNoticesBoundInbox
      userId={userId}
      editionId={editionId}
      countryName={country.name}
    />
  );
}

function V3OfficialNoticesBoundInbox({
  userId,
  editionId,
  countryName,
}: {
  userId: string;
  editionId: string | null;
  countryName: string;
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const locationSearch = useRouterState({ select: (state) => state.location.search }) as RouteSearch;
  const selectedId =
    typeof locationSearch.notice === "string" && locationSearch.notice
      ? locationSearch.notice
      : undefined;
  const filter = parseV3OfficialNoticeFilter(locationSearch.state);

  const feature = useQuery({
    queryKey: ["studio2-feature", "official_communications", editionId ?? "current"],
    queryFn: () => isStudio2FeatureEnabled("official_communications", editionId),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    retry: false,
  });

  const inbox = useQuery({
    queryKey: ["v3-delegation-notices", userId, editionId ?? "current"],
    enabled: feature.data === true,
    queryFn: () => loadStudio2RecipientNoticeInbox(editionId),
    staleTime: 20_000,
    refetchOnWindowFocus: true,
    retry: false,
  });

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: ["v3-delegation-notices", userId, editionId ?? "current"],
      }),
      queryClient.invalidateQueries({
        queryKey: ["v3-notifications-inbox", userId, editionId ?? "current"],
      }),
      queryClient.invalidateQueries({ queryKey: ["studio2-hod-notice-inbox"] }),
    ]);
  };

  const markOpened = useMutation({
    mutationFn: (noticeId: string) => markStudio2NoticeOpened(noticeId),
    onSuccess: () => refresh(),
    onError: () => refresh(),
  });

  const acknowledge = useMutation({
    mutationFn: (noticeId: string) => acknowledgeStudio2InboxNotice(noticeId),
    onSuccess: () => refresh(),
    onError: () => refresh(),
  });

  const archive = useMutation({
    mutationFn: ({ noticeId, archived }: { noticeId: string; archived: boolean }) =>
      archiveStudio2Notice(noticeId, archived),
    onSuccess: () => refresh(),
    onError: () => refresh(),
  });

  const items = inbox.data ?? [];
  const selected = selectedId
    ? items.find((item) => item.notice.id === selectedId) ?? null
    : null;
  const acknowledgementUnresolved =
    acknowledge.isError && !selected?.receipt?.acknowledgedAt;
  const archiveUnresolved =
    archive.isError &&
    (!selected ||
      (archive.variables?.archived === true && !selected.receipt?.archivedAt) ||
      (archive.variables?.archived === false && Boolean(selected.receipt?.archivedAt)));
  const markOpenedUnresolved =
    markOpened.isError && !selected?.receipt?.openedAt;
  const mutationError =
    acknowledgementUnresolved || archiveUnresolved || markOpenedUnresolved;
  const busy = markOpened.isPending || acknowledge.isPending || archive.isPending;

  const selectNotice = (noticeId: string) => {
    const item = items.find((candidate) => candidate.notice.id === noticeId);
    void navigate({
      to: "/my-solaris/notices",
      search: {
        ...(filter ? { state: filter } : {}),
        notice: noticeId,
      },
      replace: true,
    });

    if (item && !item.receipt?.openedAt && !markOpened.isPending) {
      markOpened.mutate(noticeId);
    }
  };

  const selectFilter = (state?: typeof filter) => {
    void navigate({
      to: "/my-solaris/notices",
      search: {
        ...(selectedId ? { notice: selectedId } : {}),
        ...(state ? { state } : {}),
      },
      replace: true,
    });
  };

  return (
    <V3AppShell editionLabel={countryName} phaseLabel="Official notices" activeArea="me">
      <V3OfficialNoticesScreen
        countryName={countryName}
        items={items}
        selectedId={selectedId}
        filter={filter}
        loading={feature.isLoading || (feature.data === true && inbox.isLoading)}
        unavailable={
          !feature.isLoading && !feature.isError && feature.data !== true
        }
        loadError={feature.isError || inbox.isError}
        busy={busy}
        mutationError={mutationError}
        onSelect={selectNotice}
        onFilter={selectFilter}
        onAcknowledge={(noticeId) => acknowledge.mutate(noticeId)}
        onArchive={(noticeId, archived) => archive.mutate({ noticeId, archived })}
      />
    </V3AppShell>
  );
}

function OfficialNoticesBoundaryState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <V3AppShell editionLabel="Solaris Studio" phaseLabel="Official notices" activeArea="me">
      <V3Screen>
        <V3ScreenHeader kicker="Me · Official notices" title={title} description={description} />
        <V3Surface>
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-[var(--v3-text-secondary)]" aria-hidden="true" />
            <div>
              <p className="text-sm font-semibold">No notice action is available from this state.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link
                  to="/me"
                  className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[var(--v3-border-subtle)] px-3 text-xs font-semibold"
                >
                  <UserRound className="size-4" aria-hidden="true" /> Me
                </Link>
                <Link
                  to="/notifications"
                  className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[var(--v3-border-subtle)] px-3 text-xs font-semibold"
                >
                  <Inbox className="size-4" aria-hidden="true" /> Notifications
                </Link>
              </div>
            </div>
          </div>
        </V3Surface>
      </V3Screen>
    </V3AppShell>
  );
}
