import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, EyeOff, Gavel, KeyRound, ShieldCheck } from "lucide-react";

import { AppShell } from "@/components/AppShell";
import { GovernanceDepthLayout } from "@/components/SolarisDepth";
import { RulesApplyingHere } from "@/components/rules/GovernanceRules";
import { formatIntegrityStatus, getIntegrityCategory } from "@/lib/integrity";
import {
  getCurrentIntegrityUser,
  listProtectedIntegrityCases,
} from "@/lib/integrity-portal";

export const Route = createFileRoute("/integrity/appeals")({
  head: () => ({
    meta: [
      { title: "Integrity Appeals — Solaris" },
      { name: "robots", content: "noindex" },
      {
        name: "description",
        content:
          "Review eligible Trust & Integrity decisions and request fresh review through the SSC appeal process.",
      },
    ],
  }),
  component: IntegrityAppealsLanding,
});

function IntegrityAppealsLanding() {
  const userQuery = useQuery({
    queryKey: ["integrity-user", "appeals-v5"],
    queryFn: getCurrentIntegrityUser,
  });
  const casesQuery = useQuery({
    queryKey: ["integrity-protected-cases", "appeals-v5"],
    queryFn: listProtectedIntegrityCases,
    enabled: Boolean(userQuery.data),
  });

  return (
    <AppShell>
      <GovernanceDepthLayout tone="integrity" context="integrity" className="mx-auto max-w-4xl pb-20">
        <header className="border-b border-border/65 pb-5">
          <div className="flex items-center gap-2 text-amber-200">
            <Gavel className="size-4" />
            <p className="text-xs font-black uppercase tracking-[0.12em]">
              Trust & Integrity
            </p>
          </div>
          <h1 className="mt-3 text-3xl font-black tracking-[-0.04em]">
            Appeal a decision
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            An appeal is a separate review of an eligible decision. It does not erase the original record, and it should be reviewed freshly where another eligible reviewer is available.
          </p>
        </header>

        <RulesApplyingHere
          context="integrity.appeal"
          title="Appeal rules"
          initiallyExpanded
          primaryLimit={2}
          className="mt-5"
        />

        <section className="mt-7" aria-labelledby="protected-appeals">
          <div className="flex items-end justify-between gap-3 border-b border-border/65 pb-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.12em] text-muted-foreground">
                Protected cases
              </p>
              <h2 id="protected-appeals" className="mt-1 text-xl font-bold">
                Review your decisions
              </h2>
            </div>
            <ShieldCheck className="size-5 text-emerald-200" />
          </div>

          {userQuery.isLoading ? (
            <p className="py-6 text-sm text-muted-foreground">Checking sign-in…</p>
          ) : !userQuery.data ? (
            <div className="py-6">
              <p className="text-sm font-semibold">Sign in to see protected cases</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Sealed and confidential cases use your Solaris account for recovery.
              </p>
              <Link
                to="/auth"
                className="mt-3 inline-flex min-h-10 items-center text-sm font-bold text-primary"
              >
                Sign in
              </Link>
            </div>
          ) : casesQuery.isLoading ? (
            <p className="py-6 text-sm text-muted-foreground">Loading protected cases…</p>
          ) : (casesQuery.data ?? []).length ? (
            <div className="divide-y divide-border/60">
              {(casesQuery.data ?? []).map((item) => {
                const status = formatIntegrityStatus(item.status);
                const category = getIntegrityCategory(item.category);
                return (
                  <Link
                    key={item.id}
                    to="/integrity/appeal/$caseId"
                    params={{ caseId: item.id }}
                    className="flex min-h-20 items-center gap-3 py-4"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-[11px] font-black text-primary">
                          {item.public_code}
                        </span>
                        <span className="text-[11px] font-semibold text-muted-foreground">
                          {status.label}
                        </span>
                      </span>
                      <span className="mt-1 block text-sm font-semibold">{item.summary}</span>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {category.label} · {item.identity_mode === "sealed" ? "Sealed" : "Confidential"}
                      </span>
                    </span>
                    <span className="text-xs font-bold text-primary">Review</span>
                    <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
                  </Link>
                );
              })}
            </div>
          ) : (
            <p className="py-6 text-sm text-muted-foreground">
              No sealed or confidential cases are linked to this account.
            </p>
          )}
        </section>

        <section className="mt-7 border-t border-border/65 pt-5" aria-labelledby="anonymous-appeal">
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-border/70 bg-surface/45 text-emerald-200">
              <EyeOff className="size-4.5" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 id="anonymous-appeal" className="text-lg font-bold">
                Fully anonymous case
              </h2>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                Anonymous cases never use your signed-in account. Use the original case code and recovery key to review an eligible decision and submit an appeal.
              </p>
              <Link
                to="/integrity/anonymous-appeal"
                className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-surface/45 px-4 text-sm font-bold"
              >
                <KeyRound className="size-4" /> Recover anonymous decision
              </Link>
            </div>
          </div>
        </section>
      </GovernanceDepthLayout>
    </AppShell>
  );
}
