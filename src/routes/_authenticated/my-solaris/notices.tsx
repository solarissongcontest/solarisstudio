import { createFileRoute } from "@tanstack/react-router";

import {
  MySolarisNoticesModule,
  type NoticesSearch,
} from "@/components/mysolaris/modules/MySolarisNoticesModule";
import { OrganizerPublicNoticesModule } from "@/components/mysolaris/modules/OrganizerPublicNoticesModule";
import { OrganizerRecipientNoticesModule } from "@/components/mysolaris/modules/OrganizerRecipientNoticesModule";
import { useMyCountryAccount } from "@/lib/country-account";
import type { NoticeInboxState } from "@/lib/official-communications";

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
  const account = useMyCountryAccount();
  const access = account.data?.access;

  if (access?.isOrganizer && access.countryId && access.countryStatus === "active") {
    return <OrganizerRecipientNoticesModule />;
  }

  if (access?.isOrganizer) {
    return <OrganizerPublicNoticesModule />;
  }

  return <MySolarisNoticesModule />;
}
