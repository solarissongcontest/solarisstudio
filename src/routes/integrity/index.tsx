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
        content: "Report concerns, add evidence, follow case updates and appeal eligible decisions.",
      },
    ],
  }),
  component: IntegrityPage,
});

function IntegrityPage() {
  return (
    <AppShell>
      <section className="rounded-[1.6rem] border border-emerald-300/12 bg-[linear-gradient(145deg,rgba(16,62,66,.34),rgba(5,19,42,.9)_60%,rgba(41,31,78,.72))] p-5 sm:p-7">
        <div className="flex items-center gap-2 text-emerald-100">
          <ShieldCheck className="size-4" />
          <p className="text-[9px] font-black uppercase tracking-[.17em]">Trust & Integrity</p>
        </div>
        <h1 className="mt-3 text-3xl font-black tracking-[-.04em] text-white sm:text-4xl">Trust & Integrity</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-200/75">Report concerns, add evidence and follow case updates securely.</p>
      </section>

      <div className="[&>div>section:first-child]:hidden">
        <TrustIntegrityHub />
      </div>

      <div className="mx-auto -mt-10 mb-20 grid max-w-6xl gap-4 lg:grid-cols-2">
        <section className="rounded-[1.35rem] border border-sky-200/10 bg-sky-200/[0.025] p-4 sm:p-5">
          <div className="flex h-full flex-col gap-4">
            <div className="flex items-start gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-sky-200/10 bg-sky-200/[0.04] text-sky-100">
                <MessageCircleQuestion className="size-4" />
              </span>
              <div>
                <p className="text-[9px] font-black uppercase tracking-[.15em] text-sky-200/65">Private rule guidance</p>
                <h2 className="mt-1 text-sm font-black">Rule rulings</h2>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">Review private rulings tied to current SSC rules.</p>
              </div>
            </div>
            <Link to="/integrity/preclearance" className="mt-auto inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-sky-200/12 bg-sky-200/[0.04] px-4 text-xs font-black text-sky-50 transition hover:bg-sky-200/[0.08]">
              <MessageCircleQuestion className="size-4" /> My rule rulings <ArrowRight className="size-3.5" />
            </Link>
          </div>
        </section>

        <section className="rounded-[1.35rem] border border-amber-200/10 bg-amber-200/[0.025] p-4 sm:p-5">
          <div className="flex h-full flex-col gap-4">
            <div className="flex items-start gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-amber-200/10 bg-amber-200/[0.04] text-amber-100">
                <Gavel className="size-4" />
              </span>
              <div>
                <p className="text-[9px] font-black uppercase tracking-[.15em] text-amber-200/65">Appeals</p>
                <h2 className="mt-1 text-sm font-black">Appeal a decision</h2>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">Open an eligible protected or anonymous appeal.</p>
              </div>
            </div>
            <div className="mt-auto flex flex-col gap-2 sm:flex-row">
              <Link to="/integrity/appeals" className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-sky-200/12 bg-sky-200/[0.04] px-4 text-xs font-black text-sky-50 transition hover:bg-sky-200/[0.08]">
                <ShieldCheck className="size-4" /> Protected cases <ArrowRight className="size-3.5" />
              </Link>
              <Link to="/integrity/anonymous-appeal" className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-amber-200/12 bg-amber-200/[0.04] px-4 text-xs font-black text-amber-50 transition hover:bg-amber-200/[0.08]">
                <KeyRound className="size-4" /> Anonymous appeal
              </Link>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
