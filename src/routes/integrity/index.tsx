import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Gavel, KeyRound, ShieldCheck } from "lucide-react";

import { AppShell } from "@/components/AppShell";
import { TrustIntegrityHub } from "@/components/integrity/TrustIntegrityHub";

export const Route = createFileRoute("/integrity/")({
  head: () => ({
    meta: [
      { title: "Trust & Integrity — Solaris Song Contest" },
      {
        name: "description",
        content:
          "Report concerns anonymously, use sealed or confidential reporting, ask TSBC privately, follow protected cases, appeal decisions and review anonymised SSC integrity precedents.",
      },
    ],
  }),
  component: IntegrityPage,
});

function IntegrityPage() {
  return (
    <AppShell>
      <TrustIntegrityHub />
      <section className="mx-auto -mt-10 mb-20 max-w-6xl rounded-[1.5rem] border border-amber-200/12 bg-amber-200/[0.035] p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-amber-200/12 bg-amber-200/[0.05] text-amber-100">
              <Gavel className="size-4" />
            </span>
            <div>
              <p className="text-[9px] font-black uppercase tracking-[.15em] text-amber-200/70">Appeals</p>
              <h2 className="mt-1 text-sm font-black">Challenge a reporter-visible sanction</h2>
              <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">
                Protected sealed/confidential cases use your Solaris account. Fully anonymous reporters recover the decision separately with the original case code and recovery key.
              </p>
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Link
              to="/integrity/appeals"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-sky-200/15 bg-sky-200/[0.055] px-4 text-xs font-black text-sky-50 transition hover:bg-sky-200/[0.1]"
            >
              <ShieldCheck className="size-4" /> Protected cases <ArrowRight className="size-3.5" />
            </Link>
            <Link
              to="/integrity/anonymous-appeal"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-amber-200/15 bg-amber-200/[0.06] px-4 text-xs font-black text-amber-50 transition hover:bg-amber-200/[0.1]"
            >
              <KeyRound className="size-4" /> Anonymous appeal
            </Link>
          </div>
        </div>
      </section>
    </AppShell>
  );
}
