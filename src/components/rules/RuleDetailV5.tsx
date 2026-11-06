import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Info,
  Map,
  XCircle,
} from "lucide-react";

import {
  GovernanceStatusStrip,
  SolarisDepthEyebrow,
  SolarisDepthPage,
  SolarisDepthSafeZone,
  SolarisDepthSurface,
} from "@/components/SolarisDepth";
import { RuleInterpretationsPanel } from "@/components/rules/RuleInterpretationsPanel";
import { RuleReturnBar } from "@/components/rules/RuleReturnBar";
import type { RuleExample, RuleTone, SscRule } from "@/lib/ssc-rules/types";
import { getRuleById } from "@/lib/ssc-rules-v4";
import { cn } from "@/lib/utils";

const TONES: Record<RuleTone, { label: string; className: string; surface: string }> = {
  allowed: {
    label: "Allowed",
    className: "text-emerald-200",
    surface: "border-emerald-300/15 bg-emerald-300/[0.045]",
  },
  prohibited: {
    label: "Not allowed",
    className: "text-rose-200",
    surface: "border-rose-300/15 bg-rose-300/[0.045]",
  },
  conditional: {
    label: "Depends",
    className: "text-amber-200",
    surface: "border-amber-300/15 bg-amber-300/[0.045]",
  },
  integrity: {
    label: "Integrity",
    className: "text-violet-200",
    surface: "border-violet-300/15 bg-violet-300/[0.045]",
  },
  administrative: {
    label: "Official process",
    className: "text-sky-200",
    surface: "border-sky-300/15 bg-sky-300/[0.045]",
  },
  information: {
    label: "Information",
    className: "text-cyan-200",
    surface: "border-cyan-300/15 bg-cyan-300/[0.045]",
  },
};

const EXAMPLE_TONES: Record<RuleExample["outcome"], string> = {
  allowed: "border-emerald-300/15 bg-emerald-300/[0.05] text-emerald-200",
  "not-allowed": "border-rose-300/15 bg-rose-300/[0.05] text-rose-200",
  depends: "border-amber-300/15 bg-amber-300/[0.05] text-amber-200",
  information: "border-cyan-300/15 bg-cyan-300/[0.05] text-cyan-200",
};

const EXAMPLE_LABELS: Record<RuleExample["outcome"], string> = {
  allowed: "Allowed",
  "not-allowed": "Not allowed",
  depends: "Depends",
  information: "Context",
};

type RuleWithChapter = SscRule & {
  chapterNumber?: number;
  chapterTitle?: string;
  chapterSlug?: string;
};

