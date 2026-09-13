import { createFileRoute, redirect } from "@tanstack/react-router";

import type { NoticeInboxState } from "@/lib/official-communications";
import { NAV_TARGETS } from "@/lib/navigation-targets";

const INBOX_STATES = new Set([
  "unread",
  "read",
  "acknowledgement_required",
  "acknowledged",
  "archived",
]);

export type NoticesSearch = {
  notice?: string;
  state?: NoticeInboxState;
};

export const Route = createFileRoute("/_authenticated/country-hub/notices")({
  validateSearch: (search: Record<string, unknown>): NoticesSearch => ({
    notice: typeof search.notice === "string" && search.notice ? search.notice : undefined,
    state:
      typeof search.state === "string" && INBOX_STATES.has(search.state)
        ? (search.state as NoticeInboxState)
        : undefined,
  }),
  head: () => ({
    meta: [{ title: "Official notices — Solaris Studio" }, { name: "robots", content: "noindex" }],
  }),
  beforeLoad: ({ search }) => {
    throw redirect({ to: NAV_TARGETS.mySolarisNotices, search, replace: true });
  },
  component: () => null,
});
