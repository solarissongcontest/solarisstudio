import { createFileRoute, Link } from "@tanstack/react-router";
import { Bell, CheckCircle2, CircleAlert, ShieldAlert, TriangleAlert } from "lucide-react";
import { useMemo } from "react";

import { Panel } from "@/components/AppShell";
import { useAdminContext } from "@/components/admin/AdminContext";
import {
  editionLabel,
  useAllJuryVotes,
  useAllParticipants,
  useAllResults,
  useAllShows,
  useAllTelevotes,
  useAllVoters,
  useEditions,
} from "@/lib/data";
import { buildEditionReadiness } from "@/lib/admin-readiness";
import { useAdminNotifications, useMarkNotificationRead } from "@/lib/admin-ops";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/action-centre")({
  head: () => ({ meta: [{ title: "Action Centre — Solaris Studio" }] }),
  component: ActionCentrePage,
});

function ActionCentrePage() {
  const { editionId } = useAdminContext();
  const { data: editions = [] } = useEditions();
  const { data: shows = [] } = useAllShows();
  const { data: participants = [] } = useAllParticipants();
  const { data: voters = [] } = useAllVoters();
  const { data: juryVotes = [] } = useAllJuryVotes();
  const { data: televotes = [] } = useAllTelevotes();
  const { data: results = [] } = useAllResults();
  const { data: notifications = [] } = useAdminNotifications();
  const markRead = useMarkNotificationRead();

  const edition = editions.find((item) => item.id === editionId) ?? editions[0] ?? null;
  const readiness = useMemo(
    () => edition ? buildEditionReadiness({ edition, shows, participants, voters, juryVotes, televotes, results }) : null,
    [edition, shows, participants, voters, juryVotes, televotes, results],
  );

  return (
    <div className="space-y-4">
      <header className="border-b border-border/60 pb-5">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Operations</p>
        <h1 className="mt-2 font-display text-3xl font-black tracking-[-0.04em] sm:text-4xl">Action Centre</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">One queue for blockers, incomplete contest work and organizer notifications.</p>
      </header>

      <div className="grid min-w-0 gap-4 xl:grid-cols-[1.35fr_.8fr]">
        <Panel title={`${readiness?.issues.length ?? 0} live issues`} description="Recalculated from the selected edition every time the data changes.">
          <div className="space-y-2">
            {readiness?.issues.map((issue) => {
              const Icon = issue.severity === "critical" ? ShieldAlert : issue.severity === "action" ? TriangleAlert : CircleAlert;
              return (
                <div key={issue.id} className={cn("flex gap-3 rounded-xl border p-3.5", issue.severity === "critical" ? "border-red-500/25 bg-red-500/[0.05]" : issue.severity === "action" ? "border-amber-400/22 bg-amber-400/[0.045]" : "border-sky-400/20 bg-sky-400/[0.045]")}>
                  <Icon className="mt-0.5 h-4 w-4 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[9px] font-black uppercase tracking-[0.15em] text-muted-foreground">{edition ? editionLabel(edition) : "Edition"} · {issue.area}</p>
                    <p className="mt-1 text-sm font-bold">{issue.title}</p>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{issue.detail}</p>
                    {edition && <Link to="/admin/$slug" params={{ slug: edition.slug }} className="mt-2 inline-flex text-xs font-bold text-primary">Open editor →</Link>}
                  </div>
                </div>
              );
            })}
            {readiness && !readiness.issues.length && <div className="flex items-center gap-3 rounded-xl border border-emerald-500/22 bg-emerald-500/[0.05] p-4"><CheckCircle2 className="h-5 w-5 text-emerald-300" /><p className="text-sm font-semibold">No live readiness issues.</p></div>}
          </div>
        </Panel>

        <Panel title="Notifications" description="Persistent notifications become active after the admin SQL migration is installed.">
          <div className="space-y-2">
            {notifications.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  if (!item.read_at) markRead.mutate(item.id);
                  if (item.href) window.location.href = item.href;
                }}
                className={cn("w-full rounded-xl border p-3 text-left", item.read_at ? "border-border/60 bg-surface/50 opacity-65" : "border-primary/25 bg-primary/[0.05]")}
              >
                <div className="flex items-start gap-3">
                  <Bell className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <div className="min-w-0">
                    <p className="text-xs font-bold">{item.title}</p>
                    {item.body && <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{item.body}</p>}
                    <p className="mt-2 text-[9px] text-muted-foreground">{new Date(item.created_at).toLocaleString()}</p>
                  </div>
                </div>
              </button>
            ))}
            {!notifications.length && <p className="text-sm text-muted-foreground">No persistent notifications yet.</p>}
          </div>
        </Panel>
      </div>
    </div>
  );
}