export function RuleDetailV5({ rule }: { rule: RuleWithChapter }) {
  const tone = TONES[rule.tone];
  const isRoleplay = rule.chapterNumber === 22;

  return (
    <SolarisDepthPage tone="rules" className="pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
      <SolarisDepthSafeZone>
        <RuleReturnBar />

        <nav className="mb-3 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground" aria-label="Rule breadcrumb">
          <Link to="/rules" className="hover:text-foreground">Rules</Link>
          <ChevronRight className="size-3" />
          {rule.chapterSlug ? (
            <>
              <Link
                to="/rules/chapters/$chapter"
                params={{ chapter: rule.chapterSlug }}
                className="hover:text-foreground"
              >
                {rule.chapterTitle ?? "Chapter"}
              </Link>
              <ChevronRight className="size-3" />
            </>
          ) : null}
          <span className="text-foreground">{rule.id}</span>
        </nav>

        <SolarisDepthSurface
          variant="action"
          className={cn(
            "overflow-hidden",
            isRoleplay && "border-indigo-300/15 bg-[radial-gradient(circle_at_90%_0%,rgba(129,140,248,.14),transparent_34%)]",
          )}
        >
          <header className="grid gap-4 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-start">
            <div className={cn("grid size-12 place-items-center rounded-2xl border font-mono text-xs font-black", tone.surface, tone.className)}>
              {rule.id}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <SolarisDepthEyebrow tone="primary">Official rule</SolarisDepthEyebrow>
                <span className={cn("inline-flex min-h-6 items-center rounded-full border border-current/15 bg-black/10 px-2 text-[10px] font-black uppercase tracking-[0.1em]", tone.className)}>
                  {tone.label}
                </span>
                {isRoleplay ? (
                  <span className="inline-flex min-h-6 items-center gap-1 rounded-full border border-indigo-300/15 bg-indigo-300/[0.06] px-2 text-[10px] font-black uppercase tracking-[0.1em] text-indigo-100">
                    <Map className="size-3" aria-hidden="true" /> Roleplay
                  </span>
                ) : null}
              </div>
              <h1 className="mt-2 max-w-4xl text-2xl font-bold tracking-[-0.03em] sm:text-3xl">{rule.title}</h1>
              <p className="mt-2 max-w-3xl text-sm font-medium leading-6 text-foreground/90">{rule.summary}</p>
              <GovernanceStatusStrip context="rules" className="mt-3" />
            </div>
          </header>
        </SolarisDepthSurface>
      </SolarisDepthSafeZone>

      <SolarisDepthSafeZone className="mt-5">
        <SolarisDepthSurface variant="reading">
          <div className="grid gap-7 lg:grid-cols-[minmax(0,1fr)_15rem]">
            <div className="min-w-0 space-y-7">
              <section aria-labelledby="official-rule-text">
                <div className="flex items-center gap-2">
                  <BookOpen className="size-4 text-primary" aria-hidden="true" />
                  <SolarisDepthEyebrow>Official regulation</SolarisDepthEyebrow>
                </div>
                <div id="official-rule-text" className="mt-3 space-y-3 text-sm leading-7 text-foreground/90">
                  {rule.body.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
                </div>
                {rule.important ? (
                  <div className="mt-4 flex gap-3 rounded-xl border border-amber-300/14 bg-amber-300/[0.045] px-4 py-3">
                    <AlertTriangle className="mt-0.5 size-4.5 shrink-0 text-amber-200" />
                    <p className="text-sm leading-6">{rule.important}</p>
                  </div>
                ) : null}
              </section>

              {rule.allowed?.length || rule.prohibited?.length ? (
                <section aria-labelledby="rule-practical-meaning">
                  <SolarisDepthEyebrow>What this means</SolarisDepthEyebrow>
                  <div id="rule-practical-meaning" className="mt-3 grid gap-3 sm:grid-cols-2">
                    {rule.allowed?.length ? (
                      <MeaningCard
                        title="Allowed"
                        icon={CheckCircle2}
                        tone="emerald"
                        items={rule.allowed}
                      />
                    ) : null}
                    {rule.prohibited?.length ? (
                      <MeaningCard
                        title="Not allowed"
                        icon={XCircle}
                        tone="rose"
                        items={rule.prohibited}
                      />
                    ) : null}
                  </div>
                </section>
              ) : null}

              {rule.bullets?.length ? (
                <section aria-labelledby="rule-key-points">
                  <SolarisDepthEyebrow>Key points</SolarisDepthEyebrow>
                  <div id="rule-key-points" className="mt-3 grid gap-2 sm:grid-cols-2">
                    {rule.bullets.map((item) => (
                      <div key={item} className="flex gap-2.5 rounded-xl border border-white/[0.07] bg-black/10 p-3 text-sm leading-6">
                        <CheckCircle2 className="mt-1 size-3.5 shrink-0 text-primary" />
                        <span>{item}</span>
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}

              {rule.examples?.length ? (
                <section aria-labelledby="rule-examples">
                  <SolarisDepthEyebrow>Examples</SolarisDepthEyebrow>
                  <div id="rule-examples" className="mt-3 grid gap-3 sm:grid-cols-2">
                    {rule.examples.map((example) => (
                      <article key={example.title} className="rounded-xl border border-white/[0.08] bg-black/10 p-3.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="min-w-0 flex-1 text-sm font-semibold">{example.title}</p>
                          <span className={cn("rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.08em]", EXAMPLE_TONES[example.outcome])}>
                            {EXAMPLE_LABELS[example.outcome]}
                          </span>
                        </div>
                        <p className="mt-1.5 text-sm leading-6 text-muted-foreground">{example.detail}</p>
                      </article>
                    ))}
                  </div>
                </section>
              ) : null}

              <RuleInterpretationsPanel ruleId={rule.id} />

              <section className="rounded-xl border border-primary/12 bg-primary/[0.035] p-4" aria-labelledby="rule-help">
                <SolarisDepthEyebrow>Need an official answer?</SolarisDepthEyebrow>
                <p id="rule-help" className="mt-2 text-sm leading-6 text-muted-foreground">
                  If your situation is unclear, ask TSBC privately before acting. The request can reference this rule directly.
                </p>
                <Link
                  to="/integrity/preclearance"
                  search={{ rule: rule.id }}
                  className="mt-3 inline-flex min-h-11 items-center rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground"
                >
                  Ask TSBC about Rule {rule.id}
                </Link>
              </section>
            </div>

            <aside className="space-y-5 border-t border-white/[0.08] pt-5 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
              <div className="rounded-xl border border-white/[0.07] bg-black/10 p-3">
                <SolarisDepthEyebrow>Context</SolarisDepthEyebrow>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">
                  {rule.chapterNumber ? `Chapter ${rule.chapterNumber} · ${rule.chapterTitle}` : "Official General Regulations"}
                </p>
                {rule.chapterSlug ? (
                  <Link
                    to="/rules/chapters/$chapter"
                    params={{ chapter: rule.chapterSlug }}
                    className="mt-2 inline-flex min-h-8 items-center gap-1 text-xs font-bold text-primary"
                  >
                    Open chapter <ChevronRight className="size-3" />
                  </Link>
                ) : null}
              </div>

              {rule.relatedRules?.length ? (
                <div className="border-t border-white/[0.08] pt-4">
                  <SolarisDepthEyebrow>Related rules</SolarisDepthEyebrow>
                  <div className="mt-2">
                    {rule.relatedRules.map((id) => {
                      const related = getRuleById(id);
                      if (!related) return null;
                      return (
                        <Link
                          key={id}
                          to="/rules/$ruleId"
                          params={{ ruleId: related.id }}
                          className="solaris-depth-row group !min-h-10 rounded-lg !py-2 px-1 text-sm transition hover:bg-white/[0.03]"
                        >
                          <span className="min-w-0 flex-1">
                            <span className="font-mono text-[11px] font-bold text-primary">{related.id}</span>
                            <span className="ml-1.5">{related.title}</span>
                          </span>
                          <ChevronRight className="size-3.5 text-muted-foreground group-hover:text-primary" />
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              <div className="border-t border-white/[0.08] pt-4">
                <p className="flex items-start gap-2 text-[11px] leading-5 text-muted-foreground">
                  <Info className="mt-0.5 size-3.5 shrink-0" />
                  Explanations and visuals help people understand the rule. The official regulation remains the governing text.
                </p>
              </div>
            </aside>
          </div>
        </SolarisDepthSurface>
      </SolarisDepthSafeZone>
    </SolarisDepthPage>
  );
}

function MeaningCard({
  title,
  icon: Icon,
  tone,
  items,
}: {
  title: string;
  icon: typeof CheckCircle2;
  tone: "emerald" | "rose";
  items: string[];
}) {
  const classes =
    tone === "emerald"
      ? "border-emerald-300/15 bg-emerald-300/[0.045] text-emerald-200"
      : "border-rose-300/15 bg-rose-300/[0.045] text-rose-200";

  return (
    <div className={cn("rounded-xl border p-3.5", classes)}>
      <p className="flex items-center gap-2 text-sm font-semibold">
        <Icon className="size-4" /> {title}
      </p>
      <ul className="mt-2 space-y-2 text-sm leading-6 text-muted-foreground">
        {items.map((item) => (
          <li key={item} className="flex gap-2">
            <span className="mt-[0.65rem] size-1 shrink-0 rounded-full bg-current" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
