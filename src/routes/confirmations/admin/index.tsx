import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  ChevronRight,
  FileText,
  Flag,
  KeyRound,
  Layers3,
  Settings2,
  ShieldAlert,
} from "lucide-react";

import {
  AdminActionItem,
  AdminCard,
  AdminCardHeader,
  AdminEmptyState,
  AdminMoreMenu,
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
      { title: "Delegations — Solaris Studio" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ConfirmationsAdminOverview,
});

type ResponseOverviewRow = {
  id: string;
  country: string;
  participating: boolean;
  selection_method: string | null;
  entry_unknown: boolean;
  nf_entries_unknown: boolean;
  reviewed: boolean;
  submitted_at: string;
  internal_entries: {
    song_title: string | null;
    review_status: string | null;
  } | null;
  national_finals: {
    winning_entry_id: string | null;
    national_final_entries: Array<{
      id: string;
      review_status: string | null;
      removed?: boolean | null;
    }>;
  } | null;
  editions: { id: string; edition_number: number; name: string } | null;
};

function needsEntryAttention(row: ResponseOverviewRow) {
  if (!row.participating) return false;

  if (!row.selection_method) return true;

  if (row.selection_method === "internal") {
    return Boolean(
      row.entry_unknown ||
        !row.internal_entries?.song_title ||
        row.internal_entries?.review_status === "declined",
    );
  }

  if (row.selection_method === "national_final") {
    const entries = (row.national_finals?.national_final_entries ?? []).filter(
      (entry) => !entry.removed && entry.review_status !== "removed",
    );

    return Boolean(
      row.nf_entries_unknown ||
        !entries.length ||
        entries.some((entry) => entry.review_status === "declined") ||
        (entries.every((entry) => entry.review_status === "accepted") &&
          !row.national_finals?.winning_entry_id),
    );
  }

  return false;
}

