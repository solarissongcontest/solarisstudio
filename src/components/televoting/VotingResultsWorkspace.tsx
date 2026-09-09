import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Archive, Calculator, Trophy } from "lucide-react";

import { useAdminContext } from "@/components/admin/AdminContext";
import {
  AdminCard,
  AdminCardHeader,
  AdminEmptyState,
  AdminPageHeader,
  AdminStatus,
} from "@/components/admin/AdminUI";
import { getMergedTelevoteConversion } from "@/integrations/televoting/conversion.functions";
import {
  getMergedTelevotingRoundsPage,
  type MergedAdminRoundsPageEdition,
} from "@/integrations/televoting/rounds.functions";
import { VotingResultsView } from "@/components/televoting/VotingResultsView";

type ArchivedStoredResult = {
  country_code: string;
  original_votes: number;
  original_rank: number | null;
  robust_rank?: number | null;
  weighted_score?: number | string | null;
  exact_points?: number | string | null;
  floored_points?: number | null;
  decimal_remainder?: number | string | null;
  final_points: number;
  engine_version?: string | null;
  calculation_config?: {
    historical_import?: boolean;
    activity_points?: number;
    country_contributions?: Record<string, number>;
    normalised_percent?: number;
    final_percent?: number;
    display_diff?: number;
    formula?: string;
    point_pool?: number;
    floor_total?: number;
  } | null;
};

export function VotingResultsWorkspace() {
  const { editionId } = useAdminContext();
  const getRoundsPage = useServerFn(getMergedTelevotingRoundsPage);

  const { data, isLoading, error } = useQuery({
    queryKey: ["merged-televoting-results-edition", editionId],
    queryFn: () => getRoundsPage({ data: { editionId } }),
    enabled: Boolean(editionId),
    staleTime: 15_000,
  });

  if (!editionId || isLoading) {
    return (
      <div className="admin-page mx-auto max-w-5xl pb-5">
        <AdminPageHeader eyebrow="Voting" title="Televote result" description="Loading the selected edition…" />
        <AdminCard className="py-10 text-center text-sm text-muted-foreground">Loading result workspace…</AdminCard>
      </div>
    );
  }

  if (error) {
    return (
      <div className="admin-page mx-auto max-w-5xl pb-5">
        <AdminPageHeader eyebrow="Voting" title="Televote result" description="The selected edition could not be resolved." />
        <AdminCard className="border-rose-200/15 bg-rose-200/[0.045] text-sm text-rose-100">
          <p className="font-semibold">Result workspace could not be loaded.</p>
          <details className="mt-3 text-xs text-rose-100/70">
            <summary className="cursor-pointer font-semibold">Technical details</summary>
            <p className="mt-2 break-words">{error instanceof Error ? error.message : "Unknown result workspace error"}</p>
          </details>
        </AdminCard>
      </div>
    );
  }

  if (!data?.linked || !data.edition) {
    return (
      <div className="admin-page mx-auto max-w-5xl pb-5">
        <AdminPageHeader eyebrow="Voting" title="Televote result" description="The selected Solaris edition is not linked to Televoting yet." />
        <AdminCard>
          <AdminEmptyState
            icon={Calculator}
            title="No Televoting edition linked"
            description="Link this edition from Voting before working with its televote results."
          />
        </AdminCard>
      </div>
    );
  }

  if (data.edition.is_archived) {
    return <ArchivedVotingResults edition={data.edition} />;
  }

  return <VotingResultsView />;
}

