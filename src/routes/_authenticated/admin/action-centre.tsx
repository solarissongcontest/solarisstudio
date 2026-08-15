import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Bell,
  CheckCircle2,
  CircleAlert,
  ShieldAlert,
  TriangleAlert,
} from "lucide-react";
import { useMemo } from "react";

import { AppShell, PageHeader, Panel } from "@/components/AppShell";
import { useAdminContext } from "@/components/admin/AdminContext";
import { editionLabel, useAllShows, useEditions } from "@/lib/data";
import { buildEditionReadiness } from "@/lib/admin-readiness";
import { useAdminReadinessData } from "@/lib/admin-readiness-data";
import {
  useAdminNotifications,
  useMarkNotificationRead,
} from "@/lib/admin-ops";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/action-centre")({
  head: () => ({ meta: [{ title: "Action Centre — Solaris Studio" }] }),
  component: ActionCentrePage,
});

function ActionCentrePage() {
  const { editionId } = useAdminContext();
  const { data: editions } = useEditions();
  const { data: shows } = useAllShows();

  const edition = useMemo(() => {
    const ordered = [...(editions ?? [])].sort(
      (a, b) => (b.edition_number ?? -1) - (a.edition_number ?? -1),
    );
    return ordered.find((item) => item.id === editionId) ?? ordered[0] ?? null;
  }, [editions, editionId]);

  // Critical performance rule: Action Centre only loads the edition selected
  // in the global admin context. Historical contests are available by switching
  // edition rather than being downloaded in every render.
  const { data: readinessData, isLoading: readinessLoading } =
    useAdminReadinessData(edition?.id);

  const { data: notifications } = useAdminNotifications();
  const markRead = useMarkNotificationRead();

  const readiness = useMemo(
    () =>
      edition
        ? buildEditionReadiness({
            edition,
            shows: shows ?? [],
            participants: readinessData?.participants ?? [],
            voters: readinessData?.voters ?? [],
            juryVotes: readinessData?.juryVotes ?? [],
            televotes: readinessData?.televotes ?? [],
            results: readinessData?.results ?? [],
          })
        : null,
    [edition, shows, readinessData],
  );

  const issues = readiness?.issues ?? [];

  return (
    <AppShell>
      <PageHeader
        eyebrow="Operations"
        title="Action Centre"
        description={
          edition
            ? `Live blockers and warnings for ${editionLabel(edition)}. Switch edition in the admin header to inspect another contest.`
            : "Live blockers, incomplete contest work and organizer notifications."
        }
      />

      <div className="grid min-w-0 gap-4 xl:grid-cols-[1.35fr_.8fr]">
        <Panel
          title={readinessLoading ? "Checking edition…" : `${issues.length} live issues`}
          description="Only the selected edition is loaded, keeping the admin fast even with years of historical vote data."
        >
          <div className="space-y-2">
            {edition &&
              issues.map((issue) => {
                const Icon =
                  issue.severity === "critical"
                    ? ShieldAlert
                    : issue.severity === "action"
                      ? TriangleAlert
                      : CircleAlert;

                return (
                  <div
                    key={issue.id}
                    className={cn(
                      "flex gap-3 rounded-xl border p-3.5",
                      issue.severity === "critical"
                        ? "border-red-500/25 bg-red-500/[0.055]"
                        : issue.severity === "action"
                          ? "border-amber-400/20 bg-amber-400/[0.045]"
                          : "border-sky-400/20 bg-sky-400/[0.045]",
                    )}
                  >
                    <Icon className="mt-0.5 h-4 w-4 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[9px] font-black uppercase tracking-[0.16em] text-muted-foreground">
                        {editionLabel(edition)} · {issue.area}
                      </p>
                      <p className="mt-1 text-sm font-bold">{issue.title}</p>
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                        {issue.detail}
                      </p>
                      <Link
                        to="/admin/$slug"
                        params={{ slug: edition.slug }}
                        className="mt-2 inline-flex text-xs font-bold text-primary"
                      >
                        Open edition →
                      </Link>
                    </div>
                  </div>
                );
              })}

            {!readinessLoading && edition && !issues.length && (
              <div className="flex items-center gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.05] p-4">
                <CheckCircle2 className="h-5 w-5 text-emerald-300" />
                <p className="text-sm font-semibold">
                  No live readiness issues for {editionLabel(edition)}.
                </p>
              </div>
            )}
          </div>
        </Panel>

        <Panel title="Notifications" description="Persistent organizer notifications.">
          <div className="space-y-2">
            {(notifications ?? []).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  if (!item.read_at) markRead.mutate(item.id);
                  if (item.href) window.location.href = item.href;
                }}
                className={cn(
                  "w-full rounded-xl border p-3 text-left",
                  item.read_at
                    ? "border-border/60 bg-surface/50 opacity-65"
                    : "border-primary/25 bg-primary/[0.055]",
                )}
              >
                <div className="flex items-start gap-3">
                  <Bell className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <div className="min-w-0">
                    <p className="text-xs font-bold">{item.title}</p>
                    {item.body && (
                      <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                        {item.body}
                      </p>
                    )}
                    <p className="mt-2 text-[9px] text-muted-foreground">
                      {new Date(item.created_at).toLocaleString()}
                    </p>
                  </div>
                </div>
              </button>
            ))}

            {!(notifications ?? []).length && (
              <p className="text-sm text-muted-foreground">
                No persistent notifications yet.
              </p>
            )}
          </div>
        </Panel>
      </div>
    </AppShell>
  );
}
