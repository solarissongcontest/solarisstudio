import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  FileText,
  Flag,
  KeyRound,
  Layers3,
  Settings2,
} from "lucide-react";

import {
  AdminCard,
  AdminCardHeader,
  AdminEmptyState,
  AdminPageHeader,
  AdminProgress,
  AdminStatus,
} from "@/components/admin/AdminUI";
import {
  ConfirmationsAdminNav,
  DelegationQuickLink,
} from "@/components/confirmations/ConfirmationsAdminNav";
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
  component: ConfirmationsAdminOverview,
});

type ResponseSummary = {
  id: string;
  country: string;
  participating: boolean;
  selection_method: string | null;
  entry_unknown: boolean;
  nf_entries_unknown: boolean;
  reviewed: boolean;
  updated_at: string;
  internal_entries: {
    song_title: string | null;
    review_status: string | null;
  } | null;
  national_finals: {
    winning_entry_id: string | null;
    national_final_entries: Array<{
      id: string;
      song_title: string | null;
      review_status: string | null;
      removed?: boolean | null;
    }>;
  } | null;
  editions: { id: string; edition_number: number; name: string } | null;
};

function attentionReason(row: ResponseSummary) {
  if (!row.participating) return null;
  if (!row.reviewed) return "Response still needs organizer review";

  if (row.selection_method === "internal") {
    if (row.entry_unknown || !row.internal_entries?.song_title) return "Internal selection is still missing its song";
    if (row.internal_entries.review_status === "declined") return "Submitted internal entry was declined";
    return null;
  }

  if (row.selection_method === "national_final") {
    const active = (row.national_finals?.national_final_entries ?? []).filter(
      (entry) => !entry.removed && entry.review_status !== "removed",
    );
    if (row.nf_entries_unknown || !active.length) return "National Final entries are still missing";
    if (active.some((entry) => entry.review_status === "declined")) return "National Final has declined entries to resolve";
    if (active.every((entry) => entry.review_status === "accepted") && !row.national_finals?.winning_entry_id) {
      return "National Final is waiting for a winning entry";
    }
  }

  if (!row.selection_method) return "Selection method has not been confirmed";
  return null;
}

