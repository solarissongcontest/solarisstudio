import { createFileRoute } from "@tanstack/react-router";

import {
  MySolarisNoticesModule,
  type NoticesSearch,
} from "@/components/mysolaris/modules/MySolarisNoticesModule";
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
  component: MySolarisNoticesModule,
});
