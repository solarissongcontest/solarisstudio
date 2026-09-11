import { BookOpen, ShieldCheck } from "lucide-react";

import { RuleChip } from "@/components/rules/ContextualRuleGuide";

export function RuleDecisionStrip({
  title,
  description,
  ruleIds,
  integrity = false,
}: {
  title: string;
  description: string;
  ruleIds: string[];
  integrity?: boolean;
}) {
  const Icon = integrity ? ShieldCheck : BookOpen;

  return (
    <aside className="rounded-2xl border border-sky-200/12 bg-sky-200/[0.035] p-4" aria-label={title}>
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-sky-200/10 bg-sky-200/[0.06] text-sky-100">
          <Icon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[9px] font-black uppercase tracking-[.15em] text-sky-200/65">Rules at this decision</p>
          <p className="mt-1 text-xs font-black text-white">{title}</p>
          <p className="mt-1 text-[10px] leading-5 text-muted-foreground">{description}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {ruleIds.map((ruleId) => <RuleChip key={ruleId} ruleId={ruleId} />)}
          </div>
        </div>
      </div>
    </aside>
  );
}
