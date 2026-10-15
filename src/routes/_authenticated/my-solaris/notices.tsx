import { createFileRoute, Navigate } from "@tanstack/react-router";

import { useSolarisApp } from "@/components/app/AppRuntime";
import {
  MySolarisNoticesModule,
  type NoticesSearch,
} from "@/components/mysolaris/modules/MySolarisNoticesModule";
import { OrganizerPublicNoticesModule } from "@/components/mysolaris/modules/OrganizerPublicNoticesModule";
import { OrganizerRecipientNoticesModule } from "@/components/mysolaris/modules/OrganizerRecipientNoticesModule";
import { useMyCountryAccount } from "@/lib/country-account";
import type { NoticeInboxState } from "@/lib/official-communications";
import { useV3RolloutProbe } from "@/lib/v3-primary-runtime";

const INBOX_STATES = new Set([
  "unread",
  "read",
  "acknowledgement_required",
  "acknowledged",
  "archived",
]);

export const Route = createFileRoute("/_authenticated/my-solaris/notices")({
  validateSearch: (search: Record<string, unknown>): NoticesSearch => ({
    notice: typeof search.notice === "string" && search.notice ? search.notice : undefined,
    state:
      typeof search.state === "string" && INBOX_STATES.has(search.state)
        ? (search.state as NoticeInboxState)
        : undefined,
  }),
  head: () => ({
    meta: [{ title: "MySolaris notices — Solaris Studio" }, { name: "robots", content: "noindex" }],
  }),
  component: NoticesRoute,
});

function NoticesRoute() {
  const search = Route.useSearch();
  const { isAppMode, platformResolved } = useSolarisApp();
  const rollout = useV3RolloutProbe(platformResolved && isAppMode);
  const account = useMyCountryAccount();
  const access = account.data?.access;

  if (isAppMode && (!platformResolved || rollout.isLoading || account.isLoading)) {
    return (
      <p className="px-4 py-10 text-sm text-muted-foreground" role="status" aria-live="polite">
        Opening official notices…
      </p>
    );
  }

  if (
    isAppMode &&
    !rollout.isError &&
    rollout.data?.notificationsEnabled === true &&
    access?.isOrganizer !== true
  ) {
    return (
      <Navigate
        to="/notifications"
        search={search.notice ? { notice: search.notice } : {}}
        replace
      />
    );
  }

  if (access?.isOrganizer && access.countryId && access.countryStatus === "active") {
    return <OrganizerRecipientNoticesModule />;
  }

  if (access?.isOrganizer) {
    return <OrganizerPublicNoticesModule />;
  }

  return <MySolarisNoticesModule />;
}
