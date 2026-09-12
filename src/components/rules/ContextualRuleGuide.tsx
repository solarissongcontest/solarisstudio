import { Link } from "@tanstack/react-router";
import { BookOpen, Scale, ShieldCheck, type LucideIcon } from "lucide-react";

import { getRuleContext, type RuleContextKey } from "@/lib/rule-context";
import { getRuleById } from "@/lib/ssc-rules-v4";
import { cn } from "@/lib/utils";

export type RuleContext = {
  title: string;
  intro: string;
  ruleIds: string[];
  sourcePath: string;
  icon: LucideIcon;
};

const CONTEXT_ICON: Record<RuleContextKey, LucideIcon> = {
  confirmations: BookOpen,
  televoting: ShieldCheck,
  "voting-integrity": ShieldCheck,
  jury: Scale,
  integrity: ShieldCheck,
  entries: BookOpen,
  "hosting-media": BookOpen,
};

export function routeContext(pathname: string): RuleContext | null {
  const context = getRuleContext(pathname);
  if (!context) return null;
  return {
    title: context.title,
    intro: context.intro,
    ruleIds: context.ruleIds,
    sourcePath: context.sourcePath,
    icon: CONTEXT_ICON[context.key],
  };
}

/**
 * Contextual rule references are ordinary permanent links. The old global
 * drawer/launcher was deliberately removed so Rules discovery lives in the
 * Library and workflow-local guidance instead of a fixed overlay.
 */
export function RuleChip({ ruleId, label, className }: { ruleId: string; label?: string; className?: string }) {
  const rule = getRuleById(ruleId);
  if (!rule) return null;

  return (
    <Link
      to="/rules/$ruleId"
      params={{ ruleId: rule.id }}
      className={cn(
        "inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-sky-200/12 bg-sky-200/[0.055] px-2.5 text-[10px] font-bold text-sky-100 transition hover:border-sky-200/25 hover:bg-sky-200/[0.1]",
        className,
      )}
    >
      <BookOpen className="size-3" aria-hidden="true" />
      {label ?? `Rule ${rule.id}`}
    </Link>
  );
}

/**
 * Temporary compatibility export for consumers that existed before the
 * fixed Rules overlay was retired. It intentionally renders no global UI.
 */
export function ContextualRuleGuide() {
  return null;
}