function ConfirmationsAdminOverview() {
  const [editions, setEditions] = useState<ConfirmationEdition[]>([]);
  const [responses, setResponses] = useState<ResponseSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const [editionRows, responseResult] = await Promise.all([
          loadConfirmationEditions(),
          confirmationsSupabase.rpc("admin_confirmation_responses"),
        ]);
        if (responseResult.error) throw responseResult.error;
        if (!alive) return;
        setEditions(editionRows);
        setResponses(
          Array.isArray(responseResult.data)
            ? (responseResult.data as unknown as ResponseSummary[])
            : [],
        );
      } catch (caught) {
        if (alive) {
          setError(caught instanceof Error ? caught.message : "Could not load delegation workspace.");
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

  const scopedResponses = useMemo(
    () =>
      activeEdition
        ? responses.filter((response) => response.editions?.id === activeEdition.id)
        : responses,
    [activeEdition, responses],
  );

  const metrics = useMemo(() => {
    const participating = scopedResponses.filter((row) => row.participating).length;
    const notParticipating = scopedResponses.filter((row) => !row.participating).length;
    const reviewed = scopedResponses.filter((row) => row.reviewed).length;
    const openRounds = activeEdition?.rounds.filter((round) => round.status === "open").length ?? 0;
    const attention = scopedResponses
      .map((row) => ({ row, reason: attentionReason(row) }))
      .filter((item): item is { row: ResponseSummary; reason: string } => Boolean(item.reason))
      .sort(
        (a, b) =>
          new Date(b.row.updated_at).getTime() - new Date(a.row.updated_at).getTime(),
      );

    return {
      total: scopedResponses.length,
      participating,
      notParticipating,
      reviewed,
      openRounds,
      attention,
      reviewProgress: scopedResponses.length
        ? Math.round((reviewed / scopedResponses.length) * 100)
        : 0,
    };
  }, [activeEdition, scopedResponses]);

  return (
    <div className="mx-auto max-w-5xl">
      <AdminPageHeader
        eyebrow="Edition workflow"
        title="Delegations"
        description="Confirm participation, review entries and keep every delegation moving without bouncing between separate admin tools."
        actions={
          <Link to="/confirmations" className="admin-action-secondary">
            Public portal
          </Link>
        }
      />

      <ConfirmationsAdminNav current="/confirmations/admin" />

      {loading ? (
        <AdminCard className="py-10 text-center text-sm text-muted-foreground">
          Loading delegations…
        </AdminCard>
      ) : error ? (
        <AdminCard className="border-rose-200/15 bg-rose-200/[0.045]">
          <div className="flex items-start gap-3 text-rose-100">
            <AlertTriangle className="mt-0.5 size-5 shrink-0" />
            <div>
              <p className="text-sm font-semibold">Delegations could not be loaded</p>
              <p className="mt-1 text-xs leading-relaxed text-rose-100/70">{error}</p>
            </div>
          </div>
        </AdminCard>
      ) : !activeEdition ? (
        <AdminCard>
          <AdminEmptyState
            icon={Flag}
            title="No Confirmations edition"
            description="Create or activate a Confirmations edition before managing delegation responses."
            action={
              <Link to="/confirmations/admin/editions" className="admin-action-primary">
                Manage Confirmations editions
              </Link>
            }
          />
        </AdminCard>
      ) : (
        <>
          <AdminCard strong className="mb-4">
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="admin-section-label">Active confirmations edition</p>
                <h2 className="mt-1 truncate text-xl font-bold tracking-[-.025em]">
                  SSC {activeEdition.edition_number} · {activeEdition.name}
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  {activeEdition.rounds.length} round{activeEdition.rounds.length === 1 ? "" : "s"} · {metrics.openRounds} open now
                </p>
              </div>
              <AdminStatus tone={activeEdition.status === "active" ? "ready" : "neutral"}>
                {activeEdition.status}
              </AdminStatus>
            </div>

            <div className="mt-5 grid grid-cols-3 gap-2 text-center">
              <Metric label="Responded" value={metrics.total} />
              <Metric label="Participating" value={metrics.participating} />
              <Metric label="Not taking part" value={metrics.notParticipating} />
            </div>

            <div className="mt-5 rounded-xl border border-white/[0.06] bg-white/[0.018] p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">Organizer review</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {metrics.reviewed} of {metrics.total} responses reviewed
                  </p>
                </div>
                <span className="numeric text-sm font-bold">{metrics.reviewProgress}%</span>
              </div>
              <AdminProgress value={metrics.reviewProgress} className="mt-3" />
            </div>
          </AdminCard>

          <AdminCard className="mb-4">
            <AdminCardHeader
              eyebrow="Next actions"
              title="Needs attention"
              description="The most useful queue first. Open an item and fix the actual delegation instead of hunting through dashboards."
              action={
                metrics.attention.length ? (
                  <AdminStatus tone="attention">{metrics.attention.length}</AdminStatus>
                ) : (
                  <AdminStatus tone="ready">Clear</AdminStatus>
                )
              }
            />

            {metrics.attention.length ? (
              <div className="divide-y divide-white/[0.07]">
                {metrics.attention.slice(0, 6).map(({ row, reason }) => (
                  <Link
                    key={row.id}
                    to="/confirmations/admin/responses/$id"
                    params={{ id: row.id }}
                    className="admin-action-row"
                  >
                    <span className="admin-action-row-icon">
                      <AlertTriangle className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{row.country}</span>
                      <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{reason}</span>
                    </span>
                  </Link>
                ))}
                {metrics.attention.length > 6 ? (
                  <Link to="/confirmations/admin/responses" className="admin-action-row">
                    <span className="min-w-0 flex-1 text-sm font-semibold">
                      Review all {metrics.attention.length} items
                    </span>
                  </Link>
                ) : null}
              </div>
            ) : (
              <AdminEmptyState
                icon={CheckCircle2}
                title="Nothing urgent"
                description="Every received response currently passes the basic delegation checks available here."
              />
            )}
          </AdminCard>

          <AdminCard className="mb-4">
            <AdminCardHeader eyebrow="Workflows" title="Delegation work" />
            <div className="divide-y divide-white/[0.07]">
              <DelegationQuickLink
                to="/confirmations/admin/responses"
                title="Review responses"
                description="Participation decisions, songs, National Finals and organizer review."
              />
              <DelegationQuickLink
                to="/confirmations/admin/countries"
                title="Country status"
                description="See each delegation once and what it still needs."
              />
              <DelegationQuickLink
                to="/confirmations/admin/rounds"
                title="Submission rounds"
                description="Open, close and schedule confirmation waves."
              />
            </div>
          </AdminCard>

          <AdminCard>
            <AdminCardHeader
              eyebrow="Secondary"
              title="Schedule & support"
              description="Useful operational tools that do not need permanent top-level navigation."
            />
            <div className="grid gap-2 sm:grid-cols-3">
              <SmallLink to="/confirmations/admin/calendar" icon={CalendarDays} label="Calendar" />
              <SmallLink to="/confirmations/admin/recovery-codes" icon={KeyRound} label="Recovery access" />
              <SmallLink to="/confirmations/admin/settings" icon={Settings2} label="Advanced settings" />
            </div>
          </AdminCard>
        </>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.018] px-2 py-3">
      <p className="numeric text-xl font-bold">{value}</p>
      <p className="mt-1 text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}

function SmallLink({
  to,
  icon: Icon,
  label,
}: {
  to:
    | "/confirmations/admin/calendar"
    | "/confirmations/admin/recovery-codes"
    | "/confirmations/admin/settings";
  icon: typeof FileText;
  label: string;
}) {
  return (
    <Link
      to={to}
      className="flex min-h-12 items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 text-sm font-semibold transition hover:bg-white/[0.04]"
    >
      <Icon className="size-4 text-muted-foreground" />
      {label}
    </Link>
  );
}
