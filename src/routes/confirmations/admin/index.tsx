import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  CircleAlert,
  Clock3,
  FileText,
  Flag,
  Globe2,
  KeyRound,
  Layers3,
  RefreshCw,
  Settings2,
  XCircle,
} from "lucide-react";

import {
  AdminCard,
  AdminCardHeader,
  AdminEmptyState,
  AdminPageHeader,
  AdminStatus,
} from "@/components/admin/AdminUI";
import {
  loadConfirmationEditions,
  type ConfirmationEdition,
} from "@/integrations/confirmations/admin";
import { confirmationsSupabase } from "@/integrations/confirmations/client";

type Entry = {
  id: string;
  song_title: string | null;
  review_status: string | null;
  removed?: boolean | null;
};

type ResponseRow = {
  id: string;
  country: string;
  participating: boolean;
  selection_method: string | null;
  entry_unknown: boolean;
  nf_entries_unknown: boolean;
  internal_entries: Entry | null;
  national_finals: {
    id: string;
    winning_entry_id: string | null;
    national_final_entries: Entry[];
  } | null;
  editions: { id: string } | null;
};

type CardState = "review" | "issue" | "ready" | "neutral";

export const Route = createFileRoute("/confirmations/admin/")({
  head: () => ({
    meta: [
      { title: "Delegations — Solaris Organizer" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DelegationsAdminOverview,
});

function activeNfEntries(row: ResponseRow) {
  return (row.national_finals?.national_final_entries ?? []).filter(
    (entry) => !entry.removed && entry.review_status !== "removed",
  );
}

function responseCardState(row: ResponseRow): CardState {
  if (!row.participating) return "neutral";

  if (row.selection_method === "internal") {
    const entry = row.internal_entries;
    if (!entry?.song_title || row.entry_unknown) return "neutral";
    if (entry.review_status === "declined" || entry.review_status === "removed") return "issue";
    if (!entry.review_status || entry.review_status === "pending") return "review";
    if (entry.review_status === "accepted") return "ready";
    return "neutral";
  }

  if (row.selection_method === "national_final") {
    const entries = activeNfEntries(row);
    if (!entries.length || row.nf_entries_unknown) return "neutral";
    if (entries.some((entry) => entry.review_status === "declined")) return "issue";
    if (entries.some((entry) => !entry.review_status || entry.review_status === "pending")) return "review";
    if (!row.national_finals?.winning_entry_id) return "neutral";
    return "ready";
  }

  return "neutral";
}

function DelegationsAdminOverview() {
  const [editions, setEditions] = useState<ConfirmationEdition[]>([]);
  const [responses, setResponses] = useState<ResponseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    void (async () => {
      try {
        const [editionRows, responsesResult] = await Promise.all([
          loadConfirmationEditions(),
          confirmationsSupabase.rpc("admin_confirmation_responses"),
        ]);
        if (responsesResult.error) throw responsesResult.error;
        if (alive) {
          setEditions(editionRows);
          setResponses(
            Array.isArray(responsesResult.data)
              ? (responsesResult.data as unknown as ResponseRow[])
              : [],
          );
        }
      } catch (caught) {
        if (alive) {
          setError(caught instanceof Error ? caught.message : "Could not load delegation data.");
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  const activeEdition = useMemo(
    () => editions.find((edition) => edition.status === "active") ?? editions[0] ?? null,
    [editions],
  );

  const activeResponses = useMemo(
    () => responses.filter((response) => response.editions?.id === activeEdition?.id),
    [activeEdition?.id, responses],
  );

  const triageCounts = useMemo(() => {
    const counts = { review: 0, issue: 0, ready: 0, neutral: 0 };
    activeResponses.forEach((response) => {
      counts[responseCardState(response)] += 1;
    });
    return counts;
  }, [activeResponses]);

  const activeOpenRounds = activeEdition?.rounds.filter((round) => round.status === "open") ?? [];

  const nextAction = !activeEdition
    ? {
        title: "Set up delegation submissions",
        description: "Choose the active edition before opening submission rounds.",
        to: "/confirmations/admin/editions",
        label: "Configure edition",
      }
    : triageCounts.review > 0
      ? {
          title: `Review ${triageCounts.review} ${triageCounts.review === 1 ? "submission" : "submissions"}`,
          description: "These entries still need an organizer decision.",
          to: "/confirmations/admin/responses",
          label: "Review responses",
        }
      : triageCounts.issue > 0
        ? {
            title: `${triageCounts.issue} ${triageCounts.issue === 1 ? "delegation needs" : "delegations need"} changes`,
            description: "A declined entry needs to be corrected or replaced by the delegation.",
            to: "/confirmations/admin/responses",
            label: "Open responses",
          }
        : activeEdition.rounds.length === 0
          ? {
              title: "Create the first submission round",
              description: "Delegations need a round before they can submit.",
              to: "/confirmations/admin/rounds",
              label: "Create round",
            }
          : activeOpenRounds.length > 0
            ? {
                title: "Keep an eye on incoming responses",
                description: `${activeOpenRounds.length} ${activeOpenRounds.length === 1 ? "round is" : "rounds are"} accepting submissions now.`,
                to: "/confirmations/admin/responses",
                label: "Open responses",
              }
            : {
                title: "No delegation action needs urgent attention",
                description: "Review responses or prepare the next submission round when you are ready.",
                to: "/confirmations/admin/responses",
                label: "View responses",
              };

  return (
    <div className="mx-auto max-w-5xl">
      <AdminPageHeader
        eyebrow="Current edition"
        title="Delegations"
        description="Participation, submissions, rounds and delegation access."
        actions={
          <Link to="/confirmations" target="_blank" className="admin-action-secondary">
            <Globe2 className="size-4" /> Public form
          </Link>
        }
      />

      {loading ? (
        <AdminCard>
          <p className="py-7 text-center text-sm text-muted-foreground">Loading delegation status…</p>
        </AdminCard>
      ) : error ? (
        <AdminCard>
          <div className="rounded-xl border border-rose-200/15 bg-rose-200/[0.055] p-4 text-sm leading-relaxed text-rose-100">
            {error}
          </div>
        </AdminCard>
      ) : !activeEdition ? (
        <AdminCard>
          <AdminEmptyState
            icon={Flag}
            title="No delegation edition configured"
            description="Set the active edition before opening delegation submissions."
            action={
              <Link to="/confirmations/admin/editions" className="admin-action-primary">
                Configure edition
              </Link>
            }
          />
        </AdminCard>
      ) : (
        <div className="space-y-4">
          <AdminCard strong>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-xl font-bold tracking-[-.025em]">{formatEdition(activeEdition)}</h2>
                  <AdminStatus tone={activeEdition.status === "active" ? "ready" : "neutral"}>
                    {activeEdition.status === "active" ? "Active" : activeEdition.status}
                  </AdminStatus>
                  {activeOpenRounds.length > 0 ? <AdminStatus tone="ready">Submissions open</AdminStatus> : null}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{activeEdition.name}</p>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center sm:min-w-[18rem]">
                <Metric label="Responses" value={activeEdition.response_count} />
                <Metric label="Ready" value={triageCounts.ready} />
                <Metric label="Open rounds" value={activeOpenRounds.length} />
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

          <section>
            <div className="mb-2 flex items-end justify-between gap-3 px-0.5">
              <div>
                <p className="admin-section-label">Response status</p>
                <p className="mt-1 text-xs text-muted-foreground">Click a status to open the response queue.</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
              <TriageLink
                state="review"
                icon={CircleAlert}
                label="Needs review"
                value={triageCounts.review}
                description="Organizer decision"
              />
              <TriageLink
                state="issue"
                icon={XCircle}
                label="Needs changes"
                value={triageCounts.issue}
                description="Delegation action"
              />
              <TriageLink
                state="ready"
                icon={CheckCircle2}
                label="Ready"
                value={triageCounts.ready}
                description="Accepted"
              />
              <TriageLink
                state="neutral"
                icon={Clock3}
                label="Waiting"
                value={triageCounts.neutral}
                description="No action yet"
              />
            </div>
          </section>

          <AdminCard>
            <AdminCardHeader
              eyebrow="Workspaces"
              title="What do you need to do?"
              description="The common delegation tasks are kept here. Less-used setup is hidden below."
            />
            <div className="divide-y divide-white/[0.07]">
              <WorkspaceRow
                to="/confirmations/admin/responses"
                icon={FileText}
                title="Review responses"
                description="Check participation, entries and National Final information."
                detail={`${activeEdition.response_count} responses`}
              />
              <WorkspaceRow
                to="/confirmations/admin/rounds"
                icon={Layers3}
                title="Submission rounds"
                description="Open, close or schedule delegation submission waves."
                detail={activeOpenRounds.length ? `${activeOpenRounds.length} open now` : "None open"}
              />
              <WorkspaceRow
                to="/confirmations/admin/calendar"
                icon={CalendarDays}
                title="Calendar"
                description="See rounds, National Finals, reveals and deadlines together."
              />
              <WorkspaceRow
                to="/confirmations/admin/recovery-codes"
                icon={KeyRound}
                title="Delegation access"
                description="Help a delegation regain access to an existing response."
              />
            </div>
          </AdminCard>

          <details className="admin-card group overflow-hidden">
            <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 text-sm font-semibold text-muted-foreground transition hover:text-foreground">
              Advanced delegation tools
              <span className="text-xs transition group-open:rotate-90">›</span>
            </summary>
            <div className="border-t border-white/[0.07] px-1 pb-1">
              <WorkspaceRow
                to="/confirmations/admin/sync"
                icon={RefreshCw}
                title="Sync to contest"
                description="Sync a confirmed wave into a Solaris show and its canonical entries."
              />
              <WorkspaceRow
                to="/confirmations/admin/editions"
                icon={Flag}
                title="Delegation edition setup"
                description="Change the active edition and response-editing controls."
              />
              <WorkspaceRow
                to="/confirmations/admin/settings"
                icon={Settings2}
                title="Submission settings"
                description="Low-frequency form and workflow configuration."
              />
            </div>
          </details>
        </div>
      )}
    </div>
  );
}

function formatEdition(edition: ConfirmationEdition) {
  return `SSC ${edition.edition_number}`;
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.018] px-2 py-2.5">
      <p className="numeric text-lg font-bold">{value}</p>
      <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{label}</p>
    </div>
  );
}

function TriageLink({
  state,
  icon: Icon,
  label,
  value,
  description,
}: {
  state: CardState;
  icon: typeof CircleAlert;
  label: string;
  value: number;
  description: string;
}) {
  const className =
    state === "review"
      ? "border-rose-400/35 bg-rose-400/[0.04]"
      : state === "issue"
        ? "border-amber-300/30 bg-amber-300/[0.035]"
        : state === "ready"
          ? "border-emerald-300/25 bg-emerald-300/[0.03]"
          : "border-white/[0.08] bg-white/[0.018]";

  return (
    <Link
      to="/confirmations/admin/responses"
      className={`group rounded-xl border p-3 transition hover:bg-white/[0.045] ${className}`}
    >
      <div className="flex items-center justify-between gap-2">
        <Icon className="size-4 text-muted-foreground" />
        <span className="numeric text-2xl font-black">{value}</span>
      </div>
      <p className="mt-2 text-xs font-bold text-foreground">{label}</p>
      <p className="mt-0.5 text-[10px] text-muted-foreground">{description}</p>
    </Link>
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
  icon: typeof Flag;
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
