import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, CheckCircle2, Scale, ShieldAlert, Users } from "lucide-react";
import { useMemo, useState } from "react";

import { AdminCard, AdminPageHeader, AdminStatus } from "@/components/admin/AdminUI";
import { getJuryIntegrityCases } from "@/integrations/jury-voting/jury-integrity-admin.functions";
import type { JuryIntegrityCase } from "@/integrations/jury-voting/jury-integrity-admin.server";

export const Route = createFileRoute("/_authenticated/admin/jury-integrity")({
  head: () => ({
    meta: [
      { title: "Jury Integrity — Solaris Organizer" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: JuryIntegrityPage,
});

function JuryIntegrityPage() {
  const loadCases = useServerFn(getJuryIntegrityCases);
  const [minimumRisk, setMinimumRisk] = useState(0);
  const [search, setSearch] = useState("");

  const query = useQuery({
    queryKey: ["jury-integrity-v5"],
    queryFn: async () => {
      const result = await loadCases();
      if (!result) throw new Error("Jury integrity analysis returned no data");
      return result;
    },
    staleTime: 30_000,
  });

  const cases = useMemo(() => {
    const term = search.trim().toLowerCase();
    return [...(query.data?.cases ?? [])]
      .filter((row) => row.risk >= minimumRisk)
      .filter((row) => !term || `${row.countryCode} ${row.showName} ${row.editionLabel}`.toLowerCase().includes(term))
      .sort((a, b) => b.risk - a.risk || b.confidence - a.confidence);
  }, [minimumRisk, query.data?.cases, search]);

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <AdminPageHeader
        eyebrow="Jury integrity"
        title="Jury Independence v5"
        description="Producer-only review of jury independence, peer-score deviation, historical relationships and corroborating evidence. Statistical evidence is for review, not an automatic misconduct finding."
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Checked ballots" value={query.data?.stats.total ?? 0} icon={Scale} />
        <Metric label="Review 50+" value={query.data?.stats.reviewOrHigher ?? 0} icon={Users} />
        <Metric label="Declaration 65+" value={query.data?.stats.declarationOrHigher ?? 0} icon={AlertTriangle} />
        <Metric label="High 80+" value={query.data?.stats.highOrHigher ?? 0} icon={ShieldAlert} />
      </div>

      <AdminCard>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_12rem]">
          <label className="space-y-1.5">
            <span className="admin-section-label">Search</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Country, show or edition"
              className="min-h-11 w-full rounded-xl border border-white/10 bg-white/[0.025] px-3 text-sm outline-none focus:border-sky-300/30"
            />
          </label>
          <label className="space-y-1.5">
            <span className="admin-section-label">Minimum risk</span>
            <select
              value={minimumRisk}
              onChange={(event) => setMinimumRisk(Number(event.target.value))}
              className="min-h-11 w-full rounded-xl border border-white/10 bg-white/[0.025] px-3 text-sm outline-none focus:border-sky-300/30"
            >
              <option value={0}>All</option>
              <option value={30}>Notice 30+</option>
              <option value={50}>Review 50+</option>
              <option value={65}>Declaration 65+</option>
              <option value={80}>High 80+</option>
            </select>
          </label>
        </div>
      </AdminCard>

      {query.isLoading ? (
        <AdminCard><p className="py-8 text-center text-sm text-muted-foreground">Loading jury integrity evidence…</p></AdminCard>
      ) : query.error ? (
        <AdminCard><p className="text-sm text-red-200">{query.error instanceof Error ? query.error.message : "Could not load jury integrity evidence."}</p></AdminCard>
      ) : cases.length ? (
        <div className="space-y-3">
          {cases.map((row) => <CaseCard key={row.id} row={row} />)}
        </div>
      ) : (
        <AdminCard>
          <div className="py-10 text-center">
            <CheckCircle2 className="mx-auto size-6 text-emerald-200" />
            <p className="mt-3 text-sm font-semibold">No jury cases match this filter</p>
            <p className="mt-1 text-xs text-muted-foreground">Jury Integrity v5 evidence appears here after country-account jury preflights run.</p>
          </div>
        </AdminCard>
      )}
    </div>
  );
}

function Metric({ label, value, icon: Icon }: { label: string; value: number; icon: typeof Scale }) {
  return (
    <AdminCard>
      <div className="flex items-center justify-between gap-3">
        <div><p className="admin-section-label">{label}</p><p className="mt-2 numeric text-2xl font-black">{value}</p></div>
        <span className="grid size-10 place-items-center rounded-xl border border-white/[0.07] bg-white/[0.03] text-muted-foreground"><Icon className="size-4" /></span>
      </div>
    </AdminCard>
  );
}

function CaseCard({ row }: { row: JuryIntegrityCase }) {
  return (
    <AdminCard strong>
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-black">{row.countryCode}</h2>
            <AdminStatus tone={row.risk >= 80 ? "danger" : row.risk >= 50 ? "attention" : "ready"}>
              Risk {row.risk}/100
            </AdminStatus>
            <AdminStatus tone="neutral">Confidence {row.confidence}/100</AdminStatus>
            <AdminStatus tone="neutral">Independence {row.independenceScore}/100</AdminStatus>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{row.editionLabel} · {row.showName}</p>
          <div className="mt-3 flex flex-wrap gap-2 text-[10px] text-muted-foreground">
            <span className="rounded-full border border-white/[0.08] px-2.5 py-1">Relationship {row.relationshipRisk}</span>
            <span className="rounded-full border border-white/[0.08] px-2.5 py-1">Peer deviation {row.peerDeviationRisk}</span>
            <span className="rounded-full border border-white/[0.08] px-2.5 py-1">{row.peerBallots} peer juries</span>
            <span className="rounded-full border border-white/[0.08] px-2.5 py-1">{row.interventionLevel.replaceAll("_", " ")}</span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {row.evidenceFamilies.map((family) => (
            <span key={family} className="rounded-full border border-amber-300/15 bg-amber-300/[0.05] px-2.5 py-1 text-[10px] font-semibold text-amber-100">
              {family.replaceAll("_", " ")}
            </span>
          ))}
        </div>
      </div>

      {row.targets.length ? (
        <div className="mt-4 overflow-x-auto rounded-xl border border-white/[0.07]">
          <table className="w-full min-w-[680px] text-left text-xs">
            <thead className="bg-white/[0.025] text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
              <tr>
                <th className="px-3 py-2.5">Target</th>
                <th className="px-3 py-2.5">Score</th>
                <th className="px-3 py-2.5">Peer expected</th>
                <th className="px-3 py-2.5">Positive deviation</th>
                <th className="px-3 py-2.5">Z-score</th>
                <th className="px-3 py-2.5">Signal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              {row.targets.slice(0, 8).map((target) => (
                <tr key={target.targetCountryId}>
                  <td className="px-3 py-2.5 font-semibold">{target.targetName}</td>
                  <td className="px-3 py-2.5 numeric">{target.score}</td>
                  <td className="px-3 py-2.5 numeric">{Math.round(target.expectedNormalizedScore * 100)}%</td>
                  <td className="px-3 py-2.5 numeric">+{Math.round(target.positiveDeviation * 100)}pp</td>
                  <td className="px-3 py-2.5 numeric">{target.zScore.toFixed(2)}</td>
                  <td className="px-3 py-2.5"><AdminStatus tone={target.risk >= 70 ? "attention" : "neutral"}>{target.risk}</AdminStatus></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </AdminCard>
  );
}
