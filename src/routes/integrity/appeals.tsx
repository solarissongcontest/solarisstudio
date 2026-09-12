import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, EyeOff, Gavel, KeyRound, RefreshCw, ShieldCheck } from "lucide-react";

import { AppShell } from "@/components/AppShell";
import { formatIntegrityStatus, getIntegrityCategory } from "@/lib/integrity";
import {
  getCurrentIntegrityUser,
  listProtectedIntegrityCases,
} from "@/lib/integrity-portal";

export const Route = createFileRoute("/integrity/appeals")({
  head: () => ({
    meta: [
      { title: "Integrity Appeals & Decisions — Solaris" },
      {
        name: "description",
        content:
          "Open sanctions and appeals for your protected Integrity cases or continue with anonymous recovery credentials.",
      },
    ],
  }),
  component: IntegrityAppealsLanding,
});

function IntegrityAppealsLanding() {
  const userQuery = useQuery({
    queryKey: ["integrity-user"],
    queryFn: getCurrentIntegrityUser,
  });
  const casesQuery = useQuery({
    queryKey: ["integrity-protected-cases"],
    queryFn: listProtectedIntegrityCases,
    enabled: Boolean(userQuery.data),
  });

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl pb-20">
        <Link
          to="/integrity"
          className="inline-flex items-center gap-2 text-xs font-bold text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" /> Trust & Integrity
        </Link>

        <section className="mt-5 overflow-hidden rounded-[2rem] border border-amber-200/14 bg-[linear-gradient(145deg,rgba(83,58,18,.28),rgba(5,19,42,.96))] p-6 sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[.18em] text-amber-200/70">
                APPEALS & DECISIONS
              </p>
              <h1 className="mt-2 text-4xl font-black tracking-[-.05em] sm:text-5xl">
                Review a sanction. Challenge it if needed.
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
                Protected cases use your Solaris account. Fully anonymous cases stay separate and require the original case code and recovery key. The ordinary SSC appeal window is 48 hours unless TSBC records an exceptional extension.
              </p>
            </div>
            <Gavel className="size-8 shrink-0 text-amber-200" />
          </div>
        </section>

        <section className="mt-5 grid gap-4 lg:grid-cols-[1fr_.72fr]">
          <div className="rounded-[1.6rem] border border-white/[0.08] bg-white/[0.025] p-5">
            <div className="flex items-center gap-2">
              <ShieldCheck className="size-4 text-emerald-200" />
              <h2 className="font-black">My protected cases</h2>
            </div>

            {userQuery.isLoading ? (
              <div className="mt-5 flex items-center gap-2 text-sm text-muted-foreground">
                <RefreshCw className="size-4 animate-spin" /> Checking sign-in…
              </div>
            ) : !userQuery.data ? (
              <div className="mt-5 rounded-xl border border-sky-200/12 bg-sky-200/[0.035] p-5">
                <KeyRound className="size-5 text-sky-200" />
                <p className="mt-3 font-bold">Sign in to open protected cases</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Sealed and confidential cases are recovered through the Solaris account that created them.
                </p>
                <Link
                  to="/auth"
                  className="mt-4 inline-flex min-h-10 items-center rounded-xl bg-sky-200 px-3 text-xs font-black text-slate-950"
                >
                  Sign in
                </Link>
              </div>
            ) : casesQuery.isLoading ? (
              <div className="mt-5 flex items-center gap-2 text-sm text-muted-foreground">
                <RefreshCw className="size-4 animate-spin" /> Loading cases…
              </div>
            ) : (casesQuery.data ?? []).length ? (
              <div className="mt-4 space-y-2">
                {(casesQuery.data ?? []).map((item) => {
                  const status = formatIntegrityStatus(item.status);
                  const category = getIntegrityCategory(item.category);
                  return (
                    <Link
                      key={item.id}
                      to="/integrity/appeal/$caseId"
                      params={{ caseId: item.id }}
                      className="group block rounded-xl border border-white/[0.07] bg-black/10 p-4 transition hover:border-amber-200/18 hover:bg-amber-200/[0.035]"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex flex-wrap gap-2">
                            <span className="font-mono text-[10px] font-black text-sky-200">
                              {item.public_code}
                            </span>
                            <span className="text-[9px] uppercase text-muted-foreground">
                              {item.identity_mode}
                            </span>
                          </div>
                          <p className="mt-2 text-sm font-black">{item.summary}</p>
                          <p className="mt-1 text-[10px] text-muted-foreground">
                            {category.label} · {status.label}
                          </p>
                        </div>
                        <ArrowRight className="mt-1 size-4 shrink-0 text-muted-foreground transition group-hover:translate-x-1" />
                      </div>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <p className="mt-5 rounded-xl border border-dashed border-white/[0.08] p-5 text-sm text-muted-foreground">
                No sealed or confidential cases are linked to this account.
              </p>
            )}
          </div>

          <div className="space-y-4">
            <div className="rounded-[1.6rem] border border-emerald-200/12 bg-emerald-200/[0.035] p-5">
              <EyeOff className="size-5 text-emerald-200" />
              <h2 className="mt-3 font-black">Fully anonymous case</h2>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                Anonymous cases never use your signed-in account. Open the appeal tool with the case code and recovery key you received when the case was created.
              </p>
              <Link
                to="/integrity/anonymous-appeal"
                className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-xl border border-emerald-200/14 bg-emerald-200/[0.05] px-3 text-xs font-black text-emerald-50"
              >
                Anonymous appeal recovery <ArrowRight className="size-3.5" />
              </Link>
            </div>

            <div className="rounded-[1.6rem] border border-white/[0.08] bg-white/[0.025] p-5">
              <p className="text-[9px] font-black uppercase tracking-[.13em] text-muted-foreground">
                APPEAL RULES
              </p>
              <p className="mt-3 text-xs leading-5 text-muted-foreground">
                An appeal should identify what was wrong with the decision, evidence assessment, rule application or sanction level and state the result you are asking for. The original decision remains in the audit history even if the appeal changes the outcome.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link to="/rules/$ruleId" params={{ ruleId: "18.1" }} className="rounded-lg border border-white/[0.08] px-2.5 py-1.5 text-[10px] font-bold text-sky-200">Rule 18.1</Link>
                <Link to="/rules/$ruleId" params={{ ruleId: "18.2" }} className="rounded-lg border border-white/[0.08] px-2.5 py-1.5 text-[10px] font-bold text-sky-200">Rule 18.2</Link>
                <Link to="/rules/$ruleId" params={{ ruleId: "18.3" }} className="rounded-lg border border-white/[0.08] px-2.5 py-1.5 text-[10px] font-bold text-sky-200">Rule 18.3</Link>
              </div>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
