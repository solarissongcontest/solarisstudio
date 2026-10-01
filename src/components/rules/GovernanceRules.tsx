import { Link, useRouterState } from "@tanstack/react-router";
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock3,
  Scale,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { useId, useState } from "react";

import {
  governanceDefinition,
  governanceRules,
  type GovernanceActionKey,
  type GovernancePurpose,
  type GovernanceReceiptSnapshot,
} from "@/lib/governance-v5";
import { rememberRuleReturnContext } from "@/lib/rule-return-context";
import { usePublishedRulebook } from "@/lib/rules-governance";
import { cn } from "@/lib/utils";

const PURPOSE: Record<
  GovernancePurpose,
  { label: string; icon: LucideIcon; className: string }
> = {
  required: {
    label: "Required",
    icon: BookOpen,
    className: "border-sky-300/18 bg-sky-300/[0.06] text-sky-100",
  },
  deadline: {
    label: "Deadline",
    icon: Clock3,
    className: "border-amber-300/18 bg-amber-300/[0.06] text-amber-100",
  },
  eligibility: {
    label: "Eligibility",
    icon: Scale,
    className: "border-violet-300/18 bg-violet-300/[0.06] text-violet-100",
  },
  fairness: {
    label: "Fairness",
    icon: ShieldCheck,
    className: "border-emerald-300/18 bg-emerald-300/[0.06] text-emerald-100",
  },
  integrity: {
    label: "Integrity",
    icon: ShieldCheck,
    className: "border-rose-300/18 bg-rose-300/[0.06] text-rose-100",
  },
  privacy: {
    label: "Privacy",
    icon: ShieldCheck,
    className: "border-cyan-300/18 bg-cyan-300/[0.06] text-cyan-100",
  },
  information: {
    label: "Information",
    icon: CircleHelp,
    className: "border-border/80 bg-surface/55 text-muted-foreground",
  },
};