function ArchivedVotingResults({ edition }: { edition: MergedAdminRoundsPageEdition }) {
  const getConversion = useServerFn(getMergedTelevoteConversion);
  const [roundId, setRoundId] = useState("");

  const preferredFinal = [...edition.rounds]
    .reverse()
    .find((round) => /grand\s*final/i.test(round.name) && !/live/i.test(round.name));
  const defaultRoundId = preferredFinal?.id ?? edition.rounds.at(-1)?.id ?? "";
  const effectiveRoundId = edition.rounds.some((round) => round.id === roundId)
    ? roundId
    : defaultRoundId;

  const { data, isLoading, error } = useQuery({
    queryKey: ["merged-televoting-archive-result", edition.solaris_id, effectiveRoundId],
    queryFn: () => getConversion({ data: { roundId: effectiveRoundId } }),
    enabled: Boolean(effectiveRoundId),
    staleTime: 30_000,
  });

  const storedRows = useMemo(() => {
    const rows = (data?.stored ?? []) as ArchivedStoredResult[];
    return [...rows].sort(
      (a, b) =>
        Number(b.final_points) - Number(a.final_points) ||
        Number(a.robust_rank ?? a.original_rank ?? 999) - Number(b.robust_rank ?? b.original_rank ?? 999),
    );
  }, [data?.stored]);

  const rawRows = useMemo(() => {
    const rows = (data?.originals ?? []) as Array<{
      code: string;
      originalVotes: number;
      originalVoters: number;
    }>;
    return [...rows].sort(
      (a, b) => Number(b.originalVotes) - Number(a.originalVotes) || a.code.localeCompare(b.code),
    );
  }, [data?.originals]);

  const hasDetailedHistoricalSource = storedRows.some(
    (row) => row.calculation_config?.historical_import && row.calculation_config?.country_contributions,
  );

  return (
    <div className="admin-page mx-auto max-w-5xl pb-5">
      <AdminPageHeader
        eyebrow={`SSC ${edition.edition_number} · archive`}
        title="Historical televote results"
        description="Inspect the preserved ballots and stored calculations exactly as they exist in the archive. Archived editions are read-only and are never recalculated automatically."
        actions={<AdminStatus tone="neutral">Read only</AdminStatus>}
      />

      <AdminCard className="border-sky-200/10 bg-sky-200/[0.025]">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-white/[0.07] bg-white/[0.03] text-sky-100">
            <Archive className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-bold">{edition.name} historical archive</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Stored result rows are shown without modification. If a round was never historically converted, Solaris shows its preserved raw ballot totals instead of inventing a modern result.
            </p>
            {hasDetailedHistoricalSource ? (
              <p className="mt-2 text-xs leading-relaxed text-sky-100/75">
                This archive also contains detailed historical source contributions. Expand any country below to inspect Activity Points and the original country-source breakdown.
              </p>
            ) : null}
          </div>
        </div>
      </AdminCard>

      {!edition.rounds.length ? (
        <AdminCard>
          <AdminEmptyState icon={Calculator} title="No archived voting rounds" description="This archived edition has no linked Televoting rounds." />
        </AdminCard>
      ) : (
        <div className="space-y-4">
          <AdminCard className="!p-3">
            <label className="block">
              <span className="admin-section-label">Round</span>
              <select
                value={effectiveRoundId}
                onChange={(event) => setRoundId(event.target.value)}
                className="mt-2 min-h-11 w-full rounded-xl border border-white/[0.1] bg-[#07111f] px-3 text-sm font-semibold text-foreground outline-none focus:border-sky-200/30"
              >
                {edition.rounds.map((round) => (
                  <option key={round.id} value={round.id}>{round.name} · {round.status}</option>
                ))}
              </select>
            </label>
          </AdminCard>

          {isLoading ? (
            <AdminCard className="py-10 text-center text-sm text-muted-foreground">Loading preserved result…</AdminCard>
          ) : error || !data ? (
            <AdminCard className="border-rose-200/15 bg-rose-200/[0.045] text-sm text-rose-100">
              <p className="font-semibold">Historical result could not be read.</p>
              <details className="mt-3 text-xs text-rose-100/70">
                <summary className="cursor-pointer font-semibold">Technical details</summary>
                <p className="mt-2 break-words">{error instanceof Error ? error.message : "Unknown historical result error"}</p>
              </details>
            </AdminCard>
          ) : (
            <>
              <AdminCard strong>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="admin-section-label">Preserved round</p>
                    <h2 className="mt-1 truncate text-lg font-bold tracking-[-.02em]">{data.round.name}</h2>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {data.participants.length} entries · {data.round.televote_engine_version} · calculation v{data.round.calculation_version}
                    </p>
                  </div>
                  <AdminStatus tone={storedRows.length ? "ready" : "neutral"}>
                    {storedRows.length ? "Stored result" : "Ballots only"}
                  </AdminStatus>
                </div>

                {data.round.results_outdated && storedRows.length ? (
                  <div className="mt-4 rounded-xl border border-amber-200/15 bg-amber-200/[0.05] p-3 text-xs leading-relaxed text-amber-100/85">
                    This stored historical result is marked out-of-date relative to later line-up metadata. The archived values below are preserved exactly and are not recalculated.
                  </div>
                ) : null}

                {!storedRows.length ? (
                  <div className="mt-4 rounded-xl border border-white/[0.08] bg-white/[0.02] p-3 text-xs leading-relaxed text-muted-foreground">
                    This round was never stored as a converted official result. Its original ballots remain intact, so the raw totals are shown below. No point conversion has been fabricated.
                  </div>
                ) : null}
              </AdminCard>

              {storedRows.length ? (
                <AdminCard className="!p-0 overflow-hidden">
                  <div className="border-b border-white/[0.07] p-4 sm:p-5">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2">
                        <Trophy className="size-4 text-sky-100" />
                        <h2 className="truncate text-sm font-bold">Preserved stored result</h2>
                      </div>
                      <span className="numeric shrink-0 text-xs text-muted-foreground">
                        {storedRows.reduce((sum, row) => sum + Number(row.final_points ?? 0), 0)} pts
                      </span>
                    </div>
                  </div>
                  <div className="divide-y divide-white/[0.06]">
                    {storedRows.map((row, index) => (
                      <ArchivedStoredResultRow key={row.country_code} row={row} index={index} />
                    ))}
                  </div>
                </AdminCard>
              ) : (
                <AdminCard className="!p-0 overflow-hidden">
                  <div className="border-b border-white/[0.07] p-4 sm:p-5">
                    <AdminCardHeader eyebrow="Historical ballots" title="Preserved raw totals" />
                  </div>
                  {rawRows.length ? (
                    <div className="divide-y divide-white/[0.06]">
                      {rawRows.map((row, index) => (
                        <div key={row.code} className="grid grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-2 px-4 py-3 text-sm sm:px-5">
                          <span className="numeric text-center text-xs text-muted-foreground">{index + 1}</span>
                          <div className="min-w-0">
                            <p className="truncate font-semibold">{row.code}</p>
                            <p className="mt-0.5 text-[11px] text-muted-foreground">Supported by {row.originalVoters} voter{row.originalVoters === 1 ? "" : "s"}</p>
                          </div>
                          <span className="numeric text-right font-bold text-sky-100">{row.originalVotes} raw</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-4">
                      <AdminEmptyState icon={Calculator} title="No preserved ballot totals" description="No usable historical ballot totals were found for this round." />
                    </div>
                  )}
                </AdminCard>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function ArchivedStoredResultRow({ row, index }: { row: ArchivedStoredResult; index: number }) {
  const historical = row.calculation_config?.historical_import ? row.calculation_config : null;
  const contributions = historical?.country_contributions ?? {};
  const contributionRows = Object.entries(contributions)
    .filter(([, points]) => Number(points) > 0)
    .sort((a, b) => Number(b[1]) - Number(a[1]) || a[0].localeCompare(b[0]));
  const activityPoints = Number(historical?.activity_points ?? 0);

  return (
    <div className="px-4 py-3 sm:px-5">
      <div className="grid grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-2 text-sm">
        <span className="numeric text-center text-xs text-muted-foreground">{index + 1}</span>
        <div className="min-w-0">
          <p className="truncate font-semibold">{row.country_code}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {row.original_votes} raw votes · historical rank #{row.original_rank ?? row.robust_rank ?? "–"}
          </p>
        </div>
        <span className="numeric text-right font-bold text-sky-100">{row.final_points} pts</span>
      </div>

      {historical ? (
        <details className="ml-9 mt-2 rounded-xl border border-white/[0.07] bg-white/[0.018] px-3 py-2">
          <summary className="cursor-pointer text-[11px] font-semibold text-sky-100/80">
            Detailed source breakdown
          </summary>
          <div className="mt-3 space-y-3">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <HistoricalMetric label="Activity Points" value={activityPoints} />
              <HistoricalMetric label="Country sources" value={contributionRows.length} />
              <HistoricalMetric label="Weighted score" value={formatHistoricalNumber(row.weighted_score)} />
              <HistoricalMetric label="Exact points" value={formatHistoricalNumber(row.exact_points, 3)} />
            </div>

            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Country contributions</p>
              {contributionRows.length ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {contributionRows.map(([code, points]) => (
                    <span key={code} className="rounded-lg border border-white/[0.07] bg-white/[0.025] px-2 py-1 text-[11px]">
                      <span className="font-semibold">{code}</span>
                      <span className="numeric ml-1.5 text-sky-100">{points}</span>
                    </span>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-xs text-muted-foreground">No country-source contribution was recorded.</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <HistoricalMetric label="Normalised" value={formatPercent(historical.normalised_percent)} />
              <HistoricalMetric label="Final share" value={formatPercent(historical.final_percent)} />
              <HistoricalMetric label="Floor" value={row.floored_points ?? "–"} />
              <HistoricalMetric label="Remainder" value={formatHistoricalNumber(row.decimal_remainder, 3)} />
            </div>

            {historical.formula ? (
              <p className="text-[10px] leading-relaxed text-muted-foreground">Historical formula: {historical.formula}</p>
            ) : null}
          </div>
        </details>
      ) : null}
    </div>
  );
}

function HistoricalMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-black/10 px-2.5 py-2">
      <p className="text-[9px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
      <p className="numeric mt-1 text-xs font-bold">{value}</p>
    </div>
  );
}

function formatHistoricalNumber(value: number | string | null | undefined, digits = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "–";
  return digits > 0 ? number.toFixed(digits) : Math.round(number).toString();
}

function formatPercent(value: number | null | undefined) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "–";
  return `${number.toFixed(2)}%`;
}
