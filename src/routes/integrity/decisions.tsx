import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, BadgeCheck } from "lucide-react";

import { AppShell } from "@/components/AppShell";
import { GovernanceDepthLayout } from "@/components/SolarisDepth";
import {
  getPublicIntegrityDecisions,
  getPublicIntegrityStats,
} from "@/lib/integrity-portal";

export const Route = createFileRoute("/integrity/decisions")({
  head: () => ({
    meta: [
      { title: "Integrity Decisions & Transparency — Solaris" },
      {
        name: "description",
        content: "Read anonymised published Integrity decisions and aggregate Trust & Integrity statistics.",
      },
    ],
  }),
  component: IntegrityDecisionsPage,
});

export function IntegrityDecisionsPage() {
  const stats = useQuery({
    queryKey: ["integrity-public-stats", "v5"],
    queryFn: getPublicIntegrityStats,
    staleTime: 5 * 60_000,
  });
  const decisions = useQuery({
    queryKey: ["integrity-public-decisions", "v5"],
    queryFn: getPublicIntegrityDecisions,
    staleTime: 5 * 60_000,
  });

  return (
    <AppShell>
      <GovernanceDepthLayout tone="integrity" context="integrity" className="mx-auto max-w-5xl pb-20">
        <header className="border-b border-border/65 pb-5">
          <p className="text-xs font-black uppercase tracking-[0.12em] text-emerald-200">Trust & Integrity</p>
          <h1 className="mt-2 text-3xl font-black tracking-[-0.04em]">Published decisions</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Public precedent is anonymised. Private reports, reporter identities and unpublished case material do not appear here.
          </p>
        </header>

        {stats.data ? (
          <section className="mt-6 grid grid-cols-2 gap-x-5 gap-y-4 border-y border-border/60 py-4 sm:grid-cols-4">
            <Stat label="Cases" value={stats.data.total_cases} />
            <Stat label="Open" value={stats.data.open_cases} />
            <Stat label="Resolved" value={stats.data.resolved_cases} />
            <Stat label="Violations confirmed" value={stats.data.violations_confirmed} />
          </section>
        ) : null}

        <section className="mt-7" aria-labelledby="published-integrity-decisions">
          <h2 id="published-integrity-decisions" className="text-lg font-bold">Anonymised precedent</h2>
          {decisions.isLoading ? (
            <p className="mt-3 text-sm text-muted-foreground">Loading published decisions…</p>
          ) : decisions.isError ? (
            <p className="mt-3 text-sm text-muted-foreground">Published decisions are temporarily unavailable.</p>
          ) : decisions.data?.length ? (
            <div className="mt-3 divide-y divide-border/60 border-y border-border/60">
              {decisions.data.map((decision) => (
                <article key={decision.id} className="py-5">
                  <div className="flex items-start gap-3">
                    <BadgeCheck className="mt-0.5 size-4.5 shrink-0 text-emerald-200" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold">{decision.title}</p>
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">{decision.summary}</p>
                      <p className="mt-2 text-xs leading-5 text-muted-foreground">{decision.rationale}</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {decision.rule_ids.map((ruleId) => (
                          <Link
                            key={ruleId}
                            to="/rules/$ruleId"
                            params={{ ruleId }}
                            className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-border px-2.5 font-mono text-xs font-bold text-primary"
                          >
                            Rule {ruleId} <ArrowRight className="size-3" />
                          </Link>
                        ))}
                      </div>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">No anonymised public decisions have been published yet.</p>
          )}
        </section>
      </GovernanceDepthLayout>
    </AppShell>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-2xl font-black">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
