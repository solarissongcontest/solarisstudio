import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle, Bell, CheckCircle2, Clock3, ShieldAlert } from "lucide-react";
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
import { useAdminAudit, useAdminDeadlines, useAdminNotifications } from "@/lib/admin-ops";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/control-room")({
  head: () => ({ meta: [{ title: "Control Room — Solaris Studio" }] }),
  component: ControlRoomPage,
});

function ControlRoomPage() {
  const { editionId } = useAdminContext();
  const { data: editions = [] } = useEditions();
  const { data: shows = [] } = useAllShows();
  const { data: participants = [] } = useAllParticipants();
  const { data: voters = [] } = useAllVoters();
  const { data: juryVotes = [] } = useAllJuryVotes();
  const { data: televotes = [] } = useAllTelevotes();
  const { data: results = [] } = useAllResults();

  const edition = editions.find((item) => item.id === editionId) ?? editions[0] ?? null;
  const readiness = useMemo(
    () => edition ? buildEditionReadiness({ edition, shows, participants, voters, juryVotes, televotes, results }) : null,
    [edition, shows, participants, voters, juryVotes, televotes, results],
  );

  const { data: deadlines = [] } = useAdminDeadlines(edition?.id);
  const { data: audit = [] } = useAdminAudit(10);
  const { data: notifications = [] } = useAdminNotifications();

  if (!edition || !readiness) {
    return <div className="rounded-2xl border border-border bg-surface p-6"><h1 className="font-display text-2xl font-black">Create an edition first</h1><p className="mt-2 text-sm text-muted-foreground">The Control Room needs an edition to supervise.</p><Link to="/admin" className="mt-4 inline-flex rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground">Manage editions</Link></div>;
  }

  const nextIssue = readiness.issues[0] ?? null;
  const openDeadlines = deadlines.filter((item) => !item.completed_at);
  const unread = notifications.filter((item) => !item.read_at).length;

  return (
    <div className="space-y-4">
      <header className="flex flex-col gap-4 border-b border-border/60 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Solaris Control Room</p>
          <h1 className="mt-2 font-display text-3xl font-black tracking-[-0.04em] sm:text-4xl">{editionLabel(edition)} operations</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">What changed, what is incomplete, and what should happen next.</p>
        </div>
        <Link to="/admin/$slug" params={{ slug: edition.slug }} className="rounded-lg border border-border bg-surface px-3 py-2 text-sm font-semibold">Open edition</Link>
      </header>

      <section className={cn("rounded-2xl border p-5 sm:p-6", readiness.status === "blocked" ? "border-red-500/25 bg-red-500/[0.055]" : readiness.status === "ready" ? "border-emerald-500/20 bg-emerald-500/[0.05]" : "border-amber-400/22 bg-amber-400/[0.05]")}>
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            {readiness.status === "blocked" ? <ShieldAlert className="h-8 w-8 text-red-300" /> : readiness.status === "ready" ? <CheckCircle2 className="h-8 w-8 text-emerald-300" /> : <AlertTriangle className="h-8 w-8 text-amber-200" />}
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Contest health</p>
              <h2 className="mt-1 font-display text-3xl font-black">{readiness.status === "blocked" ? "BLOCKED" : readiness.status === "ready" ? "READY" : "NEEDS ATTENTION"}</h2>
              <p className="mt-1 text-xs text-muted-foreground">{readiness.issues.length ? `${readiness.issues.length} things currently need attention.` : "Every live check is clear."}</p>
            </div>
          </div>
          <div className="min-w-[220px]">
            <div className="flex items-end justify-between"><span className="text-xs font-semibold text-muted-foreground">Readiness</span><span className="numeric text-3xl font-black">{readiness.progress}%</span></div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/8"><div className="h-full rounded-full bg-primary" style={{ width: `${readiness.progress}%` }} /></div>
          </div>
        </div>
      </section>

      <div className="grid min-w-0 gap-4 xl:grid-cols-[1.4fr_.8fr]">
        <div className="space-y-4">
          <Panel title="Needs attention" description="Calculated directly from the current contest data.">
            <div className="space-y-2">
              {readiness.issues.slice(0, 8).map((issue) => (
                <div key={issue.id} className={cn("rounded-xl border p-3.5", issue.severity === "critical" ? "border-red-500/25 bg-red-500/[0.045]" : issue.severity === "action" ? "border-amber-400/20 bg-amber-400/[0.04]" : "border-sky-400/20 bg-sky-400/[0.04]")}>
                  <p className="text-xs font-black">{issue.title}</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{issue.detail}</p>
                  <Link to="/admin/$slug" params={{ slug: edition.slug }} className="mt-2 inline-flex text-[10px] font-black uppercase tracking-[0.1em] text-primary">Fix this →</Link>
                </div>
              ))}
              {!readiness.issues.length && <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.05] p-4 text-sm font-semibold">Nothing currently needs intervention.</div>}
            </div>
          </Panel>

          <Panel title="Readiness by area">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {readiness.areas.map((area) => (
                <div key={area.key} className="rounded-xl border border-border bg-surface p-3.5">
                  <div className="flex items-center justify-between gap-2"><p className="text-xs font-black">{area.label}</p><span className={cn("text-[9px] font-black uppercase", area.status === "complete" ? "text-emerald-400" : area.status === "critical" ? "text-red-300" : area.status === "action" ? "text-amber-300" : "text-sky-300")}>{area.status === "complete" ? "Complete" : area.status}</span></div>
                  <p className="mt-2 text-[11px] text-muted-foreground">{area.status === "complete" ? "No current issue detected." : "Open Action Centre for the exact work."}</p>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Recent changes" description="Persistent audit history appears after the admin SQL migration is installed.">
            <div className="divide-y divide-border/55">
              {audit.map((row) => <div key={row.id} className="py-3 first:pt-0"><p className="text-xs font-semibold">{row.action} · {row.table_name}</p><p className="mt-1 text-[10px] text-muted-foreground">{new Date(row.created_at).toLocaleString()}</p></div>)}
              {!audit.length && <p className="text-sm text-muted-foreground">No audit events available yet.</p>}
            </div>
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel title="Next action">
            {nextIssue ? <div className="rounded-xl border border-primary/20 bg-primary/[0.045] p-4"><p className="text-sm font-black">{nextIssue.title}</p><p className="mt-2 text-xs leading-relaxed text-muted-foreground">{nextIssue.detail}</p><Link to="/admin/$slug" params={{ slug: edition.slug }} className="mt-3 inline-flex text-xs font-bold text-primary">Open editor →</Link></div> : <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.05] p-4 text-sm font-semibold">Everything currently passes.</div>}
          </Panel>

          <Panel title="Deadlines">
            {openDeadlines[0] ? <div className="rounded-xl border border-border bg-surface p-4"><div className="flex items-center gap-2 text-primary"><Clock3 className="h-4 w-4" /><p className="text-[10px] font-black uppercase tracking-[0.15em]">{openDeadlines[0].kind}</p></div><p className="mt-2 text-sm font-bold">{openDeadlines[0].label}</p><p className="mt-1 text-xs text-muted-foreground">{new Date(openDeadlines[0].due_at).toLocaleString()}</p></div> : <p className="text-sm text-muted-foreground">No open deadlines.</p>}
            <Link to="/admin/system" className="mt-3 inline-flex text-xs font-bold text-primary">Manage deadlines →</Link>
          </Panel>

          <Panel title="Notifications">
            <div className="flex items-end justify-between"><div><p className="numeric text-4xl font-black">{unread}</p><p className="text-xs text-muted-foreground">unread operational notifications</p></div><Bell className="h-7 w-7 text-primary/55" /></div>
            <Link to="/admin/action-centre" className="mt-4 inline-flex text-xs font-bold text-primary">Open Action Centre →</Link>
          </Panel>
        </div>
      </div>
    </div>
  );
}
