import { createFileRoute } from "@tanstack/react-router";

import { useSolarisApp } from "@/components/app/AppRuntime";
import {
  MySolarisNoticesModule,
  type NoticesSearch,
} from "@/components/mysolaris/modules/MySolarisNoticesModule";
import { OrganizerPublicNoticesModule } from "@/components/mysolaris/modules/OrganizerPublicNoticesModule";
import { OrganizerRecipientNoticesModule } from "@/components/mysolaris/modules/OrganizerRecipientNoticesModule";
import { V3OfficialNoticesRouteContent } from "@/components/v3/V3OfficialNoticesRouteContent";
import { useMyCountryAccount } from "@/lib/country-account";
import { parseV3OfficialNoticeFilter } from "@/lib/v3-official-notices";
import { useV3RolloutProbe } from "@/lib/v3-primary-runtime";

export const Route = createFileRoute("/_authenticated/my-solaris/notices")({
  validateSearch: (search: Record<string, unknown>): NoticesSearch => ({
    notice: typeof search.notice === "string" && search.notice ? search.notice : undefined,
    state: parseV3OfficialNoticeFilter(search.state),
  }),
  head: () => ({
    meta: [
      { title: "Official notices — Solaris Studio" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: NoticesRoute,
});

function NoticesRoute() {
  const account = useMyCountryAccount();
  const access = account.data?.access;
  const { isAppMode, platformResolved } = useSolarisApp();
  const rollout = useV3RolloutProbe(platformResolved && isAppMode);

  if (access?.isOrganizer && access.countryId && access.countryStatus === "active") {
    return <OrganizerRecipientNoticesModule />;
  }

  if (access?.isOrganizer) {
    return <OrganizerPublicNoticesModule />;
  }

  if (!platformResolved || (isAppMode && rollout.isLoading && !rollout.data)) {
    return (
      <main
        className="relative z-10 mx-auto w-full max-w-3xl px-4 py-10 sm:py-14"
        data-v3-official-notices-route-boot=""
      >
        <header className="border-b border-border/70 pb-5">
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-primary">
            Me · Official notices
          </p>
          <h1 className="mt-2 font-display text-3xl font-black tracking-[-0.04em] sm:text-5xl">
            Delegation notices
          </h1>
        </header>
        <p className="sr-only" role="status" aria-live="polite">
          Checking the current official-notice experience.
        </p>
      </main>
    );
  }

  // The compatibility route owns Public web and pre-cutover installed-app
  // traffic. Once the server has positively selected V3 Notifications for this
  // signed-in viewer, a later rollout refetch error must not switch an active
  // official-notice workflow onto a second presentation/data path.
  if (
    isAppMode &&
    rollout.data?.notificationsEnabled === true &&
    rollout.data.userId
  ) {
    return (
      <V3OfficialNoticesRouteContent
        userId={rollout.data.userId}
        editionId={rollout.data.editionId}
      />
    );
  }

  return <MySolarisNoticesModule />;
}
