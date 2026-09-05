import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, ChevronDown, Search, ShieldAlert, UserRoundCog } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { AdminCard, AdminPageHeader, AdminStatus } from "@/components/admin/AdminUI";
import { getLightweightFriendVotingIntelligence } from "@/integrations/televoting/intelligence.functions";
import { useEditions } from "@/lib/data";

const ALL_EDITIONS = "__all__";
const ALL_EDITIONS_BATCH_SIZE = 3;

export const Route = createFileRoute("/_authenticated/admin/friend-voting")({
  head: () => ({
    meta: [
      { title: "Friend-voting intelligence — Solaris Organizer" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: FriendVotingPage,
});

function FriendVotingPage() {
  const getIntelligence = useServerFn(getLightweightFriendVotingIntelligence);
  const { data: editions = [] } = useEditions();
  const [editionId, setEditionId] = useState("");
  const [search, setSearch] = useState("");
  const [minRisk, setMinRisk] = useState(0);
  const [progress, setProgress] = useState({ processed: 0, succeeded: 0, total: 0 });

  const sortedEditions = useMemo(
    () => [...editions].sort((a, b) => (b.edition_number ?? -1) - (a.edition_number ?? -1)),
    [editions],
  );

  const editionIdsToAnalyse = useMemo(
    () => editionId === ALL_EDITIONS ? sortedEditions.map((edition) => edition.id) : editionId ? [editionId] : [],
    [editionId, sortedEditions],
  );

  const editionById = useMemo(() => new Map(sortedEditions.map((edition) => [edition.id, edition])), [sortedEditions]);

  useEffect(() => {
    setProgress({ processed: 0, succeeded: 0, total: editionIdsToAnalyse.length });
  }, [editionId, editionIdsToAnalyse.length]);

  const analyseEdition = async (id: string) => {
    let lastError: unknown = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const result = await getIntelligence({ data: { lens: "hod", channel: "combined", editionId: id } });
        if (!result) throw new Error("No data returned");
        return result;
      } catch (caught) {
        lastError = caught;
        if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 350));
      }
    }
    throw lastError instanceof Error ? lastError : new Error("Analysis failed");
  };

  const analysis = useQuery({
    queryKey: ["friend-voting-admin-batched", editionId, editionIdsToAnalyse.join(",")],
    enabled: Boolean(editionId && editionIdsToAnalyse.length),
    staleTime: 60_000,
    retry: false,
    queryFn: async () => {
      const results: Array<{ editionId: string; data: any }> = [];
      const failures: Array<{ editionId: string; message: string }> = [];
      let processed = 0;
      let succeeded = 0;
      setProgress({ processed: 0, succeeded: 0, total: editionIdsToAnalyse.length });

      for (let start = 0; start < editionIdsToAnalyse.length; start += ALL_EDITIONS_BATCH_SIZE) {
        const batch = editionIdsToAnalyse.slice(start, start + ALL_EDITIONS_BATCH_SIZE);
        const settled = await Promise.allSettled(batch.map((id) => analyseEdition(id)));

        settled.forEach((outcome, index) => {
          const id = batch[index];
          processed += 1;
          if (outcome.status === "fulfilled") {
            succeeded += 1;
            results.push({ editionId: id, data: outcome.value });
          } else {
            failures.push({
              editionId: id,
              message: outcome.reason instanceof Error ? outcome.reason.message : "Analysis failed",
            });
          }
        });

        setProgress({ processed, succeeded, total: editionIdsToAnalyse.length });
        if (start + ALL_EDITIONS_BATCH_SIZE < editionIdsToAnalyse.length) {
          await new Promise((resolve) => setTimeout(resolve, 250));
        }
      }

      return { results, failures };
    },
  });

  const combined = useMemo(() => {
    const completed = analysis.data?.results ?? [];
    if (!completed.length) return null;

    const relationships = completed.flatMap(({ editionId: resultEditionId, data }) => {
      const edition = editionById.get(resultEditionId);
      const editionLabel = edition?.edition_number ? `SSC${edition.edition_number}` : edition?.name ?? "Edition";
      return (data.relationships ?? []).map((row: any) => ({ ...row, editionId: resultEditionId, editionLabel }));
    });

    const stats = completed.reduce((acc, { data: result }) => ({
      ballots: acc.ballots + Number(result.stats?.ballots ?? 0),
      juryBallots: acc.juryBallots + Number(result.stats?.juryBallots ?? 0),
      suspicious: acc.suspicious + Number(result.stats?.suspicious ?? 0),
      highRisk: acc.highRisk + Number(result.stats?.highRisk ?? 0),
      relationships: acc.relationships + Number(result.stats?.relationships ?? 0),
      attentionRelationships: acc.attentionRelationships + Number(result.stats?.attentionRelationships ?? 0),
      hodAssignedEditionCountries: acc.hodAssignedEditionCountries + Number(result.stats?.hodAssignedEditionCountries ?? 0),
      hodUnknownEditionCountries: acc.hodUnknownEditionCountries + Number(result.stats?.hodUnknownEditionCountries ?? 0),
    }), {
      ballots: 0,
      juryBallots: 0,
      suspicious: 0,
      highRisk: 0,
      relationships: 0,
      attentionRelationships: 0,
      hodAssignedEditionCountries: 0,
      hodUnknownEditionCountries: 0,
    });

    return { relationships, stats };
  }, [analysis.data?.results, editionById]);

  const filteredRelationships = useMemo(() => {
    const term = search.trim().toLowerCase();
    return [...(combined?.relationships ?? [])]
      .filter((row: any) => row.riskScore >= minRisk)
      .filter((row: any) => {
        if (!term) return true;
        const sourceCountries = (row.votingCountries ?? []).join(" ");
        return `${sourceCountries} ${row.controllerName ?? ""} ${row.targetCountry} ${row.editionLabel ?? ""}`.toLowerCase().includes(term);
      })
      .sort((a: any, b: any) => b.riskScore - a.riskScore || b.confidence - a.confidence)
      .slice(0, 100);
  }, [combined?.relationships, minRisk, search]);

  const failures = analysis.data?.failures ?? [];
  const failedLabels = failures.map((failure) => {
    const edition = editionById.get(failure.editionId);
    return edition?.edition_number ? `SSC${edition.edition_number}` : edition?.name ?? failure.editionId;
  });

  const totalHodUnits = (combined?.stats.hodAssignedEditionCountries ?? 0) + (combined?.stats.hodUnknownEditionCountries ?? 0);
  const hodCoverage = totalHodUnits
    ? Math.round(((combined?.stats.hodAssignedEditionCountries ?? 0) / totalHodUnits) * 100)
    : 0;

  const isAll = editionId === ALL_EDITIONS;
  const progressLabel = isAll
    ? analysis.isFetching
      ? `${progress.succeeded}/${progress.total} successful · ${progress.processed}/${progress.total} processed`
      : `${analysis.data?.results.length ?? 0}/${editionIdsToAnalyse.length} editions analysed successfully`
    : analysis.isFetching ? "Analysing…" : failures.length ? "Analysis failed" : "Edition ready";

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <AdminPageHeader
        eyebrow="Integrity intelligence"
        title="Friend-voting intelligence"
        description="Find unusual jury and televote relationships by country, with HOD identity shown as context rather than replacing the country."
        actions={
          <Link to="/admin/hod-history" className="admin-action-secondary">
            <UserRoundCog className="size-4" /> HOD history
          </Link>
        }
      />

      <AdminCard strong>
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)_190px] lg:items-end">
          <label className="block min-w-0">
            <span className="admin-section-label">Edition</span>
            <select
              value={editionId}
              onChange={(event) => setEditionId(event.target.value)}
              className="mt-2 min-h-11 w-full rounded-xl border border-white/[0.1] bg-white/[0.035] px-3 text-sm text-foreground outline-none focus:border-sky-200/30"
            >
              <option value="">Choose an edition</option>
              <option value={ALL_EDITIONS}>All editions</option>
              {sortedEditions.map((edition) => (
                <option key={edition.id} value={edition.id}>
                  SSC{edition.edition_number ?? "?"} · {edition.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block min-w-0">
            <span className="admin-section-label">Find a country or HOD</span>
            <span className="relative mt-2 block">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search relationships"
                className="min-h-11 w-full rounded-xl border border-white/[0.1] bg-white/[0.035] pl-9 pr-3 text-sm text-foreground outline-none focus:border-sky-200/30"
              />
            </span>
          </label>

          <label className="block">
            <span className="admin-section-label">Minimum risk</span>
            <select
              value={minRisk}
              onChange={(event) => setMinRisk(Number(event.target.value))}
              className="mt-2 min-h-11 w-full rounded-xl border border-white/[0.1] bg-white/[0.035] px-3 text-sm text-foreground outline-none focus:border-sky-200/30"
            >
              <option value={0}>All relationships</option>
              <option value={20}>20+</option>
              <option value={30}>30+</option>
              <option value={40}>40+</option>
              <option value={60}>60+</option>
              <option value={80}>80+</option>
            </select>
          </label>
        </div>

        {editionId ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <AdminStatus tone={analysis.isFetching ? "neutral" : failures.length ? "attention" : "info"}>{progressLabel}</AdminStatus>
            {failures.length ? <AdminStatus tone="attention">{failures.length} failed</AdminStatus> : null}
          </div>
        ) : null}
      </AdminCard>

      {!editionId ? (
        <AdminCard>
          <div className="py-8 text-center">
            <ShieldAlert className="mx-auto size-7 text-sky-100/70" />
            <h2 className="mt-3 text-lg font-semibold">Choose an edition or the full history</h2>
            <p className="mx-auto mt-2 max-w-2xl text-sm text-muted-foreground">All editions are processed in small batches, with an automatic retry for individual failures, so one troublesome request does not wipe out the rest.</p>
          </div>
        </AdminCard>
      ) : null}

      {failures.length ? (
        <details className="rounded-2xl border border-amber-200/15 bg-amber-200/[0.045] p-4">
          <summary className="flex cursor-pointer list-none items-center gap-3 [&::-webkit-details-marker]:hidden">
            <AlertTriangle className="size-4 shrink-0 text-amber-100" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-amber-50">Partial analysis · {analysis.data?.results.length ?? 0} succeeded, {failures.length} failed</p>
              <p className="mt-1 truncate text-xs text-amber-100/65">Tap to see failed editions</p>
            </div>
            <ChevronDown className="size-4 text-amber-100/70" />
          </summary>
          <div className="mt-3 border-t border-amber-100/10 pt-3">
            <p className="text-xs leading-relaxed text-amber-100/75">Failed: {failedLabels.join(", ")}.</p>
            <button type="button" onClick={() => void analysis.refetch()} className="mt-3 rounded-lg border border-amber-100/15 px-3 py-1.5 text-xs font-semibold text-amber-50">Retry analysis</button>
          </div>
        </details>
      ) : null}

      {analysis.isLoading && !combined ? (
        <AdminCard><p className="py-8 text-center text-sm text-muted-foreground">Building friend-voting analysis…</p></AdminCard>
      ) : null}

      {combined ? (
        <>
          <AdminCard>
            <div className="grid grid-cols-2 gap-x-5 gap-y-4 sm:grid-cols-3 lg:grid-cols-6">
              <CompactMetric label="TV ballots" value={combined.stats.ballots} />
              <CompactMetric label="Jury ballots" value={combined.stats.juryBallots} />
              <CompactMetric label="Relationships" value={combined.stats.relationships} />
              <CompactMetric label="Need attention" value={combined.stats.attentionRelationships} />
              <CompactMetric label="High risk" value={combined.stats.highRisk} />
              <CompactMetric label="HOD coverage" value={`${hodCoverage}%`} />
            </div>
          </AdminCard>

          <AdminCard>
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="admin-section-label">Relationship evidence</p>
                <h2 className="mt-1 text-xl font-bold">Country relationships</h2>
              </div>
              <AdminStatus tone="info">{filteredRelationships.length} shown</AdminStatus>
            </div>

            <div className="divide-y divide-white/[0.07]">
              {filteredRelationships.map((row: any, index: number) => {
                const sourceCountry = (row.votingCountries?.length ? row.votingCountries.join(" / ") : row.votingCountry) || "Unknown country";
                const sourceLabel = row.controllerName ? `${sourceCountry} (${row.controllerName})` : sourceCountry;
                return (
                  <details key={`${row.identityKey}>${row.targetCode}:${row.editionId}:${index}`} className="group py-3">
                    <summary className="flex cursor-pointer list-none items-center gap-3 [&::-webkit-details-marker]:hidden">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-foreground">{sourceLabel} → {row.targetCountry}</p>
                        <p className="mt-1 text-[11px] text-muted-foreground">{row.editionLabel} · {row.uniqueEditions} edition{row.uniqueEditions === 1 ? "" : "s"} of evidence</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] font-semibold">Risk {row.riskScore}</span>
                        <span className="hidden rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] text-muted-foreground sm:inline">{row.confidence}% conf.</span>
                        <ChevronDown className="size-4 text-muted-foreground transition group-open:rotate-180" />
                      </div>
                    </summary>
                    <div className="mt-3 rounded-xl border border-white/[0.07] bg-white/[0.025] p-3">
                      <p className="text-xs leading-relaxed text-muted-foreground">{row.reasons?.join(" · ") || "No elevated evidence signal."}</p>
                      <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                        <SmallMetric label="Confidence" value={`${row.confidence}%`} />
                        <SmallMetric label="Support" value={`${row.supportFrequency}%`} />
                        <SmallMetric label="Reciprocity" value={`${row.reciprocalSupport}%`} />
                        <SmallMetric label="Average points" value={row.averagePoints} />
                      </div>
                    </div>
                  </details>
                );
              })}
              {!filteredRelationships.length ? <p className="py-8 text-center text-sm text-muted-foreground">No relationships match the current filters.</p> : null}
            </div>
          </AdminCard>
        </>
      ) : null}

      {editionId && !analysis.isFetching && !combined && failures.length ? (
        <AdminCard className="!border-rose-200/15 !bg-rose-200/[0.045]"><p className="text-sm text-rose-100">None of the selected editions could be analysed. Retry the failed editions above.</p></AdminCard>
      ) : null}
    </div>
  );
}

function CompactMetric({ label, value }: { label: string; value: string | number }) {
  return <div><p className="text-[10px] font-bold uppercase tracking-[0.13em] text-muted-foreground">{label}</p><p className="mt-1 text-xl font-semibold text-foreground">{value}</p></div>;
}

function SmallMetric({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded-lg border border-white/[0.06] bg-white/[0.025] px-2.5 py-2"><p className="text-[9px] font-bold uppercase tracking-[0.12em] text-muted-foreground">{label}</p><p className="mt-1 font-semibold text-foreground">{value}</p></div>;
}
