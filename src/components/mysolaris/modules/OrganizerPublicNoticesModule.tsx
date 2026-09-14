import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, BellRing, Megaphone } from "lucide-react";

import { AppShell, PageHeader, Panel } from "@/components/AppShell";
import {
  loadPublicHomeAnnouncements,
  type HomeAnnouncement,
} from "@/lib/official-announcement-feed";
import { noticeTypeLabel } from "@/lib/official-communications";

export function OrganizerPublicNoticesModule() {
  const noticesQuery = useQuery({
    queryKey: ["official-announcements", "public_home", "organizer-notices"],
    queryFn: () => loadPublicHomeAnnouncements(10),
    staleTime: 30_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });

  const notices = noticesQuery.data ?? [];

  return (
    <AppShell>
      <PageHeader
        eyebrow="Organizer account"
        title="Public notifications"
        description="This organizer account does not currently have an active delegation account, so this view mirrors notices published to the public homepage. Delegation acknowledgement controls appear here automatically when an active country account is attached."
        actions={
          <Link
            to="/admin/communications"
            className="rounded-xl border border-border bg-surface px-3 py-2 text-sm font-semibold"
          >
            Open communications →
          </Link>
        }
      />

      {noticesQuery.isLoading ? (
        <Panel title="Public notifications">
          <p className="text-sm text-muted-foreground">Loading public notifications…</p>
        </Panel>
      ) : noticesQuery.isError ? (
        <Panel title="Public notifications">
          <p className="text-sm text-destructive">
            Public notifications could not be loaded. Organizer communications are still available from the button above.
          </p>
        </Panel>
      ) : notices.length === 0 ? (
        <Panel title="Public notifications">
          <div className="flex min-h-40 flex-col items-center justify-center text-center">
            <Megaphone className="mb-3 size-7 text-muted-foreground" />
            <p className="font-semibold">No public notifications</p>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">
              Notices published to Public Home will appear here for organizers exactly as they do for visitors.
            </p>
          </div>
        </Panel>
      ) : (
        <Panel title="Public notifications">
          <div className="divide-y divide-border">
            {notices.map((notice) => (
              <PublicNoticeRow key={notice.id} notice={notice} />
            ))}
          </div>
        </Panel>
      )}
    </AppShell>
  );
}

function PublicNoticeRow({ notice }: { notice: HomeAnnouncement }) {
  const critical = notice.severity === "critical" || notice.severity === "urgent";
  const Icon = critical ? AlertTriangle : BellRing;

  return (
    <article className="flex gap-3 py-4 first:pt-0 last:pb-0">
      <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl border border-border bg-muted/20 text-muted-foreground">
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-semibold text-foreground">{notice.title}</h2>
          {critical ? (
            <span className="rounded-full border border-red-400/30 bg-red-400/10 px-2 py-0.5 text-[11px] font-semibold text-red-300">
              {notice.severity}
            </span>
          ) : null}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {noticeTypeLabel(notice.noticeType)} · {formatTimestamp(notice.sentAt)}
        </p>
        <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
          {notice.body}
        </p>
      </div>
    </article>
  );
}

function formatTimestamp(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}
