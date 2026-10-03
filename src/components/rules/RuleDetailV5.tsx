import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Info,
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
import type { RuleTone, SscRule } from "@/lib/ssc-rules/types";
import { getRuleById } from "@/lib/ssc-rules-v4";
import { cn } from "@/lib/utils";

const TONES: Record<RuleTone, { label: string; className: string }> = {
  allowed: { label: "Allowed", className: "text-emerald-200" },
  prohibited: { label: "Not allowed", className: "text-rose-200" },
  conditional: { label: "Depends", className: "text-amber-200" },
  integrity: { label: "Integrity", className: "text-violet-200" },
  administrative: { label: "Official process", className: "text-sky-200" },
  information: { label: "Information", className: "text-cyan-200" },
};

type RuleWithChapter = SscRule & {
  chapterNumber?: number;
  chapterTitle?: string;
  chapterSlug?: string;
};

export function RuleDetailV5({ rule }: { rule: RuleWithChapter }) {
  const tone = TONES[rule.tone];

  return (
    <SolarisDepthPage tone="rules">
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

        <header>
          <div className="flex flex-wrap items-center gap-2">
            <SolarisDepthEyebrow tone="primary">Rule {rule.id}</SolarisDepthEyebrow>
            <span className={cn("text-[11px] font-bold", tone.className)}>{tone.label}</span>
          </div>
          <h1 className="mt-2 max-w-4xl text-2xl font-bold tracking-[-0.025em] sm:text-3xl">{rule.title}</h1>
          <p className="mt-2 max-w-3xl text-sm font-medium leading-6 text-foreground/90">{rule.summary}</p>
          <GovernanceStatusStrip context="rules" className="mt-3" />
        </header>
      </SolarisDepthSafeZone>

      <SolarisDepthSafeZone className="mt-5">
        <SolarisDepthSurface variant="reading">
          <div className="grid gap-7 lg:grid-cols-[minmax(0,1fr)_15rem]">
            <div className="min-w-0 space-y-7">
              <section aria-labelledby="official-rule-text">
                <SolarisDepthEyebrow>Official regulation</SolarisDepthEyebrow>
                <div id="official-rule-text" className="mt-3 space-y-3 text-sm leading-7 text-foreground/90">
                  {rule.body.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
                </div>
                {rule.important ? (
                  <div className="mt-4 flex gap-3 border-l-2 border-amber-300/40 bg-amber-300/[0.035] px-4 py-3">
                    <AlertTriangle className="mt-0.5 size-4.5 shrink-0 text-amber-200" />
                    <p className="text-sm leading-6">{rule.important}</p>
                  </div>
                ) : null}
              </section>

              {rule.allowed?.length || rule.prohibited?.length ? (
                <section aria-labelledby="rule-practical-meaning">
                  <SolarisDepthEyebrow>What this means</SolarisDepthEyebrow>
                  <div id="rule-practical-meaning" className="mt-3 grid gap-4 sm:grid-cols-2">
                    {rule.allowed?.length ? (
                      <div className="border-t border-emerald-300/20 pt-3">
                        <p className="flex items-center gap-2 text-sm font-semibold text-emerald-200">
                          <CheckCircle2 className="size-4" /> Allowed
                        </p>
                        <ul className="mt-2 space-y-2 text-sm leading-6 text-muted-foreground">
                          {rule.allowed.map((item) => <li key={item}>• {item}</li>)}
                        </ul>
                      </div>
                    ) : null}
                    {rule.prohibited?.length ? (
                      <div className="border-t border-rose-300/20 pt-3">
                        <p className="flex items-center gap-2 text-sm font-semibold text-rose-200">
                          <XCircle className="size-4" /> Not allowed
                        </p>
                        <ul className="mt-2 space-y-2 text-sm leading-6 text-muted-foreground">
                          {rule.prohibited.map((item) => <li key={item}>• {item}</li>)}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                </section>
              ) : null}

              {rule.bullets?.length ? (
                <section aria-labelledby="rule-key-points">
                  <SolarisDepthEyebrow>Key points</SolarisDepthEyebrow>
                  <ul id="rule-key-points" className="mt-3 space-y-2">
                    {rule.bullets.map((item) => (
                      <li key={item} className="flex gap-2.5 text-sm leading-6">
                        <CheckCircle2 className="mt-1 size-3.5 shrink-0 text-primary" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {rule.examples?.length ? (
                <section aria-labelledby="rule-examples">
                  <SolarisDepthEyebrow>Examples</SolarisDepthEyebrow>
                  <div id="rule-examples" className="mt-2 divide-y divide-white/[0.07]">
                    {rule.examples.map((example) => (
                      <article key={example.title} className="py-3">
                        <p className="text-sm font-semibold">{example.title}</p>
                        <p className="mt-1 text-sm leading-6 text-muted-foreground">{example.detail}</p>
                      </article>
                    ))}
                  </div>
                </section>
              ) : null}

              <RuleInterpretationsPanel ruleId={rule.id} />

              <section className="border-t border-white/[0.08] pt-5" aria-labelledby="rule-help">
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
              <div>
                <SolarisDepthEyebrow>Context</SolarisDepthEyebrow>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">
                  {rule.chapterNumber ? `Chapter ${rule.chapterNumber} · ${rule.chapterTitle}` : "Official General Regulations"}
                </p>
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
                          className="solaris-depth-row !min-h-10 !py-2 text-sm"
                        >
                          <span className="min-w-0 flex-1">
                            <span className="font-mono text-[11px] font-bold text-primary">{related.id}</span>
                            <span className="ml-1.5">{related.title}</span>
                          </span>
                          <ChevronRight className="size-3.5 text-muted-foreground" />
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              <div className="border-t border-white/[0.08] pt-4">
                <p className="flex items-start gap-2 text-[11px] leading-5 text-muted-foreground">
                  <Info className="mt-0.5 size-3.5 shrink-0" />
                  Explanations help people understand the rule. The official regulation remains the governing text.
                </p>
              </div>
            </aside>
          </div>
        </SolarisDepthSurface>
      </SolarisDepthSafeZone>
    </SolarisDepthPage>
  );
}