export function ContextualRuleCard({
  context,
  ruleId,
  compact = false,
  showCanonical = true,
  className,
}: {
  context: GovernanceActionKey;
  ruleId: string;
  compact?: boolean;
  showCanonical?: boolean;
  className?: string;
}) {
  const binding = governanceRules(context).find((item) => item.id === ruleId);
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const sourceLabel = sourceLabelForContext(context, pathname);
  const focusId = useId().replaceAll(":", "");
  if (!binding) return null;

  const meta = PURPOSE[binding.purpose];
  const Icon = meta.icon;

  return (
    <article
      className={cn(
        "rounded-2xl border border-border/70 bg-background/35 p-4",
        compact && "rounded-xl p-3",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <span className={cn("grid size-9 shrink-0 place-items-center rounded-xl border", meta.className)}>
          <Icon className="size-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-mono text-[11px] font-black text-primary">Rule {binding.id}</p>
            <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-bold", meta.className)}>
              {meta.label}
            </span>
          </div>
          <h3 className={cn("mt-1 font-semibold", compact ? "text-sm" : "text-base")}>
            {binding.title}
          </h3>
          <p className="mt-2 text-sm leading-6 text-foreground/88">
            {binding.contextualSummary}
          </p>
          {showCanonical && binding.canonicalSummary !== binding.contextualSummary ? (
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              <strong className="font-semibold text-foreground">Official rule summary:</strong>{" "}
              {binding.canonicalSummary}
            </p>
          ) : null}
          <Link
            id={`governance-rule-${focusId}`}
            to="/rules/$ruleId"
            params={{ ruleId: binding.id }}
            onClick={() =>
              rememberRuleReturnContext(
                sourceLabel,
                `governance-rule-${focusId}`,
              )
            }
            className="mt-3 inline-flex min-h-10 items-center gap-1.5 rounded-xl text-xs font-bold text-primary"
          >
            Read full rule <ChevronRight className="size-3.5" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </article>
  );
}

export function RulesApplyingHere({
  context,
  initiallyExpanded = false,
  primaryLimit = 2,
  title,
  className,
}: {
  context: GovernanceActionKey;
  initiallyExpanded?: boolean;
  primaryLimit?: number;
  title?: string;
  className?: string;
}) {
  const definition = governanceDefinition(context);
  const rules = governanceRules(context);
  const primaries = rules.filter((rule) => rule.prominence === "primary");
  const initial = primaries.slice(0, primaryLimit);
  const rest = rules.filter((rule) => !initial.some((item) => item.id === rule.id));
  const [expanded, setExpanded] = useState(initiallyExpanded);

  return (
    <section
      className={cn("rounded-2xl border border-border/65 bg-surface/35 p-4", className)}
      aria-label={title ?? definition.title}
    >
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-primary/15 bg-primary/[0.07] text-primary">
          <BookOpen className="size-4.5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-black uppercase tracking-[0.12em] text-primary/80">
            Rules applying here
          </p>
          <h2 className="mt-1 text-base font-semibold">{title ?? definition.title}</h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{definition.intro}</p>
        </div>
      </div>

      <div className="mt-4 space-y-2.5">
        {initial.map((rule) => (
          <ContextualRuleCard
            key={rule.id}
            context={context}
            ruleId={rule.id}
            compact
            showCanonical={false}
          />
        ))}
        {expanded
          ? rest.map((rule) => (
              <ContextualRuleCard
                key={rule.id}
                context={context}
                ruleId={rule.id}
                compact
                showCanonical={false}
              />
            ))
          : null}
      </div>

      {rest.length ? (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          className="mt-3 inline-flex min-h-10 items-center gap-1.5 rounded-xl px-1 text-xs font-bold text-muted-foreground hover:text-foreground"
        >
          {expanded ? "Show fewer rules" : `See all ${rules.length} rules`}
          <ChevronDown
            className={cn("size-3.5 transition-transform", expanded && "rotate-180")}
            aria-hidden="true"
          />
        </button>
      ) : null}
    </section>
  );
}

export function GovernanceInlineReference({
  context,
  ruleIds,
  label,
}: {
  context: GovernanceActionKey;
  ruleIds: string[];
  label?: string;
}) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const sourceLabel = sourceLabelForContext(context, pathname);
  const rules = governanceRules(context).filter((rule) => ruleIds.includes(rule.id));
  if (!rules.length) return null;

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      <span>{label ?? "Rules"}</span>
      {rules.map((rule) => {
        const id = `inline-rule-${context.replaceAll(".", "-")}-${rule.id.replace(".", "-")}`;
        return (
          <Link
            key={rule.id}
            id={id}
            to="/rules/$ruleId"
            params={{ ruleId: rule.id }}
            onClick={() => rememberRuleReturnContext(sourceLabel, id)}
            className="inline-flex min-h-8 items-center rounded-lg border border-border/70 bg-surface/55 px-2.5 font-mono text-[11px] font-bold text-primary"
          >
            {rule.id} · {rule.title}
          </Link>
        );
      })}
    </div>
  );
}

export function GovernanceSnapshot({
  context,
  label = "Governance snapshot",
  snapshot,
}: {
  context: GovernanceActionKey;
  label?: string;
  snapshot?: GovernanceReceiptSnapshot | null;
}) {
  const published = usePublishedRulebook();
  const rules = governanceRules(context);
  const version = snapshot?.rulebookVersion ?? published.version;
  const ruleIds = snapshot?.ruleIds ?? rules.map((rule) => rule.id);

  return (
    <section className="rounded-2xl border border-border/70 bg-background/30 p-4">
      <p className="text-xs font-black uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
      <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <p className="text-sm font-semibold">General Regulations v{version}</p>
        <p className="font-mono text-[11px] text-muted-foreground">
          {ruleIds.join(" · ")}
        </p>
      </div>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">
        {snapshot
          ? `Captured for this receipt at ${new Date(snapshot.capturedAt).toLocaleString()}. This receipt view keeps the rule version and rule IDs that were active when Solaris acknowledged the action.`
          : "This shows the rule context currently active for this Solaris action."}
      </p>
    </section>
  );
}

function sourceLabelForContext(context: GovernanceActionKey, pathname: string) {
  if (context === "jury.vote") return "Jury Voting";
  if (context === "televote.vote") return "Televoting";
  if (context === "confirmation.submit") return "Confirmations";
  if (context === "entry.submit") return "Entry Submission";
  if (context === "integrity.appeal") return "Integrity Appeal";
  if (context === "integrity.guidance") return "Private Rule Guidance";
  if (context === "integrity.report") return "Trust & Integrity";
  if (context === "hosting.accept") return "Hosting";
  return pathname;
}