function ConfirmationsAdminOverview() {
  const [editions, setEditions] = useState<ConfirmationEdition[]>([]);
  const [responses, setResponses] = useState<ResponseOverviewRow[]>([]);
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
            ? (responseResult.data as unknown as ResponseOverviewRow[])
            : [],
        );
      } catch (caught) {
        if (alive) {
          setError(
            caught instanceof Error
              ? caught.message
              : "Could not load delegation operations.",
          );
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

  const summary = useMemo(() => {
    const participating = scopedResponses.filter((response) => response.participating).length;
    const notParticipating = scopedResponses.length - participating;
    const needsReview = scopedResponses.filter((response) => !response.reviewed).length;
    const incomplete = scopedResponses.filter(needsEntryAttention).length;
    const openRounds = activeEdition?.rounds.filter((round) => round.status === "open") ?? [];

    return {
      responses: scopedResponses.length,
      participating,
      notParticipating,
      needsReview,
      incomplete,
      openRounds,
    };
  }, [activeEdition, scopedResponses]);

  const attentionRows = useMemo(
    () =>
      scopedResponses
        .filter((response) => !response.reviewed || needsEntryAttention(response))
        .sort(
          (a, b) =>
            Number(!b.reviewed) - Number(!a.reviewed) ||
            new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime(),
        )
        .slice(0, 6),
    [scopedResponses],
  );

  return (
    <div className="admin-page pb-5">
      <AdminPageHeader
        eyebrow="Contest · Delegations"
        title="Delegations"
        description="Confirm participation, review entries and keep every delegation moving without jumping between separate admin systems."
        actions={
          <div className="flex items-center gap-2">
            <Link to="/confirmations/admin/responses" className="admin-action-primary">
              Review responses
            </Link>
            <AdminMoreMenu
              label="More delegation tools"
              title="Delegation tools"
              description="Less frequent confirmation and access controls."
            >
              <div className="space-y-1">
                <Link to="/confirmations/admin/recovery-codes" className="admin-action-row">
                  <span className="admin-action-row-icon"><KeyRound className="size-4" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">Recovery access</span>
                    <span className="mt-1 block text-xs text-muted-foreground">Help a delegation regain access to its response.</span>
                  </span>
                  <ChevronRight className="size-4 text-muted-foreground" />
                </Link>
                <Link to="/confirmations/admin/settings" className="admin-action-row">
                  <span className="admin-action-row-icon"><Settings2 className="size-4" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">Delegation settings</span>
                    <span className="mt-1 block text-xs text-muted-foreground">Editing rules and public form behaviour.</span>
                  </span>
                  <ChevronRight className="size-4 text-muted-foreground" />
                </Link>
              </div>
            </AdminMoreMenu>
          </div>
        }
      />

      {loading ? (
        <AdminCard className="py-8 text-center text-sm text-muted-foreground">
          Loading delegation status…
        </AdminCard>
      ) : error ? (
        <AdminCard className="border-rose-200/20 bg-rose-200/[0.045]">
          <div className="flex items-start gap-3">
            <ShieldAlert className="mt-0.5 size-5 shrink-0 text-rose-200" />
            <div>
              <p className="text-sm font-semibold">Delegation data could not be loaded</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{error}</p>
            </div>
          </div>
        </AdminCard>
      ) : (
        <div className="space-y-4">
          <AdminCard strong>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="admin-section-label">Active edition</p>
                <h2 className="mt-1 text-xl font-bold tracking-[-.025em]">
                  {activeEdition ? `SSC ${activeEdition.edition_number}` : "No active edition"}
                </h2>
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  {activeEdition?.name ?? "Set up a Confirmations edition before collecting responses."}
                </p>
              </div>
              <AdminStatus tone={summary.openRounds.length ? "ready" : "neutral"}>
                {summary.openRounds.length
                  ? `${summary.openRounds.length} open ${summary.openRounds.length === 1 ? "round" : "rounds"}`
                  : "No open rounds"}
              </AdminStatus>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-3">
                <p className="text-[11px] font-semibold text-muted-foreground">Responses</p>
                <p className="mt-1 text-2xl font-bold">{summary.responses}</p>
              </div>
              <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-3">
                <p className="text-[11px] font-semibold text-muted-foreground">Participating</p>
                <p className="mt-1 text-2xl font-bold">{summary.participating}</p>
              </div>
              <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-3">
                <p className="text-[11px] font-semibold text-muted-foreground">Need review</p>
                <p className="mt-1 text-2xl font-bold">{summary.needsReview}</p>
              </div>
              <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-3">
                <p className="text-[11px] font-semibold text-muted-foreground">Incomplete</p>
                <p className="mt-1 text-2xl font-bold">{summary.incomplete}</p>
              </div>
            </div>

            {summary.notParticipating ? (
              <p className="mt-3 text-xs text-muted-foreground">
                {summary.notParticipating} {summary.notParticipating === 1 ? "delegation has" : "delegations have"} declined participation.
              </p>
            ) : null}
          </AdminCard>

          <AdminCard>
            <AdminCardHeader
              eyebrow="Triage"
              title="Needs attention"
              description="The responses most likely to need an organizer decision next."
              action={
                summary.needsReview || summary.incomplete ? (
                  <AdminStatus tone="attention">{Math.max(summary.needsReview, summary.incomplete)} pending</AdminStatus>
                ) : (
                  <AdminStatus tone="ready">Clear</AdminStatus>
                )
              }
            />

            {attentionRows.length ? (
              <div>
                {attentionRows.map((response) => {
                  const entryAttention = needsEntryAttention(response);
                  const detail = !response.reviewed
                    ? "Response has not been reviewed yet."
                    : entryAttention
                      ? "Entry details need attention."
                      : "Review response.";

                  return (
                    <Link
                      key={response.id}
                      to="/confirmations/admin/responses/$id"
                      params={{ id: response.id }}
                      className="admin-list-row"
                    >
                      <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-white/[0.07] bg-white/[0.035]">
                        <Flag className="size-4 text-muted-foreground" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{response.country}</span>
                        <span className="mt-1 block text-xs text-muted-foreground">{detail}</span>
                      </span>
                      <AdminStatus tone={!response.reviewed ? "attention" : "blocked"}>
                        {!response.reviewed ? "Review" : "Incomplete"}
                      </AdminStatus>
                    </Link>
                  );
                })}

                {(summary.needsReview > attentionRows.length || summary.incomplete > attentionRows.length) ? (
                  <Link to="/confirmations/admin/responses" className="admin-action-secondary mt-3 w-full">
                    View all responses
                  </Link>
                ) : null}
              </div>
            ) : (
              <AdminEmptyState
                title="Nothing needs attention"
                description="There are no unreviewed or obviously incomplete responses in the active edition."
              />
            )}
          </AdminCard>

          <AdminCard>
            <AdminCardHeader
              eyebrow="Workspace"
              title="Delegation workflow"
              description="The four places used most often during an edition."
            />
            <div className="grid gap-1 sm:grid-cols-2 sm:gap-x-4">
              <Link to="/confirmations/admin/responses" className="admin-list-row">
                <span className="admin-action-row-icon"><FileText className="size-4" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">Responses</span>
                  <span className="mt-1 block text-xs text-muted-foreground">Review confirmations and submitted entries.</span>
                </span>
                <ChevronRight className="size-4 text-muted-foreground" />
              </Link>
              <Link to="/confirmations/admin/countries" className="admin-list-row">
                <span className="admin-action-row-icon"><Flag className="size-4" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">Countries</span>
                  <span className="mt-1 block text-xs text-muted-foreground">See each delegation and its current entry state.</span>
                </span>
                <ChevronRight className="size-4 text-muted-foreground" />
              </Link>
              <Link to="/confirmations/admin/rounds" className="admin-list-row">
                <span className="admin-action-row-icon"><Layers3 className="size-4" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">Rounds</span>
                  <span className="mt-1 block text-xs text-muted-foreground">Open, close and schedule submission waves.</span>
                </span>
                <ChevronRight className="size-4 text-muted-foreground" />
              </Link>
              <Link to="/confirmations/admin/calendar" className="admin-list-row">
                <span className="admin-action-row-icon"><CalendarDays className="size-4" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">Calendar</span>
                  <span className="mt-1 block text-xs text-muted-foreground">Reveal dates, National Finals and deadlines.</span>
                </span>
                <ChevronRight className="size-4 text-muted-foreground" />
              </Link>
            </div>
          </AdminCard>

          <AdminCard>
            <AdminCardHeader
              eyebrow="Rounds"
              title="Open now"
              description="Submission windows currently accepting delegation responses."
            />
            {summary.openRounds.length ? (
              <div>
                {summary.openRounds.map((round) => (
                  <Link key={round.id} to="/confirmations/admin/rounds" className="admin-list-row">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{round.name}</span>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {round.response_count} responses
                        {round.response_limit ? ` · ${round.response_limit} response limit` : ""}
                      </span>
                    </span>
                    <AdminStatus tone="ready">Open</AdminStatus>
                  </Link>
                ))}
              </div>
            ) : (
              <AdminEmptyState
                title="No submission round is open"
                description="Open or schedule a round when you are ready to collect more confirmations."
                action={
                  <Link to="/confirmations/admin/rounds" className="admin-action-secondary">
                    Manage rounds
                  </Link>
                }
              />
            )}
          </AdminCard>

          <div className="grid grid-cols-2 gap-2">
            <Link to="/confirmations" className="admin-action-secondary w-full">
              Open public portal
            </Link>
            <Link to="/confirmations/admin/editions" className="admin-action-secondary w-full">
              Confirmation editions
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
