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
    refetchInterval: 5_000,
  });

  const nextAction =
    !data || data.rounds === 0
      ? {
          title: "Create the first voting round",
          description: "Choose the entries and voting rules before people can vote.",
          to: "/televoting/admin/rounds",
          label: "Create round",
        }
      : data.openRounds > 0
        ? {
            title: "Voting is open",
            description: `${data.openRounds} ${data.openRounds === 1 ? "round is" : "rounds are"} accepting votes now.`,
            to: "/televoting/admin/rounds",
            label: "View voting",
          }
        : data.submissions > 0
          ? {
              title: "Check the votes and prepare results",
              description: `${data.submissions} submitted ${data.submissions === 1 ? "vote is" : "votes are"} available to review.`,
              to: "/televoting/admin/results",
              label: "Open results",
            }
          : {
              title: "Open or schedule a voting round",
              description: "Voting rounds exist, but none are open right now.",
              to: "/televoting/admin/rounds",
              label: "Manage rounds",
            };

  return (
    <div className="mx-auto max-w-5xl">
      <AdminPageHeader
        eyebrow="Public voting"
        title="Televoting"
        description="Create voting rounds, see submitted votes, prepare results and check suspicious voting."
        actions={
          <Link to="/televoting" target="_blank" className="admin-action-secondary">
            <Globe2 className="size-4" /> Open public voting
          </Link>
        }
      />

      {statusLoading ? (
        <AdminCard>
          <p className="py-6 text-center text-sm text-muted-foreground">Checking the voting system…</p>
        </AdminCard>
      ) : !backendReady ? (
        <AdminCard>
          <div className="rounded-xl border border-amber-200/15 bg-amber-200/[0.05] p-4">
            <div className="flex items-start gap-3">
              <DatabaseZap className="mt-0.5 size-5 shrink-0 text-amber-100" />
              <div>
                <p className="text-sm font-semibold text-foreground">Organizer voting pages are unavailable</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  Solaris Studio cannot currently reach the organizer side of the voting system. Public voting may still work. Check the System check page before doing organizer voting work.
                </p>
              </div>
            </div>
          </div>
        </AdminCard>
      ) : isLoading ? (
        <AdminCard>
          <p className="py-6 text-center text-sm text-muted-foreground">Loading voting information…</p>
        </AdminCard>
      ) : error ? (
        <AdminCard>
          <div className="rounded-xl border border-rose-200/15 bg-rose-200/[0.055] p-4 text-sm text-rose-100">
            {error instanceof Error ? error.message : "Voting information could not be loaded."}
          </div>
        </AdminCard>
      ) : data ? (
        <>
          <AdminCard strong className="mb-4">
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="admin-section-label">Voting now</p>
                <h2 className="mt-1 truncate text-xl font-bold tracking-[-.025em]">
                  {data.activeEdition ?? "No edition has active voting"}
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  {data.openRounds > 0
                    ? `${data.openRounds} ${data.openRounds === 1 ? "round" : "rounds"} open now`
                    : "No voting round is open right now"}
                </p>
              </div>
              <AdminStatus tone={data.openRounds > 0 ? "ready" : "neutral"}>
                {data.openRounds > 0 ? "Open" : "Closed"}
              </AdminStatus>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl border border-white/[0.06] bg-white/[0.018] p-3 text-center">
              <Metric label="Rounds" value={data.rounds} />
              <Metric label="Submitted votes" value={data.submissions} />
              <Metric label="Blocked votes" value={data.blocked} />
            </div>
          </AdminCard>

          {data.blocked > 0 ? (
            <Link
              to="/televoting/admin/integrity"
              className="mb-4 flex min-w-0 items-start gap-3 rounded-xl border border-amber-200/15 bg-amber-200/[0.05] p-3.5 transition hover:bg-amber-200/[0.075]"
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-amber-200/[0.07] text-amber-100">
                <ShieldAlert className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-foreground">
                  {data.blocked} blocked {data.blocked === 1 ? "vote needs" : "votes need"} checking
                </span>
                <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                  Open Suspicious votes to see why they were flagged and what action was taken.
                </span>
              </span>
              <ArrowRight className="mt-2 size-4 shrink-0 text-muted-foreground" />
            </Link>
          ) : null}

          <AdminCard className="mb-4">
            <AdminCardHeader
              eyebrow="What to do next"
              title={nextAction.title}
              description={nextAction.description}
              action={
                <Link to={nextAction.to as any} className="admin-action-primary !min-h-10">
                  {nextAction.label} <ArrowRight className="size-4" />
                </Link>
              }
            />
          </AdminCard>

          <section className="mb-5">
            <p className="admin-section-label mb-2">Main voting pages</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <VotingPageLink
                to="/televoting/admin/rounds"
                icon={PlayCircle}
                title="Voting rounds and entries"
                description="Choose who can vote, which entries can receive points and when voting opens."
                detail={data.openRounds ? `${data.openRounds} open now` : `${data.rounds} created`}
              />
              <VotingPageLink
                to="/televoting/admin/results"
                icon={Trophy}
                title="Results"
                description="Check submitted votes, calculate the televote points and prepare the official result."
                detail={`${data.submissions} submitted votes`}
              />
              <VotingPageLink
                to="/televoting/admin/integrity"
                icon={ShieldAlert}
                title="Suspicious votes"
                description="Check votes that Solaris Studio flagged because their voting pattern may need a closer look."
                detail={data.blocked ? `${data.blocked} blocked votes` : "No blocked votes"}
              />
              <VotingPageLink
                to="/televoting/admin/analytics"
                icon={BarChart3}
                title="Voting statistics"
                description="See how many people voted, how points were spread and how countries and entries performed."
              />
            </div>
          </section>

          <AdminCard>
            <AdminCardHeader
              eyebrow="More voting pages"
              title="Extra result and history tools"
              description="These pages are useful when you need a closer look at results or past organizer actions."
            />
            <div className="divide-y divide-white/[0.07]">
              <AdminLinkRow
                to="/televoting/admin/combined"
                icon={Blend}
                title="Combined results"
                description="See how jury and televote points are put together for the final result."
              />
              <AdminLinkRow
                to="/televoting/admin/intelligence"
                icon={ShieldAlert}
                title="Voting patterns"
                description="Look more closely at repeated voting links and unusual patterns."
              />
              <AdminLinkRow
                to="/televoting/admin/audit-log"
                icon={ShieldAlert}
                title="Change history"
                description="See important organizer actions and decisions made about votes."
              />
            </div>
          </AdminCard>
        </>
      ) : (
        <AdminCard>
          <AdminEmptyState
            icon={PlayCircle}
            title="No voting information yet"
            description="Create a voting round to begin."
            action={
              <Link to="/televoting/admin/rounds" className="admin-action-primary">
                Create round
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
    <div className="min-w-0">
      <p className="numeric text-lg font-bold">{value}</p>
      <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{label}</p>
    </div>
  );
}

function VotingPageLink({
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
    <Link
      to={to as any}
      className="admin-card group flex min-h-28 min-w-0 items-start gap-3 p-3.5 transition hover:border-white/[0.16] hover:bg-white/[0.045]"
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-white/[0.07] bg-white/[0.03] text-sky-100">
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-foreground">{title}</span>
        <span className="mt-1.5 block text-xs leading-relaxed text-muted-foreground">{description}</span>
        {detail ? <span className="mt-2 block text-[11px] font-semibold text-sky-100/75">{detail}</span> : null}
      </span>
      <ArrowRight className="mt-1 size-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-foreground" />
    </Link>
  );
}

function AdminLinkRow({
  to,
  icon: Icon,
  title,
  description,
}: {
  to: string;
  icon: typeof ShieldAlert;
  title: string;
  description: string;
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
      <ArrowRight className="size-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5" />
    </Link>
  );
}
