import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, BookOpen } from "lucide-react";

import { AppShell } from "@/components/AppShell";
import { RuleInterpretationsPanel } from "@/components/rules/RuleInterpretationsPanel";
import { RuleDetail } from "@/components/rules/RulesExperience";
import { usePublishedRulebook } from "@/lib/rules-governance";
import { getRuleById } from "@/lib/ssc-rules-v4";

export const Route = createFileRoute("/rules/$ruleId")({
  head: ({ params }) => {
    const rule = getRuleById(params.ruleId);
    return {
      meta: [
        {
          title: rule
            ? `${rule.id} ${rule.title} — SSC Rules`
            : "Rule not found — SSC Rules",
        },
        {
          name: "description",
          content:
            rule?.summary ??
            "Open the official Solaris Song Contest rulebook and visual rule guides.",
        },
      ],
    };
  },
  component: RulePage,
});

function RulePage() {
  const { ruleId } = Route.useParams();
  const published = usePublishedRulebook();
  const rule = getRuleById(ruleId);

  if (!rule) {
    return (
      <AppShell>
        <div className="mx-auto max-w-3xl py-10 sm:py-16">
          <div className="rounded-[2rem] border border-white/[0.08] bg-[linear-gradient(150deg,rgba(20,44,74,.84),rgba(5,18,39,.95))] p-6 text-center sm:p-10">
            <BookOpen className="mx-auto size-8 text-sky-200" />
            <p className="mt-5 text-xs font-black uppercase tracking-[.16em] text-sky-200/75">
              Official rules
            </p>
            <h1 className="mt-2 text-3xl font-black tracking-[-.04em]">
              Rule {ruleId} was not found
            </h1>
            <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-muted-foreground">
              It may have been mistyped, moved in a later rulebook version or never
              existed in the first place. The complete current regulations are still
              available from the Rules Hub.
            </p>
            <Link
              to="/rules"
              className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-xl bg-sky-200 px-4 text-sm font-bold text-slate-950 transition hover:bg-sky-100"
            >
              <ArrowLeft className="size-4" /> Back to Rules
            </Link>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div key={published.version}>
        <RuleDetail rule={rule} />
        <RuleInterpretationsPanel ruleId={rule.id} />
      </div>
    </AppShell>
  );
}
