import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Search, ShieldAlert } from "lucide-react";

import {
  AdminCard,
  AdminEmptyState,
  AdminPageHeader,
  AdminStatus,
} from "@/components/admin/AdminUI";
import { Input } from "@/components/ui/input";
import {
  listMergedModerationSubmissions,
  type MergedModerationSubmission,
} from "@/integrations/televoting/moderation.functions";
import { getMergedTelevotingRoundsPage } from "@/integrations/televoting/rounds.functions";

export function V3ScopedIntegrityReview({
  editionId,
  editionLabel,
}: {
  editionId: string;
  editionLabel: string;
}) {
  const getRoundsPage = useServerFn(getMergedTelevotingRoundsPage);
  const listVotes = useServerFn(listMergedModerationSubmissions);
  const [roundId, setRoundId] = useState("all");
  const [status, setStatus] = useState<"all" | MergedModerationSubmission["status"]>("all");
  const [search, setSearch] = useState("");

  const roundsQuery = useQuery({
    queryKey: ["v3-organizer-integrity-rounds", editionId],
    queryFn: () => getRoundsPage({ data: { editionId } }),
    staleTime: 10_000,
  });

  const rounds = roundsQuery.data?.edition?.rounds ?? [];
  const roundIds = useMemo(() => rounds.map((round) => round.id), [rounds]);

  const submissionsQuery = useQuery({
    queryKey: ["v3-organizer-integrity-submissions", editionId, roundIds],
    enabled: Boolean(roundsQuery.data?.linked && roundIds.length),
    queryFn: async () => {
      const rows = await Promise.all(
        roundIds.map(async (scopedRoundId) => {
          const submissions = await listVotes({ data: { roundId: scopedRoundId } });
          const mismatched = submissions.find((submission) => submission.round_id !== scopedRoundId);
          if (mismatched) {
            throw new Error(
              "Voting integrity returned a ballot outside the selected edition round scope.",
            );
          }
          return submissions;
        }),
      );

      const byId = new Map<string, MergedModerationSubmission>();
      for (const submission of rows.flat()) byId.set(submission.id, submission);
      return [...byId.values()];
    },
    staleTime: 10_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });

  const submissions = submissionsQuery.data ?? [];
  const counts = useMemo(
    () => ({
      all: submissions.length,
      suspicious: submissions.filter((item) => item.status === "suspicious").length,
      verified: submissions.filter((item) => item.status === "verified").length,
      deleted: submissions.filter((item) => item.status === "deleted").length,
    }),
    [submissions],
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return submissions
      .filter((submission) => roundId === "all" || submission.round_id === roundId)
      .filter((submission) => status === "all" || submission.status === status)
      .filter((submission) => {
        if (!term) return true;
        return [
          submission.country_name,
          submission.country_code,
          submission.username,
          submission.round_name,
          submission.ip_country ?? "",
          submission.moderator_note ?? "",
        ]
          .join(" ")
          .toLowerCase()
          .includes(term);
      })
      .sort((a, b) => {
        const priority = (value: MergedModerationSubmission["status"]) =>
          value === "suspicious" ? 0 : value === "active" ? 1 : value === "verified" ? 2 : 3;
        const statusDifference = priority(a.status) - priority(b.status);
        if (statusDifference) return statusDifference;
        return Number(b.risk_score) - Number(a.risk_score);
      });
  }, [roundId, search, status, submissions]);

  const loading = roundsQuery.isLoading || submissionsQuery.isLoading;
  const error = roundsQuery.error ?? submissionsQuery.error;
  const linked = roundsQuery.data?.linked === true;

  return (
    <div className="admin-page mx-auto max-w-6xl pb-5" data-v3-organizer-integrity-scope={editionId}>
      <AdminPageHeader
        eyebrow={`${editionLabel} · Voting · Integrity`}
        title="Integrity review"
        description="Review only ballots from voting rounds linked to the exact edition selected in Solaris Organizer. Human decisions and sanctions stay unavailable until their server commands are edition-scoped."
        actions={
          <AdminStatus tone={counts.suspicious ? "attention" : "neutral"}>
            {counts.suspicious} flagged
          </AdminStatus>
        }
      />

      <div
        data-v3-organizer-context-lock="edition"
        className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.025] px-3 py-2"
      >
        <span className="admin-section-label">Edition context</span>
        <AdminStatus tone="info">{editionLabel}</AdminStatus>
      </div>

      <AdminCard className="mb-4 !border-amber-200/15">
        <div className="flex items-start gap-3">
          <ShieldAlert className="mt-0.5 size-4 shrink-0 text-amber-100" />
          <div>
            <p className="text-sm font-semibold">Human moderation is temporarily read-only here</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              The existing decision, ballot-exclusion and sanction commands are global Televoting authorities. Solaris will not expose them inside an edition-scoped Organizer workspace until the server verifies edition ownership for every command.
            </p>
          </div>
        </div>
      </AdminCard>

      {roundsQuery.data && !linked ? (
        <AdminCard>
          <AdminEmptyState
            icon={ShieldAlert}
            title="Voting edition is not linked"
            description="Integrity review cannot resolve authoritative voting rounds for this Solaris edition yet. Link the edition from Voting before reviewing ballots."
          />
        </AdminCard>
      ) : roundsQuery.data && linked && !rounds.length ? (
        <AdminCard>
          <AdminEmptyState
            icon={CheckCircle2}
            title="No voting rounds in this edition"
            description="Integrity cases appear after the selected edition has at least one voting round."
          />
        </AdminCard>
      ) : (
        <>
          <section className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Integrity ballot status">
            <Metric label="Ballots" value={counts.all} />
            <Metric label="Needs review" value={counts.suspicious} attention={counts.suspicious > 0} />
            <Metric label="Verified" value={counts.verified} />
            <Metric label="Excluded" value={counts.deleted} />
          </section>

          <AdminCard className="mb-4 !p-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="admin-section-label">Round</span>
                <select
                  value={roundId}
                  onChange={(event) => setRoundId(event.target.value)}
                  className="mt-2 min-h-11 w-full rounded-xl border border-white/[0.1] bg-[#07111f] px-3 text-sm font-semibold outline-none focus:border-sky-200/30"
                >
                  <option value="all">All rounds in this edition</option>
                  {rounds.map((round) => (
                    <option key={round.id} value={round.id}>{round.name}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="admin-section-label">Search</span>
                <span className="relative mt-2 block">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Country, username, round or note…"
                    className="min-h-11 pl-9"
                  />
                </span>
              </label>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <FilterButton active={status === "all"} onClick={() => setStatus("all")}>All</FilterButton>
              <FilterButton active={status === "suspicious"} onClick={() => setStatus("suspicious")}>Needs review</FilterButton>
              <FilterButton active={status === "active"} onClick={() => setStatus("active")}>Active</FilterButton>
              <FilterButton active={status === "verified"} onClick={() => setStatus("verified")}>Verified</FilterButton>
              <FilterButton active={status === "deleted"} onClick={() => setStatus("deleted")}>Excluded</FilterButton>
            </div>
          </AdminCard>

          {loading ? (
            <AdminCard><p className="py-10 text-center text-sm text-muted-foreground">Loading edition-scoped integrity cases…</p></AdminCard>
          ) : error ? (
            <AdminCard className="!border-rose-200/15">
              <AdminEmptyState
                icon={ShieldAlert}
                title="Integrity review unavailable"
                description={error instanceof Error ? error.message : "The edition-scoped voting integrity snapshot could not be verified."}
              />
            </AdminCard>
          ) : filtered.length ? (
            <div className="space-y-2">
              {filtered.map((submission) => (
                <AdminCard key={submission.id} className="!p-4">
                  <div className="flex min-w-0 items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-bold sm:text-base">{submission.country_name}</p>
                        <AdminStatus tone={submissionTone(submission.status)}>{submissionLabel(submission.status)}</AdminStatus>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {submission.username} · {submission.round_name}
                      </p>
                    </div>
                    <span className={submission.risk_score >= 65 ? "numeric text-xs font-bold text-rose-200" : submission.risk_score >= 40 ? "numeric text-xs font-bold text-amber-200" : "numeric text-xs font-bold text-muted-foreground"}>
                      Risk {submission.risk_score}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                    <span>{submission.entries.length} scored entries</span>
                    {submission.ip_country ? <span>IP {submission.ip_country}</span> : null}
                    {submission.is_vpn ? <span className="text-amber-100">VPN/proxy signal</span> : null}
                    {submission.edited_at ? <span>Edited ballot</span> : null}
                  </div>
                  {submission.moderator_note ? (
                    <p className="mt-3 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3 text-xs leading-5 text-muted-foreground">
                      {submission.moderator_note}
                    </p>
                  ) : null}
                </AdminCard>
              ))}
            </div>
          ) : (
            <AdminCard>
              <AdminEmptyState
                icon={CheckCircle2}
                title="No ballots in this view"
                description="No ballot from the selected edition matches the current round, state and search filters."
              />
            </AdminCard>
          )}
        </>
      )}
    </div>
  );
}

function FilterButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={active
        ? "min-h-10 rounded-xl border border-sky-200/15 bg-sky-200/[0.08] px-3 text-xs font-semibold text-sky-100"
        : "min-h-10 rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 text-xs font-semibold text-muted-foreground transition hover:bg-white/[0.04] hover:text-foreground"}
    >
      {children}
    </button>
  );
}

function Metric({ label, value, attention = false }: { label: string; value: number; attention?: boolean }) {
  return (
    <AdminCard className="!p-3 text-center">
      <p className={attention ? "numeric text-xl font-bold text-amber-100" : "numeric text-xl font-bold"}>{value}</p>
      <p className="mt-1 text-[11px] text-muted-foreground">{label}</p>
    </AdminCard>
  );
}

function submissionTone(status: MergedModerationSubmission["status"]): "ready" | "attention" | "blocked" | "neutral" {
  if (status === "verified") return "ready";
  if (status === "suspicious") return "attention";
  if (status === "deleted") return "blocked";
  return "neutral";
}

function submissionLabel(status: MergedModerationSubmission["status"]) {
  if (status === "verified") return "Verified";
  if (status === "suspicious") return "Needs review";
  if (status === "deleted") return "Excluded";
  return "Active";
}