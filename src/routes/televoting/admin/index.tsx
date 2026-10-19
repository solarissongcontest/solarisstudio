import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowRight,
  BarChart3,
  Blend,
  FlaskConical,
  Globe2,
  History,
  Network,
  PlayCircle,
  Settings2,
  ShieldAlert,
  Trophy,
  Users,
} from "lucide-react";

import {
  AdminCard,
  AdminCardHeader,
  AdminEmptyState,
  AdminPageHeader,
  AdminStatus,
} from "@/components/admin/AdminUI";
import { useAdminContext } from "@/components/admin/AdminContext";
import { getMergedTelevotingOverview } from "@/integrations/televoting/admin-data.functions";

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
  const { editionId, editionSlug } = useAdminContext();
  const getOverview = useServerFn(getMergedTelevotingOverview);

  const { data, isLoading, error } = useQuery({
    queryKey: ["merged-televoting-admin-overview", editionId ?? "none"],
    enabled: Boolean(editionId),
    queryFn: () => getOverview({ data: { editionId: editionId! } }),
    staleTime: 10_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });

  const recommendedAction = data?.recommendedAction ?? null;
  const overallBlocked = (data?.integrity.outstanding ?? 0) + (data?.jury.blockerCount ?? 0) > 0;

  return (
    <div className="mx-auto max-w-5xl" data-v3-organizer-voting="">
      <AdminPageHeader
        eyebrow="Current edition"
        title="Voting"
        description="Jury, public voting, integrity and official results are operated from one exact-edition System projection. Missing data is never treated as a healthy Jury state."
        actions={
          <Link to="/televoting" target="_blank" className="admin-action-secondary">
            <Globe2 className="size-4" /> Public voting
          </Link>
        }
      />

      {!editionId ? (
        <AdminCard>
          <AdminEmptyState
            icon={Trophy}
            title="Select an edition"
            description="Voting is edition-scoped operational work. Select the exact Organizer edition before opening its voting state; Solaris will not substitute a globally active or newest edition."
          />
        </AdminCard>
      ) : isLoading ? (
        <AdminCard>
          <p className="py-7 text-center text-sm text-muted-foreground">Loading voting status…</p>
        </AdminCard>
      ) : error ? (
        <AdminCard>
          <div className="rounded-xl border border-rose-200/15 bg-rose-200/[0.055] p-4">
            <p className="text-sm font-semibold text-rose-100">Voting information could not be loaded</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              The selected edition was not changed. Retry this page or check System health if the problem continues.
            </p>
            {error instanceof Error && error.message ? (
              <details className="mt-3 text-[11px] text-muted-foreground">
                <summary className="cursor-pointer font-semibold text-rose-100/80">Technical details</summary>
                <p className="mt-2 break-words leading-relaxed">{error.message}</p>
              </details>
            ) : null}
          </div>
        </AdminCard>
      ) : data ? (
        <div className="space-y-4">
          <AdminCard strong>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="truncate text-xl font-bold tracking-[-.025em]">
                    {data.edition.name}
                  </h2>
                  <AdminStatus
                    tone={
                      overallBlocked
                        ? "blocked"
                        : data.jury.openWindows > 0 || data.televote.openRounds > 0
                          ? "ready"
                          : "neutral"
                    }
                  >
                    {overallBlocked
                      ? `${data.integrity.outstanding + data.jury.blockerCount} voting attention`
                      : data.jury.openWindows > 0 || data.televote.openRounds > 0
                        ? "Voting active"
                        : "Voting overview"}
                  </AdminStatus>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  State {shortVersion(data.stateVersion)} · server {formatServerTime(data.serverTime)}
                </p>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center sm:min-w-[18rem]">
                <Metric label="Jury expected" value={data.jury.expected} />
                <Metric label="Public ballots" value={data.televote.submissions} />
                <Metric label="Integrity" value={data.integrity.outstanding} />
              </div>
            </div>
          </AdminCard>

          {recommendedAction ? (
            <AdminCard>
              <AdminCardHeader
                eyebrow="Server-recommended next action"
                title={recommendedAction.label}
                description={recommendedAction.reason}
                action={
                  <Link to={recommendedAction.route as any} className="admin-action-primary !min-h-10">
                    Open <ArrowRight className="size-4" />
                  </Link>
                }
              />
            </AdminCard>
          ) : (
            <AdminCard>
              <AdminCardHeader
                eyebrow="Next action"
                title="No voting action is recommended by the current projection"
                description="This is not a generic all-clear. Results readiness remains owned by the canonical Results workspace, and specialist configuration remains available below."
                action={
                  <Link to="/admin/results" className="admin-action-secondary !min-h-10">
                    Results authority <ArrowRight className="size-4" />
                  </Link>
                }
              />
            </AdminCard>
          )}

          <section className="grid gap-4 lg:grid-cols-2">
            <AdminCard>
              <AdminCardHeader
                eyebrow="Jury"
                title={juryTitle(data.jury.state)}
                description={juryDescription(data.jury)}
                action={
                  editionSlug ? (
                    <Link to={`/admin/jury/${editionSlug}`} className="admin-action-secondary !min-h-10">
                      Open Jury <ArrowRight className="size-4" />
                    </Link>
                  ) : null
                }
              />
              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                <Metric label="Valid" value={data.jury.valid} />
                <Metric label="Missing" value={data.jury.missing} />
                <Metric label="Review" value={data.jury.needsReview + data.jury.invalidated} />
              </div>
              {data.jury.shows.length ? (
                <div className="mt-4 divide-y divide-white/[0.07] border-t border-white/[0.07]">
                  {data.jury.shows.map((show) => (
                    <div key={show.showId} className="flex items-center justify-between gap-3 py-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{show.showName}</p>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          {show.expected} expected · {show.valid} valid · {show.didNotVote} did not vote
                        </p>
                      </div>
                      <AdminStatus tone={show.blockers > 0 ? "attention" : show.configured ? "neutral" : "blocked"}>
                        {show.blockers > 0
                          ? `${show.blockers} attention`
                          : show.configured
                            ? show.windowStatus
                            : "Not configured"}
                      </AdminStatus>
                    </div>
                  ))}
                  {data.jury.showSummaryTruncated ? (
                    <p className="py-3 text-xs text-muted-foreground">
                      Showing the first {data.jury.showSummaryLimit} shows. Edition totals above include every show.
                    </p>
                  ) : null}
                </div>
              ) : null}
            </AdminCard>

            <AdminCard>
              <AdminCardHeader
                eyebrow="Public vote"
                title={
                  !data.televote.linked
                    ? "Voting service not linked"
                    : data.televote.openRounds > 0
                      ? `${data.televote.openRounds} public voting round${data.televote.openRounds === 1 ? "" : "s"} open`
                      : `${data.televote.rounds} public voting round${data.televote.rounds === 1 ? "" : "s"}`
                }
                description={`${data.televote.submissions} submitted ballots · ${data.televote.blocked} blocked by integrity checks.`}
                action={
                  <Link to="/televoting/admin/rounds" className="admin-action-secondary !min-h-10">
                    Open rounds <ArrowRight className="size-4" />
                  </Link>
                }
              />
              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                <Metric label="Rounds" value={data.televote.rounds} />
                <Metric label="Ballots" value={data.televote.submissions} />
                <Metric label="Blocked" value={data.televote.blocked} />
              </div>
            </AdminCard>
          </section>

          <AdminCard>
            <AdminCardHeader
              eyebrow="Voting workspace"
              title="Operate the current voting state"
              description="Core operations stay prominent; analytics and rehearsal tools remain deliberately secondary."
            />
            <div className="divide-y divide-white/[0.07]">
              {editionSlug ? (
                <WorkspaceRow
                  to={`/admin/jury/${editionSlug}`}
                  icon={Users}
                  title="Jury"
                  description="Manage the selected edition's jury roster, ballots, did-not-vote state and governed ballot review."
                  detail={juryWorkspaceDetail(data.jury)}
                />
              ) : (
                <WorkspaceUnavailableRow
                  icon={Users}
                  title="Jury"
                  description="Jury operations become available after the selected edition identity has resolved. Solaris will not guess an edition slug."
                />
              )}
              {editionSlug ? (
                <WorkspaceRow
                  to={`/admin/voting-system/${editionSlug}`}
                  icon={Settings2}
                  title="Voting rules"
                  description="Review point scales, jury/public weighting, self-voting, qualifiers and tie-break rules for the selected edition's shows."
                  detail="Review before changes"
                />
              ) : (
                <WorkspaceUnavailableRow
                  icon={Settings2}
                  title="Voting rules"
                  description="Voting rules become available after the selected edition identity has resolved. Solaris will not guess an edition slug."
                />
              )}
              <WorkspaceRow
                to="/televoting/admin/rounds"
                icon={PlayCircle}
                title="Public voting rounds & entries"
                description="Choose eligible entries and countries, then operate the public voting round lifecycle."
                detail={data.televote.openRounds ? `${data.televote.openRounds} open now` : `${data.televote.rounds} configured`}
              />
              <WorkspaceRow
                to="/televoting/admin/integrity"
                icon={ShieldAlert}
                title="Integrity review"
                description="Review ballots Solaris flagged and record organizer decisions."
                detail={
                  data.integrity.outstanding
                    ? `${data.integrity.outstanding} voting items need attention`
                    : "No unresolved voting integrity state"
                }
              />
              <WorkspaceRow
                to="/televoting/admin/results"
                icon={Trophy}
                title="Public vote results"
                description="Inspect the canonical public-vote result before it enters the official result lifecycle."
                detail={`${data.televote.submissions} ballots`}
              />
              <WorkspaceRow
                to={data.results.route}
                icon={Trophy}
                title="Official results"
                description={data.results.note}
                detail="Separate canonical authority"
              />
            </div>
          </AdminCard>

          <details className="admin-card group overflow-hidden">
            <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 text-sm font-semibold text-muted-foreground transition hover:text-foreground">
              Advanced voting tools
              <span className="text-xs transition group-open:rotate-90">›</span>
            </summary>
            <div className="border-t border-white/[0.07] px-1 pb-1">
              <WorkspaceRow
                to="/admin/friend-voting"
                icon={Network}
                title="Friend-voting intelligence"
                description="Historical relationships, reciprocity and HOD-aware network analysis."
              />
              <WorkspaceRow
                to="/televoting/admin/analytics"
                icon={BarChart3}
                title="Voting analytics"
                description="Turnout, point distribution and entry performance."
              />
              <WorkspaceRow
                to="/televoting/admin/combined"
                icon={Blend}
                title="Combined result tools"
                description="Inspect how jury and public voting are combined."
              />
              <WorkspaceRow
                to="/televoting/admin/result-integrity"
                icon={ShieldAlert}
                title="Result integrity"
                description="Review result sensitivity, support concentration and influence evidence before release."
              />
              <WorkspaceRow
                to="/televoting/admin/integrity-declarations"
                icon={ShieldAlert}
                title="Integrity declarations"
                description="Review declaration trails attached to voting submissions."
              />
              <WorkspaceRow
                to="/televoting/admin/audit-log"
                icon={History}
                title="Voting audit log"
                description="Review important organizer actions and integrity decisions."
              />
              <WorkspaceRow
                to="/televoting/admin/backtest"
                icon={FlaskConical}
                title="Result backtest"
                description="Rehearse historical result and integrity scenarios without changing official state."
              />
              <WorkspaceRow
                to="/televoting/admin/editions"
                icon={Trophy}
                title="Voting edition links"
                description="Inspect the voting service projection of Solaris editions."
              />
            </div>
          </details>
        </div>
      ) : (
        <AdminCard>
          <AdminEmptyState
            icon={PlayCircle}
            title="Voting state unavailable"
            description="Solaris did not receive an authoritative voting overview for the selected edition. It will not infer zero rounds or a healthy state from missing data."
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

function juryTitle(state: "not_configured" | "attention" | "active" | "ready") {
  if (state === "not_configured") return "Jury is not fully configured";
  if (state === "attention") return "Jury needs attention";
  if (state === "active") return "Jury voting is active";
  return "Jury state is ready";
}

function juryDescription(jury: {
  showCount: number;
  configuredShowCount: number;
  expected: number;
  valid: number;
  didNotVote: number;
  missing: number;
  needsReview: number;
  invalidated: number;
}) {
  if (jury.showCount === 0) return "No shows exist in the selected edition, so Solaris does not fabricate Jury readiness.";
  if (jury.configuredShowCount === 0) return "No edition show has both Jury enabled and a configured voter roster.";
  return `${jury.valid} valid · ${jury.didNotVote} did not vote · ${jury.missing} missing · ${jury.needsReview + jury.invalidated} need review across ${jury.configuredShowCount} configured show${jury.configuredShowCount === 1 ? "" : "s"}.`;
}

function juryWorkspaceDetail(jury: {
  state: "not_configured" | "attention" | "active" | "ready";
  blockerCount: number;
  openWindows: number;
}) {
  if (jury.blockerCount > 0) return `${jury.blockerCount} attention`;
  if (jury.openWindows > 0) return `${jury.openWindows} open now`;
  if (jury.state === "not_configured") return "Setup required";
  return "No current blocker";
}

function shortVersion(value: string) {
  return value.length > 12 ? `${value.slice(0, 8)}…${value.slice(-4)}` : value;
}

function formatServerTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
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

function WorkspaceUnavailableRow({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof PlayCircle;
  title: string;
  description: string;
}) {
  return (
    <div className="admin-action-row opacity-70" aria-disabled="true">
      <span className="admin-action-row-icon">
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{title}</span>
        <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{description}</span>
      </span>
      <AdminStatus tone="neutral">Context required</AdminStatus>
    </div>
  );
}
