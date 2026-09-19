import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  CheckCheck,
  CheckCircle2,
  Inbox,
  ShieldAlert,
  TriangleAlert,
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";

import { AdminPage } from "@/components/admin/AdminShell";
import {
  AdminCard,
  AdminCardHeader,
  AdminEmptyState,
  AdminPageHeader,
  AdminStatus,
} from "@/components/admin/AdminUI";
import {
  useAdminNotifications,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  type AdminNotification,
} from "@/lib/admin-ops";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/inbox")({
  head: () => ({
    meta: [
      { title: "Inbox — Solaris Organizer" },
      { name: "robots", content: "noindex" },
      {
        name: "description",
        content: "Review new submissions, cases and system events that need organizer attention.",
      },
    ],
  }),
  component: OrganizerInbox,
});

type InboxFilter = "needs-attention" | "all" | "resolved";

function OrganizerInbox() {
  const { data: notifications = [], isLoading, isError, refetch } = useAdminNotifications();
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();
  const [filter, setFilter] = useState<InboxFilter>("needs-attention");

  const unread = useMemo(
    () => notifications.filter((item) => !item.read_at),
    [notifications],
  );
  const shown = useMemo(() => {
    if (filter === "needs-attention") return unread;
    if (filter === "resolved") return notifications.filter((item) => item.read_at);
    return notifications;
  }, [filter, notifications, unread]);

  return (
    <AdminPage>
      <div className="mx-auto max-w-5xl">
        <AdminPageHeader
          eyebrow="Organizer Inbox"
          title="What needs attention"
          description="New submissions and important system events collect here so they do not depend on someone remembering to check a separate page."
          actions={
            unread.length ? (
              <button
                type="button"
                disabled={markAllRead.isPending}
                onClick={() => markAllRead.mutate()}
                className="admin-action-secondary"
              >
                <CheckCheck className="size-4" />
                {markAllRead.isPending ? "Marking…" : "Mark all seen"}
              </button>
            ) : null
          }
        />

        <AdminCard>
          <div className="flex flex-wrap items-center gap-2">
            <FilterButton
              active={filter === "needs-attention"}
              onClick={() => setFilter("needs-attention")}
            >
              Needs attention
              {unread.length ? <span className="numeric">{unread.length}</span> : null}
            </FilterButton>
            <FilterButton active={filter === "all"} onClick={() => setFilter("all")}>
              All
            </FilterButton>
            <FilterButton active={filter === "resolved"} onClick={() => setFilter("resolved")}>
              Seen
            </FilterButton>
          </div>
        </AdminCard>

        <AdminCard className="mt-4">
          <AdminCardHeader
            title={
              filter === "needs-attention"
                ? unread.length
                  ? `${unread.length} ${unread.length === 1 ? "item" : "items"} need attention`
                  : "Inbox clear"
                : filter === "resolved"
                  ? "Seen items"
                  : "All Inbox items"
            }
            description="Opening an item takes you directly to the workflow where it can be handled."
          />

          {isLoading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Checking the Organizer Inbox…
            </p>
          ) : isError ? (
            <AdminEmptyState
              icon={TriangleAlert}
              title="Inbox could not be loaded"
              description="Solaris could not verify incoming organizer work. This is shown as an error rather than pretending there is nothing to do."
              action={
                <button type="button" onClick={() => void refetch()} className="admin-action-primary">
                  Retry
                </button>
              }
            />
          ) : shown.length ? (
            <div className="divide-y divide-white/[0.07]">
              {shown.map((item) => (
                <InboxRow
                  key={item.id}
                  item={item}
                  onSeen={() => {
                    if (!item.read_at) markRead.mutate(item.id);
                  }}
                />
              ))}
            </div>
          ) : (
            <AdminEmptyState
              icon={filter === "needs-attention" ? CheckCircle2 : Inbox}
              title={filter === "needs-attention" ? "Nothing needs attention" : "No items here"}
              description={
                filter === "needs-attention"
                  ? "New complaints, appeals, feedback and other connected administrative events will appear here automatically."
                  : "Try another Inbox view."
              }
            />
          )}
        </AdminCard>
      </div>
    </AdminPage>
  );
}

function InboxRow({ item, onSeen }: { item: AdminNotification; onSeen: () => void }) {
  const urgent = item.severity === "critical" || item.severity === "urgent";
  const attention = urgent || item.severity === "warning" || item.severity === "action";
  const Icon = urgent ? ShieldAlert : attention ? TriangleAlert : Inbox;

  const content = (
    <>
      <span
        className={cn(
          "grid size-10 shrink-0 place-items-center rounded-xl border",
          urgent
            ? "border-rose-200/15 bg-rose-200/[0.055] text-rose-100"
            : attention
              ? "border-amber-200/15 bg-amber-200/[0.05] text-amber-100"
              : "border-sky-200/12 bg-sky-200/[0.055] text-sky-100",
        )}
      >
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-foreground">{item.title}</span>
          {!item.read_at ? <AdminStatus tone={urgent ? "blocked" : "attention"}>New</AdminStatus> : null}
        </span>
        {item.body ? (
          <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{item.body}</span>
        ) : null}
        <span className="mt-1.5 block text-[10px] text-muted-foreground">
          {new Intl.DateTimeFormat(undefined, {
            dateStyle: "medium",
            timeStyle: "short",
          }).format(new Date(item.created_at))}
        </span>
      </span>
      {item.href ? <ArrowRight className="size-4 shrink-0 text-muted-foreground" /> : null}
    </>
  );

  if (item.href) {
    return (
      <Link to={item.href as any} onClick={onSeen} className="admin-list-row group">
        {content}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onSeen} className="admin-list-row w-full text-left">
      {content}
    </button>
  );
}

function FilterButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex min-h-9 items-center gap-2 rounded-xl border px-3 text-xs font-semibold transition",
        active
          ? "border-sky-200/15 bg-sky-200/[0.09] text-sky-50"
          : "border-white/[0.07] bg-white/[0.02] text-muted-foreground hover:bg-white/[0.04] hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
