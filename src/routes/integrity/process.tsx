import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, CheckCircle2 } from "lucide-react";

import { AppShell } from "@/components/AppShell";
import { RulesApplyingHere } from "@/components/rules/GovernanceRules";

export const Route = createFileRoute("/integrity/process")({
  head: () => ({
    meta: [
      { title: "How Trust & Integrity Works — Solaris" },
      {
        name: "description",
        content: "Understand reporting, review, findings, action and appeals in Solaris Trust & Integrity.",
      },
    ],
  }),
  component: IntegrityProcessPage,
});

const STEPS = [
  {
    title: "Report received",
    text: "Solaris creates a case and gives the reporter a durable receipt or anonymous recovery details.",
  },
  {
    title: "Triage",
    text: "An authorised reviewer checks what kind of review is needed. A report is not treated as a verdict.",
  },
  {
    title: "Review",
    text: "Evidence, context and relevant rules are assessed. TSBC may ask the reporter for more information.",
  },
  {
    title: "Finding",
    text: "The case records whether a violation was established, not established, or could not be established from the available evidence.",
  },
  {
    title: "Action",
    text: "Any sanction or remedy is recorded separately from the finding and should address the actual established breach.",
  },
  {
    title: "Appeal",
    text: "Eligible decisions can be challenged through a fresh-review process within the applicable appeal window.",
  },
];

export function IntegrityProcessPage() {
  return (
    <AppShell>
      <div className="mx-auto max-w-4xl pb-20">
        <header className="border-b border-border/65 pb-5">
          <p className="text-xs font-black uppercase tracking-[0.12em] text-emerald-200">Trust & Integrity</p>
          <h1 className="mt-2 text-3xl font-black tracking-[-0.04em]">How the process works</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Reports, findings, action and appeals are deliberately separate. That makes the process easier to understand and harder to confuse with a presumption of guilt.
          </p>
        </header>

        <ol className="mt-6">
          {STEPS.map((step, index) => (
            <li key={step.title} className="relative grid grid-cols-[2.5rem_minmax(0,1fr)] gap-3 pb-7">
              {index < STEPS.length - 1 ? (
                <span className="absolute bottom-0 left-[1.2rem] top-9 w-px bg-border" />
              ) : null}
              <span className="z-10 grid size-10 place-items-center rounded-full border border-emerald-300/20 bg-background font-mono text-xs font-black text-emerald-200">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div className="pt-1">
                <h2 className="text-lg font-bold">{step.title}</h2>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">{step.text}</p>
              </div>
            </li>
          ))}
        </ol>

        <section className="mt-3 border-y border-border/60 py-5">
          <div className="flex gap-3">
            <CheckCircle2 className="mt-0.5 size-4.5 shrink-0 text-emerald-200" />
            <div>
              <h2 className="text-sm font-bold">What the process does not mean</h2>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                A report, automated voting signal or open investigation does not itself establish misconduct. The Rules and Integrity system preserves that distinction all the way through the case lifecycle.
              </p>
            </div>
          </div>
        </section>

        <RulesApplyingHere context="integrity.report" initiallyExpanded primaryLimit={3} className="mt-6" />

        <div className="mt-6 flex flex-wrap gap-2">
          <Link to="/integrity/report/category" search={{}} className="inline-flex min-h-11 items-center rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground">
            Report a concern <ArrowRight className="ml-1 size-4" />
          </Link>
          <Link to="/integrity/privacy" className="inline-flex min-h-11 items-center rounded-xl border border-border bg-surface px-4 text-sm font-bold">
            Privacy & anonymity
          </Link>
        </div>
      </div>
    </AppShell>
  );
}
