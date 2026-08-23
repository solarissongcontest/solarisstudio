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
  SlidersHorizontal,
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

export const Route = createFileRoute("/confirmations/admin/")({
  head: () => ({
    meta: [
      { title: "Delegations — Solaris Organizer" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DelegationsAdminOverview,
});

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

  const totals = useMemo(() => {
    const responseCount = editions.reduce(
      (sum, edition) => sum + (edition.response_count ?? 0),
      0,
    );
    const rounds = editions.reduce((sum, edition) => sum + edition.rounds.length, 0);
    const openRounds = editions.reduce(
      (sum, edition) => sum + edition.rounds.filter((round) => round.status === "open").length,
      0,
    );
    return { responseCount, rounds, openRounds };
  }, [editions]);

  const activeOpenRounds = activeEdition?.rounds.filter((round) => round.status === "open") ?? [];
  const nextAction = !activeEdition
    ? {
        title: "Configure Confirmations for an edition",
        description: "Set the active edition before opening submission rounds.",
        to: "/confirmations/admin/editions",
        label: "Configure edition",
      }
    : triageCounts.review > 0
      ? {
          title: `Review ${triageCounts.review} ${triageCounts.review === 1 ? "submission" : "submissions"}`,
          description: "Red submissions contain song information that still needs an organizer decision.",
          to: "/confirmations/admin/responses",
          label: "Review responses",
        }
      : triageCounts.issue > 0
        ? {
            title: `${triageCounts.issue} ${triageCounts.issue === 1 ? "submission needs" : "submissions need"} fixing`,
            description: "Yellow submissions contain at least one declined song and need delegation attention.",
            to: "/confirmations/admin/responses",
            label: "Open responses",
          }
        : activeEdition.rounds.length === 0
          ? {
              title: "Create the first submission round",
              description: "Add a confirmation wave before delegations can submit responses.",
              to: "/confirmations/admin/rounds",
              label: "Create round",
            }
          : activeOpenRounds.length > 0
            ? {
                title: "Review incoming responses",
                description: `${activeOpenRounds.length} ${activeOpenRounds.length === 1 ? "round is" : "rounds are"} open and accepting submissions.`,
                to: "/confirmations/admin/responses",
                label: "Review responses",
              }
            : activeEdition.response_count > 0
              ? {
                  title: "Review submitted delegations",
                  description: `${activeEdition.response_count} responses are currently attached to ${formatEdition(activeEdition)}.`,
                  to: "/confirmations/admin/responses",
                  label: "Open responses",
                }
              : {
                  title: "Open or schedule a submission round",
                  description: "Rounds exist, but none are currently accepting new responses.",
                  to: "/confirmations/admin/rounds",
                  label: "Manage rounds",
                };

  return (
    <div className="mx-auto max-w-5xl">
      <AdminPageHeader
        eyebrow="Edition workflow"
        title="Delegations"
        description="Confirmations, entries, submission rounds and delegation access in one workspace."
        actions={
          <Link to="/confirmations" target="_blank" className="admin-action-secondary">
            <Globe2 className="size-4" /> Public form
          </Link>
        }
      />

      {loading ? (
        <AdminCard>
          <p className="py-6 text-center text-sm text-muted-foreground">Loading delegations…</p>
        </AdminCard>
      ) : error ? (
        <AdminCard>
          <div className="rounded-xl border border-rose-200/15 bg-rose-200/[0.055] p-4 text-sm leading-relaxed text-rose-100">
            {error}
          </div>
        </AdminCard>
      ) : (
        <>
          {activeEdition ? (
            <AdminCard strong className="mb-4">
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="admin-section-label">Active confirmation edition</p>
                  <h2 className="mt-1 truncate text-xl font-bold tracking-[-.025em]">
                    {formatEdition(activeEdition)}
                  </h2>
                  <p className="mt-1 truncate text-xs text-muted-foreground">{activeEdition.name}</p>
                </div>
                <AdminStatus tone={activeEdition.status === "active" ? "ready" : "neutral"}>
                  {activeEdition.status === "active" ? "Active" : activeEdition.status}
                </AdminStatus>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl border border-white/[0.06] bg-white/[0.018] p-3 text-center">
                <Metric label="Responses" value={activeEdition.response_count} />
                <Metric label="Rounds" value={activeEdition.rounds.length} />
                <Metric label="Open now" value={activeOpenRounds.length} />
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <AdminStatus tone={activeEdition.editing_enabled ? "info" : "neutral"}>
                  Editing {activeEdition.editing_enabled ? "enabled" : "disabled"}
                </AdminStatus>
                {activeOpenRounds.map((round) => (
                  <AdminStatus key={round.id} tone="ready">{round.name} open</AdminStatus>
                ))}
              </div>
            </AdminCard>
          ) : (
            <AdminCard className="mb-4">
              <AdminEmptyState
                icon={Flag}
                title="No Confirmations edition configured"
                description="Set up the active edition before opening delegation submissions."
                action={
                  <Link to="/confirmations/admin/editions" className="admin-action-primary">
                    Configure edition
                  </Link>
                }
              />
            </AdminCard>
          )}

          {activeEdition ? (
            <AdminCard className="mb-4">
              <AdminCardHeader
                eyebrow="Submission status"
                title="What the colours mean"
                description={`Live counts for ${formatEdition(activeEdition)}. These use the same rules as the full Responses page.`}
                action={
                  <Link to="/confirmations/admin/responses" className="admin-action-secondary !min-h-9">
                    View responses <ArrowRight className="size-3.5" />
                  </Link>
                }
              />
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <TriageMetric
                  state="review"
                  icon={CircleAlert}
                  label="Red · Needs review"
                  value={triageCounts.review}
                  description="Organizer still needs to review submitted song information."
                />
                <TriageMetric
                  state="issue"
                  icon={XCircle}
                  label="Yellow · Needs fixing"
                  value={triageCounts.issue}
                  description="A submitted song was declined and the delegation needs to fix or replace it."
                />
                <TriageMetric
                  state="ready"
                  icon={CheckCircle2}
                  label="Green · Ready"
                  value={triageCounts.ready}
                  description="Entry is accepted, or the NF is fully accepted and has a winner."
                />
                <TriageMetric
                  state="neutral"
                  icon={Clock3}
                  label="No glow · Waiting"
                  value={triageCounts.neutral}
                  description="Nothing is wrong, but the entry or NF winner is not decided yet, or the country is not participating."
                />
              </div>
            </AdminCard>
          ) : null}

          <AdminCard className="mb-4">
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

          <div className="mb-5 grid grid-cols-3 gap-2 sm:gap-3">
            <CompactMetric label="Responses" value={totals.responseCount} />
            <CompactMetric label="Rounds" value={totals.rounds} />
            <CompactMetric label="Open" value={totals.openRounds} />
          </div>

          <section className="mb-5">
            <p className="admin-section-label mb-2">Everyday workflow</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <WorkflowLink
                to="/confirmations/admin/responses"
                icon={FileText}
                title="Responses"
                description="Review confirmations, entries and National Final information."
                detail={activeEdition ? `${activeEdition.response_count} in ${formatEdition(activeEdition)}` : undefined}
              />
              <WorkflowLink
                to="/confirmations/admin/sync"
                icon={RefreshCw}
                title="Sync to Solaris"
                description="Choose a confirmation wave and a show, then sync every participating country and its canonical entry in one operation."
                detail="Round → show"
              />
              <WorkflowLink
                to="/confirmations/admin/countries"
                icon={Flag}
                title="Delegations"
                description="Country participation, selection methods and submitted entry details."
              />
              <WorkflowLink
                to="/confirmations/admin/rounds"
                icon={Layers3}
                title="Submission rounds"
                description="Open, close and schedule confirmation waves."
                detail={activeOpenRounds.length ? `${activeOpenRounds.length} open now` : "None open"}
              />
              <WorkflowLink
                to="/confirmations/admin/calendar"
                icon={CalendarDays}
                title="Calendar"
                description="Reveals, National Finals, results and round deadlines together."
              />
            </div>
          </section>

          <AdminCard>
            <AdminCardHeader
              eyebrow="Administration"
              title="Occasional tools"
              description="These controls matter, but they should not compete with everyday delegation work."
            />
            <div className="divide-y divide-white/[0.07]">
              <AdminLinkRow
                to="/confirmations/admin/editions"
                icon={SlidersHorizontal}
                title="Edition setup"
                description="Active edition and response-editing controls."
              />
              <AdminLinkRow
                to="/confirmations/admin/recovery-codes"
                icon={KeyRound}
                title="Recovery access"
                description="Help a delegation regain access to an existing response."
              />
              <AdminLinkRow
                to="/confirmations/admin/settings"
                icon={Settings2}
                title="Confirmation settings"
                description="Low-frequency form and workflow configuration."
              />
            </div>
          </AdminCard>
        </>
      )}
    </div>
  );
}

function formatEdition(edition: ConfirmationEdition) {
  return `SSC ${edition.edition_number}`;
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-0">
      <p className="numeric text-lg font-bold">{value}</p>
      <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{label}</p>
    </div>
  );
}

function CompactMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="admin-card px-3 py-3 text-center">
      <p className="numeric text-xl font-bold">{value}</p>
      <p className="mt-1 text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}

function TriageMetric({
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
      ? "border-rose-400/60 bg-rose-400/[0.055] shadow-[0_0_18px_rgba(251,113,133,0.25),0_0_38px_rgba(244,63,94,0.11)]"
      : state === "issue"
        ? "border-amber-300/55 bg-amber-300/[0.05] shadow-[0_0_18px_rgba(252,211,77,0.22),0_0_38px_rgba(245,158,11,0.1)]"
        : state === "ready"
          ? "border-emerald-300/50 bg-emerald-300/[0.045] shadow-[0_0_18px_rgba(110,231,183,0.2),0_0_38px_rgba(16,185,129,0.09)]"
          : "border-white/[0.08] bg-white/[0.018]";

  return (
    <div className={`rounded-xl border p-3 ${className}`}>
      <div className="flex items-center justify-between gap-2">
        <Icon className="size-4 shrink-0 text-muted-foreground" />
        <span className="numeric text-2xl font-black">{value}</span>
      </div>
      <p className="mt-2 text-xs font-bold text-foreground">{label}</p>
      <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{description}</p>
    </div>
  );
}

function WorkflowLink({
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
  icon: typeof Settings2;
  title: string;
  description: string;
}) {
  return (
    <Link to={to as any} className="admin-action-row group">
      <span className="admin-action-row-icon"><Icon className="size-4" /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{title}</span>
        <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{description}</span>
      </span>
      <ArrowRight className="size-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5" />
    </Link>
  );
}
