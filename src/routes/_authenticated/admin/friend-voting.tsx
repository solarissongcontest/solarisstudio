import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ShieldAlert, UserRoundCog } from "lucide-react";
import { useMemo, useState } from "react";

import { AdminCard, AdminPageHeader, AdminStatus } from "@/components/admin/AdminUI";
import { getMergedTelevotingIntelligence } from "@/integrations/televoting/intelligence.functions";
import { useEditions } from "@/lib/data";

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
  const getIntelligence = useServerFn(getMergedTelevotingIntelligence);
  const { data: editions = [] } = useEditions();
  const [editionId, setEditionId] = useState("");

  const sortedEditions = useMemo(
    () => [...editions].sort((a, b) => (b.edition_number ?? -1) - (a.edition_number ?? -1)),
    [editions],
  );

  const intelligence = useQuery({
    queryKey: ["friend-voting-admin", editionId],
    queryFn: () => getIntelligence({ data: { lens: "hod", channel: "combined", editionId } }),
    enabled: Boolean(editionId),
    staleTime: 60_000,
  });

  const topRelationships = useMemo(
    () => [...(intelligence.data?.relationships ?? [])].sort((a, b) => b.riskScore - a.riskScore).slice(0, 30),
    [intelligence.data?.relationships],
  );

  return (
    <div className="mx-auto max-w-7xl">
      <AdminPageHeader
        eyebrow="Integrity intelligence"
        title="Friend-voting intelligence"
        description="Compare jury and televote relationships, historical anomalies, reciprocity and coordinated voting patterns. Analysis is loaded one edition at a time to stay within Cloudflare Worker CPU limits."
        actions={
          <Link to="/admin/hod-history" className="admin-action-secondary">
            <UserRoundCog className="size-4" /> HOD history
          </Link>
        }
      />

      <AdminCard strong>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0 flex-1">
            <label className="admin-section-label">Edition to analyse</label>
            <select
              value={editionId}
              onChange={(event) => setEditionId(event.target.value)}
              className="mt-2 min-h-11 w-full rounded-xl border border-white/[0.1] bg-white/[0.035] px-3 text-sm text-foreground outline-none focus:border-sky-200/30 sm:max-w-md"
            >
              <option value="">Choose an edition</option>
              {sortedEditions.map((edition) => (
                <option key={edition.id} value={edition.id}>
                  SSC{edition.edition_number ?? "?"} · {edition.name}
                </option>
              ))}
            </select>
          </div>
          {editionId ? <AdminStatus tone={intelligence.isFetching ? "neutral" : "info"}>{intelligence.isFetching ? "Analysing…" : "Edition scoped"}</AdminStatus> : null}
        </div>
      </AdminCard>

      {!editionId ? (
        <AdminCard className="mt-4">
          <div className="py-10 text-center">
            <ShieldAlert className="mx-auto size-7 text-sky-100/70" />
            <h2 className="mt-3 text-lg font-semibold">Choose an edition first</h2>
            <p className="mx-auto mt-2 max-w-2xl text-sm text-muted-foreground">
              The previous page analysed the entire voting archive on every load, which could exceed the Worker CPU limit. Edition-scoped analysis avoids that while keeping the same HOD-aware model.
            </p>
          </div>
        </AdminCard>
      ) : intelligence.isLoading ? (
        <AdminCard className="mt-4"><p className="py-10 text-center text-sm text-muted-foreground">Building friend-voting analysis…</p></AdminCard>
      ) : intelligence.error ? (
        <AdminCard className="mt-4 !border-rose-200/15 !bg-rose-200/[0.045]">
          <p className="text-sm text-rose-100">{intelligence.error instanceof Error ? intelligence.error.message : "Friend-voting analysis could not be loaded."}</p>
        </AdminCard>
      ) : intelligence.data ? (
        <>
          <section className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-8">
            {[
              ["TV ballots", intelligence.data.stats.ballots],
              ["Jury ballots", intelligence.data.stats.juryBallots],
              ["Suspicious", intelligence.data.stats.suspicious],
              ["High risk", intelligence.data.stats.highRisk],
              ["Relationships", intelligence.data.stats.relationships],
              ["Need attention", intelligence.data.stats.attentionRelationships],
              ["Groups", intelligence.data.coordination.stats.groups],
              ["HOD unknown", intelligence.data.stats.hodUnknownEditionCountries],
            ].map(([label, value]) => (
              <AdminCard key={String(label)}>
                <p className="admin-section-label">{label}</p>
                <p className="mt-2 text-2xl font-semibold">{value}</p>
              </AdminCard>
            ))}
          </section>

          <AdminCard className="mt-4">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="admin-section-label">Relationship evidence</p>
                <h2 className="mt-1 text-xl font-bold">Highest-risk relationships</h2>
              </div>
              <AdminStatus tone="info">Top {topRelationships.length}</AdminStatus>
            </div>

            <div className="divide-y divide-white/[0.07]">
              {topRelationships.map((row) => (
                <div key={`${row.identityKey}>${row.targetCode}`} className="grid gap-3 py-3 md:grid-cols-[1fr_auto] md:items-center">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">{row.votingCountry} → {row.targetCountry}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {row.controllerName ? `HOD: ${row.controllerName} · ` : ""}{row.reasons.join(" · ") || "No elevated evidence signal"}
                    </p>
                  </div>
                  <div className="flex gap-2 text-xs">
                    <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1">Risk {row.riskScore}</span>
                    <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-muted-foreground">Confidence {row.confidence}%</span>
                  </div>
                </div>
              ))}
              {!topRelationships.length ? <p className="py-8 text-center text-sm text-muted-foreground">No relationships were found for this edition.</p> : null}
            </div>
          </AdminCard>
        </>
      ) : null}
    </div>
  );
}
