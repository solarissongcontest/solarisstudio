import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  CircleAlert,
  Clock3,
  ExternalLink,
  ShieldAlert,
} from "lucide-react";
import { useMemo } from "react";

import { AppShell, PageHeader, Panel } from "@/components/AppShell";
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
import {
  buildEditionReadiness,
  type AdminIssue,
  type AdminSeverity,
} from "@/lib/admin-readiness";
import {
  useAdminAudit,
  useAdminDeadlines,
  useAdminNotifications,
} from "@/lib/admin-ops";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/control-room")({
  head: () => ({ meta: [{ title: "Control Room — Solaris Studio" }] }),
  component: ControlRoomPage,
});

const severityStyle: Record<AdminSeverity, string> = {
  critical: "border-red-500/25 bg-red-500/8 text-red-200",
  action: "border-amber-400/25 bg-amber-400/8 text-amber-100",
  warning: "border-sky-400/20 bg-sky-400/7 text-sky-100",
  complete: "border-emerald-400/20 bg-emerald-400/7 text-emerald-100",
};

function ControlRoomPage() {
  const { editionId } = useAdminContext();
  const { data: editions } = useEditions();
  const { data: shows } = useAllShows();
  const { data: participants } = useAllParticipants();
  const { data: voters } = useAllVoters();
  const { data: juryVotes } = useAllJuryVotes();
  const { data: televotes } = useAllTelevotes();
  const { data: results } = useAllResults();

  const edition = useMemo(() => {
    const ordered = [...(editions ?? [])].sort(
      (a, b) => (b.edition_number ?? -1) - (a.edition_number ?? -1),
    );
    return ordered.find((item) => item.id === editionId) ?? ordered[0] ?? null;
  }, [editions, editionId]);

  const readiness = useMemo(
    () =>
      edition
        ? buildEditionReadiness({
            edition,
            shows: shows ?? [],
            participants: participants ?? [],
            voters: voters ?? [],
            juryVotes: juryVotes ?? [],
            televotes: televotes ?? [],
            results: results ?? [],
          })
        : null,
    [edition, shows, participants, voters, juryVotes, televotes, results],
  );

  const { data: deadlines } = useAdminDeadlines(edition?.id);
  const { data: audit } = useAdminAudit(10);
  const { data: notifications } = useAdminNotifications();
  const unread = (notifications ?? []).filter((item) => !item.read_at);

  if (!edition || !readiness) {
    return (
      <AppShell>
        <PageHeader
          eyebrow="Control Room"
          title="No edition yet"
          description="Create an edition first, then the Control Room can start doing the remembering for you."
        />
        <Link to="/admin" className="inline-flex rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
          Create an edition
        </Link>
      </AppShell>
    );
  }

  const nextIssue = readiness.issues[0] ?? null;
  const openDeadlines = (deadlines ?? []).filter((item) => !item.completed_at);
  const upcoming = openDeadlines[0] ?? null;

  return (
    <AppShell>
      <PageHeader
        eyebrow="Solaris Control Room"
        title={`${editionLabel(edition)} operations`}
        description="What changed, what is incomplete, and what should happen next. The edition selector above controls this entire dashboard."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link
              to="/admin/$slug"
              params={{ slug: edition.slug }}
              className="rounded-lg border border-border bg-surface px-3 py-2 text-sm font-semibold"
            >
              Open edition
            </Link>
            <Link
              to="/editions/$slug"
              params={{ slug: edition.slug }}
              target="_blank"
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm"
            >
              <ExternalLink className="h-3.5 w-3.5" /> Public preview
            </Link>
          </div>
        }
      />

      <section
        className={cn(
          "mb-4 overflow-hidden rounded-2xl border p-5 sm:p-6",
          readiness.status === "blocked"
            ? "border-red-500/25 bg-red-500/[0.06]"
            : readiness.status === "ready"
              ? "border-emerald-500/20 bg-emerald-500/[0.055]"
              : "border-amber-400/20 bg-amber-400/[0.055]",
        )}
      >
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Contest health</p>
            <div className="mt-2 flex items-center gap-3">
              {readiness.status === "blocked" ? (
                <ShieldAlert className="h-8 w-8 text-red-300" />
              ) : readiness.status === "ready" ? (
                <CheckCircle2 className="h-8 w-8 text-emerald-300" />
              ) : (
                <CircleAlert className="h-8 w-8 text-amber-200" />
              )}
              <div>
                <h2 className="font-display text-3xl font-black tracking-[-0.04em]">
                  {readiness.status === "blocked"
                    ? "BLOCKED"
                    : readiness.status === "ready"
                      ? "READY"
                      : "NEEDS ATTENTION"}
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  {readiness.issues.length
                    ? `${readiness.issues.length} issue${readiness.issues.length === 1 ? "" : "s"} currently need attention.`
                    : "Every live readiness check is clear."}
                </p>
              </div>
            </div>
          </div>

          <div className="min-w-[220px]">
            <div className="flex items-end justify-between">
              <span className="text-xs font-semibold text-muted-foreground">Readiness</span>
              <span className="numeric text-3xl font-black">{readiness.progress}%</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/8">
              <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${readiness.progress}%` }} />
            </div>
          </div>
        </div>
      </section>

      <div className="grid min-w-0 gap-4 xl:grid-cols-[1.45fr_.8fr]">
        <div className="space-y-4">
          <Panel title="Needs attention" description="Live checks derived from this edition's actual data.">
            {!readiness.issues.length ? (
              <div className="flex items-center gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.055] p-4">
                <CheckCircle2 className="h-5 w-5 text-emerald-300" />
                <p className="text-sm font-semibold">Nothing currently needs intervention.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {readiness.issues.slice(0, 8).map((issue) => (
                  <IssueRow key={issue.id} issue={issue} slug={edition.slug} />
                ))}
                {readiness.issues.length > 8 && (
                  <Link to="/admin/action-centre" className="mt-3 inline-flex text-xs font-bold text-primary">
                    Open all {readiness.issues.length} issues →
                  </Link>
                )}
              </div>
            )}
          </Panel>

          <Panel title="Readiness by area" description="Green means Solaris found no current blocker or warning in that area.">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {readiness.areas.map((area) => (
                <div key={area.key} className={cn("rounded-xl border p-3.5", severityStyle[area.status])}>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-black">{area.label}</p>
                    <span className="text-[9px] font-black uppercase">{area.status === "complete" ? "Complete" : area.status}</span>
                  </div>
                  <p className="mt-2 text-[11px] opacity-70">
                    {area.status === "complete" ? "No current issue detected." : "Open Action Centre for the exact items."}
                  </p>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Recent changes" description="Recent organizer and country-data changes.">
            {(audit ?? []).length ? (
              <div className="divide-y divide-border/55">
                {(audit ?? []).map((row) => (
                  <div key={row.id} className="flex gap-3 py-3 first:pt-0 last:pb-0">
                    <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary/60" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold">{row.action} · {row.table_name}</p>
                      <p className="mt-1 text-[10px] text-muted-foreground">{new Date(row.created_at).toLocaleString()}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No audit events available yet.</p>
            )}
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel title="Next action" description="The highest-priority thing Solaris thinks should happen next.">
            {nextIssue ? (
              <IssueRow issue={nextIssue} slug={edition.slug} emphasis />
            ) : (
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.055] p-4 text-sm font-semibold text-emerald-100">
                Everything currently passes.
              </div>
            )}
          </Panel>

          <Panel title="Deadlines" description="Operational deadlines for the selected edition.">
            {upcoming ? (
              <div className="rounded-xl border border-border/70 bg-surface p-4">
                <div className="flex items-center gap-2 text-primary">
                  <Clock3 className="h-4 w-4" />
                  <p className="text-[10px] font-black uppercase tracking-[0.16em]">{upcoming.kind}</p>
                </div>
                <p className="mt-2 text-sm font-bold">{upcoming.label}</p>
                <p className="mt-1 text-xs text-muted-foreground">{new Date(upcoming.due_at).toLocaleString()}</p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No open deadlines.</p>
            )}
            <Link to="/admin/system" className="mt-3 inline-flex text-xs font-bold text-primary">Manage deadlines →</Link>
          </Panel>

          <Panel title="Notifications">
            <div className="flex items-end justify-between">
              <div>
                <p className="numeric text-4xl font-black">{unread.length}</p>
                <p className="text-xs text-muted-foreground">unread operational notifications</p>
              </div>
              <Bell className="h-7 w-7 text-primary/55" />
            </div>
            <Link to="/admin/action-centre" className="mt-4 inline-flex text-xs font-bold text-primary">Open Action Centre →</Link>
          </Panel>

          <Panel title="Quick actions">
            <div className="grid gap-2">
              <Link to="/admin/$slug" params={{ slug: edition.slug }} className="rounded-xl border border-border bg-surface px-3 py-3 text-sm font-semibold">Open {editionLabel(edition)}</Link>
              <Link to="/admin/hosts" className="rounded-xl border border-border bg-surface px-3 py-3 text-sm font-semibold">Manage hosting</Link>
              <Link to="/admin/predictions" className="rounded-xl border border-border bg-surface px-3 py-3 text-sm font-semibold">Prediction rounds</Link>
              <Link to="/admin/country-accounts" className="rounded-xl border border-border bg-surface px-3 py-3 text-sm font-semibold">Country accounts</Link>
            </div>
          </Panel>
        </div>
      </div>
    </AppShell>
  );
}

function IssueRow({ issue, slug, emphasis = false }: { issue: AdminIssue; slug: string; emphasis?: boolean }) {
  const Icon = issue.severity === "critical" ? ShieldAlert : issue.severity === "action" ? AlertTriangle : CircleAlert;

  return (
    <div className={cn("flex min-w-0 gap-3 rounded-xl border p-3.5", severityStyle[issue.severity], emphasis && "p-4")}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-black">{issue.title}</p>
        <p className="mt-1 text-[11px] leading-relaxed opacity-70">{issue.detail}</p>
        <Link to="/admin/$slug" params={{ slug }} className="mt-2 inline-flex text-[10px] font-black uppercase tracking-[0.1em] underline decoration-current/30 underline-offset-4">
          Fix this →
        </Link>
      </div>
    </div>
  );
}
