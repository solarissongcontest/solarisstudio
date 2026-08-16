import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, CheckCircle2, ClipboardCheck, ShieldCheck, Vote } from "lucide-react";

import { AppShell, PageHeader } from "@/components/AppShell";

export const Route = createFileRoute("/participate/")({
  head: () => ({
    meta: [
      { title: "Participate — Solaris Studio" },
      {
        name: "description",
        content: "Confirm your Solaris Song Contest participation or enter the live televoting portal.",
      },
    ],
  }),
  component: ParticipatePage,
});

function ParticipatePage() {
  return (
    <AppShell>
      <PageHeader
        eyebrow="Participation"
        title="Take part in Solaris"
        description="Confirm your delegation, manage an existing response, or enter the live televote from one Solaris participation portal."
      />

      <section className="grid gap-4 lg:grid-cols-2">
        <Link
          to="/confirmations"
          className="glass-strong group relative min-h-[310px] overflow-hidden p-6 sm:p-8"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="grid size-12 place-items-center rounded-2xl border border-pink-200/15 bg-pink-200/10 text-pink-100">
              <ClipboardCheck className="size-5" />
            </div>
            <ArrowRight className="size-5 text-white/30 transition group-hover:translate-x-1 group-hover:text-white/70" />
          </div>

          <p className="mt-10 text-[10px] font-medium uppercase tracking-[0.22em] text-pink-100/65">
            Delegations
          </p>
          <h2 className="font-display mt-2 text-4xl uppercase leading-none sm:text-5xl">
            Confirmations
          </h2>
          <p className="mt-4 max-w-lg text-sm leading-relaxed text-muted-foreground">
            Confirm participation, selection method and entry information. Recover or edit an existing response and join Next in Line from the same module.
          </p>

          <div className="mt-6 flex flex-wrap gap-2 text-[11px] text-white/45">
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5">New confirmation</span>
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5">Recover response</span>
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5">Next in Line</span>
          </div>
        </Link>

        <Link
          to="/televoting"
          className="glass-strong group relative min-h-[310px] overflow-hidden p-6 sm:p-8"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="grid size-12 place-items-center rounded-2xl border border-sky-200/15 bg-sky-200/10 text-sky-100">
              <Vote className="size-5" />
            </div>
            <ArrowRight className="size-5 text-white/30 transition group-hover:translate-x-1 group-hover:text-white/70" />
          </div>

          <p className="mt-10 text-[10px] font-medium uppercase tracking-[0.22em] text-sky-100/65">
            Audience voting
          </p>
          <h2 className="font-display mt-2 text-4xl uppercase leading-none sm:text-5xl">
            Televoting
          </h2>
          <p className="mt-4 max-w-lg text-sm leading-relaxed text-muted-foreground">
            See the live voting round, review the rules and cast a ballot when voting is open, with duplicate and integrity checks applied automatically.
          </p>

          <div className="mt-6 flex flex-wrap gap-2 text-[11px] text-white/45">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5"><CheckCircle2 className="size-3" /> 20-point ballot</span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5"><ShieldCheck className="size-3" /> Integrity checks</span>
          </div>
        </Link>
      </section>

      <section className="mt-5 glass p-5 sm:p-6">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-white/40">One Solaris front door</p>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
          Delegation confirmations and audience voting use the same Solaris navigation and design language, so participants can move between contest information and participation without leaving Studio.
        </p>
      </section>
    </AppShell>
  );
}
