import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowRight,
  BarChart3,
  Blend,
  DatabaseZap,
  Globe2,
  PlayCircle,
  ShieldAlert,
  Trophy,
} from "lucide-react";

import {
  AdminCard,
  AdminCardHeader,
  AdminEmptyState,
  AdminPageHeader,
  AdminStatus,
} from "@/components/admin/AdminUI";
import { getMergedTelevotingOverview } from "@/integrations/televoting/admin-data.functions";
import { getMergedTelevotingServerStatus } from "@/integrations/televoting/status.functions";

export const Route = createFileRoute("/televoting/admin/")({
  head: () => ({
    meta: [
      { title: "Voting — Solaris Organizer" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: VotingAdminOverview,
});

function VotingAdminOverview() {
  const getOverview = useServerFn(getMergedTelevotingOverview);
  const getStatus = useServerFn(getMergedTelevotingServerStatus);

  const { data: status, isLoading: statusLoading } = useQuery({
    queryKey: ["merged-televoting-server-status-admin"],
    queryFn: () => getStatus(),
    staleTime: 30_000,
  });

  const backendReady = status?.adminReady === true;

  const { data, isLoading, error } = useQuery({
    queryKey: ["merged-televoting-admin-overview"],
    queryFn: () => getOverview(),
    enabled: backendReady,
    staleTime: 10_000,
    refetchInterval: 15_000,
  });

  const nextAction =
    !data || data.rounds === 0
      ? {
          title: "Create the first public voting round",
          description: "Choose the entries and voting rules before public voting can open.",
          to: "/televoting/admin/rounds",
          label: "Set up round",
        }
      : data.blocked > 0
        ? {
            title: `Review ${data.blocked} blocked ${data.blocked === 1 ? "ballot" : "ballots"}`,
            description: "Integrity checks found voting that needs an organizer decision.",
            to: "/televoting/admin/integrity",
            label: "Review integrity",
          }
        : data.openRounds > 0
          ? {
              title: "Public voting is open",
              description: `${data.openRounds} ${data.openRounds === 1 ? "round is" : "rounds are"} accepting ballots now.`,
              to: "/televoting/admin/rounds",
              label: "Monitor voting",
            }
          : data.submissions > 0
            ? {
                title: "Prepare the public vote result",
                description: `${data.submissions} submitted ${data.submissions === 1 ? "ballot is" : "ballots are"} available.`,
                to: "/televoting/admin/results",
                label: "Open results",
              }
            : {
                title: "No public voting action needs urgent attention",
                description: "Open or schedule the next round when you are ready.",
                to: "/televoting/admin/rounds",
                label: "Manage rounds",
              };

  return (
    <div className="mx-auto max-w-5xl">
      <AdminPageHeader
        eyebrow="Current edition"
        title="Voting"
        description="Jury, public voting, integrity and official results now live under one organizer section."
        actions={
          <Link to="/televoting" target="_blank" className="admin-action-secondary">
            <Globe2 className="size-4" /> Public voting
          </Link>
        }
      />

      {statusLoading ? (
        <AdminCard>
          <p className="py-7 text-center text-sm text-muted-foreground">Checking the voting system…</p>
        </AdminCard>
      ) : !backendReady ? (
        <AdminCard>
          <div className="rounded-xl border border-amber-200/15 bg-amber-200/[0.05] p-4">
            <div className="flex items-start gap-3">
              <DatabaseZap className="mt-0.5 size-5 shrink-0 text-amber-100" />
              <div>
                <p className="text-sm font-semibold text-foreground">Organizer voting tools are unavailable</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  Public voting may still work, but organizer controls cannot currently reach the voting backend.
                  Check System health before changing voting data.
                </p>
              </div>
            </div>
          </div>
        </AdminCard>
      ) : isLoading ? (
        <AdminCard>
          <p className="py-7 text-center text-sm text-muted-foreground">Loading voting status…</p>
        </AdminCard>
      ) : error ? (
        <AdminCard>
          <div className="rounded-xl border border-rose-200/15 bg-rose-200/[0.055] p-4 text-sm text-rose-100">
            {error instanceof Error ? error.message : "Voting information could not be loaded."}
          </div>
        </AdminCard>
      ) : data ? (
        <div className="space-y-4">
          <AdminCard strong>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="truncate text-xl font-bold tracking-[-.025em]">
                    {data.activeEdition ?? "Voting workspace"}
                  </h2>
                  <AdminStatus tone={data.openRounds > 0 ? "ready" : "neutral"}>
                    {data.openRounds > 0 ? "Public voting live" : "Public voting closed"}
                  </AdminStatus>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Jury tools are available from the Jury tab above. This overview focuses on the public voting service.
                </p>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center sm:min-w-[18rem]">
                <Metric label="Rounds" value={data.rounds} />
                <Metric label="Ballots" value={data.submissions} />
                <Metric label="Blocked" value={data.blocked} />
              </div>
            </div>
          </AdminCard>

          <AdminCard>
            <AdminCardHeader
              eyebrow="Next action"
              title={nextAction.title}
              description={nextAction.description}
              action={
                <Link to={nextAction.to as any} className="admin-action-primary !min-h-10">
                  {nextAction.label} <ArrowRight className="size-4" />
                </Link>
              }
            />
          </AdminCard>

          <AdminCard>
            <AdminCardHeader
              eyebrow="Public voting"
              title="What do you need to do?"
              description="The three everyday public-voting tasks are kept here. Specialist analysis stays out of the way until you need it."
            />
            <div className="divide-y divide-white/[0.07]">
              <WorkspaceRow
                to="/televoting/admin/rounds"
                icon={PlayCircle}
                title="Rounds & entries"
                description="Choose eligible entries and countries, then open, close or schedule voting."
                detail={data.openRounds ? `${data.openRounds} open now` : `${data.rounds} configured`}
              />
              <WorkspaceRow
                to="/televoting/admin/integrity"
                icon={ShieldAlert}
                title="Integrity review"
                description="Review ballots Solaris flagged and record organizer decisions."
                detail={data.blocked ? `${data.blocked} blocked` : "No blocked ballots"}
              />
              <WorkspaceRow
                to="/televoting/admin/results"
                icon={Trophy}
                title="Public vote results"
                description="Calculate and review the public vote before it becomes part of the official result."
                detail={`${data.submissions} ballots`}
              />
            </div>
          </AdminCard>

          <details className="admin-card group overflow-hidden">
            <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 text-sm font-semibold text-muted-foreground transition hover:text-foreground">
              Analysis & advanced voting tools
              <span className="text-xs transition group-open:rotate-90">›</span>
            </summary>
            <div className="border-t border-white/[0.07] px-1 pb-1">
              <WorkspaceRow
                to="/televoting/admin/analytics"
                icon={BarChart3}
                title="Voting analytics"
                description="Turnout, point distribution and entry performance."
              />
              <WorkspaceRow
                to="/admin/friend-voting"
                icon={ShieldAlert}
                title="Friend-voting intelligence"
                description="Historical relationships, reciprocity, signals and network analysis."
              />
              <WorkspaceRow
                to="/televoting/admin/combined"
                icon={Blend}
                title="Combined result tools"
                description="Inspect how jury and public voting are combined."
              />
              <WorkspaceRow
                to="/televoting/admin/audit-log"
                icon={ShieldAlert}
                title="Voting audit log"
                description="Review important organizer actions and integrity decisions."
              />
            </div>
          </details>
        </div>
      ) : (
        <AdminCard>
          <AdminEmptyState
            icon={PlayCircle}
            title="No voting data yet"
            description="Create a public voting round to begin."
            action={
              <Link to="/televoting/admin/rounds" className="admin-action-primary">
                Set up round
              </Link>
            }
          />
        </AdminCard>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.018] px-2 py-2.5">
      <p className="numeric text-lg font-bold">{value}</p>
      <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{label}</p>
    </div>
  );
}

function WorkspaceRow({
  to,
  icon: Icon,
  title,
  description,
  detail,
}: {
  to: string;
  icon: typeof PlayCircle;
  title: string;
  description: string;
  detail?: string;
}) {
  return (
    <Link to={to as any} className="admin-action-row group">
      <span className="admin-action-row-icon">
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{title}</span>
        <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{description}</span>
      </span>
      {detail ? <span className="hidden shrink-0 text-[11px] font-semibold text-sky-100/70 sm:block">{detail}</span> : null}
      <ArrowRight className="size-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5" />
    </Link>
  );
}
