import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, CheckCircle2, ClipboardCheck, ShieldCheck, Vote } from "lucide-react";

import { AppShell, PageHeader } from "@/components/AppShell";

export const Route = createFileRoute("/participate/")({
  head: () => ({
    meta: [
      { title: "Participate — Solaris Studio" },
      {
        name: "description",
        content: "Confirm your Solaris Song Contest participation or vote in an open televoting round.",
      },
    ],
  }),
  component: ParticipatePage,
});

function ParticipatePage() {
  return (
    <AppShell>
      <PageHeader
        eyebrow="Participate"
        title="Take part in Solaris"
        description="Everything you need to enter the contest or vote, in one place."
      />

      <section className="grid gap-3 md:grid-cols-2">
        <ParticipationCard
          to="/confirmations"
          eyebrow="Delegations"
          title="Confirmations"
          description="Confirm participation, update your entry or recover an existing response."
          icon={ClipboardCheck}
          details={[
            "Submit or update your confirmation",
            "Recover an existing response",
            "Join Next in Line when available",
          ]}
        />

        <ParticipationCard
          to="/televoting"
          eyebrow="Audience voting"
          title="Televoting"
          description="Open the current voting round, check the rules and cast your ballot."
          icon={Vote}
          details={[
            "20-point ballot",
            "Live round status",
            "Built-in integrity checks",
          ]}
        />
      </section>
    </AppShell>
  );
}

function ParticipationCard({
  to,
  eyebrow,
  title,
  description,
  icon: Icon,
  details,
}: {
  to: string;
  eyebrow: string;
  title: string;
  description: string;
  icon: typeof ClipboardCheck;
  details: string[];
}) {
  return (
    <Link
      to={to as any}
      className="solaris-family-card group relative block min-w-0 overflow-hidden rounded-[1.6rem] border p-5 sm:p-6"
    >
      <div className="solaris-family-card-overlay pointer-events-none absolute inset-0" />
      <div className="relative z-10 min-w-0">
        <div className="flex items-start justify-between gap-4">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-primary/20 bg-primary/[0.08] text-primary">
            <Icon className="size-4.5" />
          </span>
          <span className="grid size-9 shrink-0 place-items-center rounded-full border border-white/10 bg-white/[0.035] text-primary transition-transform group-hover:translate-x-0.5">
            <ArrowRight className="size-4" />
          </span>
        </div>

        <p className="mt-5 text-[9px] font-black uppercase tracking-[0.2em] text-primary">{eyebrow}</p>
        <h2 className="display-headline mt-1 text-3xl leading-[0.95] text-white sm:text-4xl">{title}</h2>
        <p className="mt-3 max-w-lg text-sm leading-relaxed text-muted-foreground">{description}</p>

        <div className="mt-5 space-y-2 border-t border-border/55 pt-4">
          {details.map((detail) => (
            <div key={detail} className="flex items-center gap-2 text-xs text-muted-foreground">
              {detail.toLowerCase().includes("integrity") ? (
                <ShieldCheck className="size-3.5 shrink-0 text-primary" />
              ) : (
                <CheckCircle2 className="size-3.5 shrink-0 text-primary" />
              )}
              <span>{detail}</span>
            </div>
          ))}
        </div>
      </div>
    </Link>
  );
}
