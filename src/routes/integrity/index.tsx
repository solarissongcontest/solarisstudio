import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Gavel, KeyRound, MessageCircleQuestion, ShieldCheck } from "lucide-react";

import { AppShell } from "@/components/AppShell";
import { TrustIntegrityHub } from "@/components/integrity/TrustIntegrityHub";

export const Route = createFileRoute("/integrity/")({
  head: () => ({
    meta: [
      { title: "Trust & Integrity — Solaris Song Contest" },
      {
        name: "description",
        content:
          "Report concerns anonymously, use sealed or confidential reporting, ask TSBC privately, follow protected cases, review private rule rulings, appeal decisions and review anonymised SSC integrity precedents.",
      },
    ],
  }),
  component: IntegrityPage,
});

function IntegrityPage() {
  return (
    <AppShell>
      <TrustIntegrityHub />
      <div className="mx-auto -mt-10 mb-20 grid max-w-6xl gap-4 lg:grid-cols-2">
        <section className="rounded-[1.5rem] border border-sky-200/12 bg-sky-200/[0.035] p-4 sm:p-5">
          <div className="flex h-full flex-col gap-4">
            <div className="flex items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-sky-200/12 bg-sky-200/[0.05] text-sky-100">
                <MessageCircleQuestion className="size-4" />
              </span>
              <div>
                <p className="text-[9px] font-black uppercase tracking-[.15em] text-sky-200/70">Private rule guidance</p>
                <h2 className="mt-1 text-sm font-black">Review rulings issued before you act</h2>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Protected “Ask TSBC privately” cases can receive dated pre-clearance rulings tied to exact current rules. Broader guidance is published separately if it later becomes an Official Interpretation.
                </p>
              </div>
            </div>
            <Link
              to="/integrity/preclearance"
              className="mt-auto inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-sky-200/15 bg-sky-200/[0.055] px-4 text-xs font-black text-sky-50 transition hover:bg-sky-200/[0.1]"
            >
              <MessageCircleQuestion className="size-4" /> My rule rulings <ArrowRight className="size-3.5" />
            </Link>
          </div>
        </section>

        <section className="rounded-[1.5rem] border border-amber-200/12 bg-amber-200/[0.035] p-4 sm:p-5">
          <div className="flex h-full flex-col gap-4">
            <div className="flex items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-amber-200/12 bg-amber-200/[0.05] text-amber-100">
                <Gavel className="size-4" />
              </span>
              <div>
                <p className="text-[9px] font-black uppercase tracking-[.15em] text-amber-200/70">Appeals</p>
                <h2 className="mt-1 text-sm font-black">Challenge a reporter-visible sanction</h2>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Protected sealed/confidential cases use your Solaris account. Fully anonymous reporters recover the decision separately with the original case code and recovery key.
                </p>
              </div>
            </div>
            <div className="mt-auto flex flex-col gap-2 sm:flex-row">
              <Link
                to="/integrity/appeals"
                className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-sky-200/15 bg-sky-200/[0.055] px-4 text-xs font-black text-sky-50 transition hover:bg-sky-200/[0.1]"
              >
                <ShieldCheck className="size-4" /> Protected cases <ArrowRight className="size-3.5" />
              </Link>
              <Link
                to="/integrity/anonymous-appeal"
                className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-amber-200/15 bg-amber-200/[0.06] px-4 text-xs font-black text-amber-50 transition hover:bg-amber-200/[0.1]"
              >
                <KeyRound className="size-4" /> Anonymous appeal
              </Link>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
