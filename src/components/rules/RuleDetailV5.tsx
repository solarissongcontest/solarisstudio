import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  Info,
  XCircle,
} from "lucide-react";

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
    <div className="pb-20">
      <RuleReturnBar />

      <nav className="mb-4 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground" aria-label="Rule breadcrumb">
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

      <header className="border-b border-border/65 pb-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs font-black text-primary">RULE {rule.id}</span>
          <span className={cn("text-xs font-bold", tone.className)}>{tone.label}</span>
        </div>
        <h1 className="mt-3 max-w-4xl text-3xl font-black tracking-[-0.045em] sm:text-4xl">{rule.title}</h1>
        <div className="mt-4 max-w-3xl border-l-2 border-primary/35 pl-4">
          <p className="text-xs font-black uppercase tracking-[0.12em] text-primary/80">At a glance</p>
          <p className="mt-1 text-base font-semibold leading-7">{rule.summary}</p>
        </div>
      </header>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_17rem]">
        <main className="min-w-0 space-y-7">
          <section aria-labelledby="official-rule-text">
            <h2 id="official-rule-text" className="text-lg font-bold">Official regulation</h2>
            <div className="mt-3 space-y-3 text-sm leading-7 text-foreground/90">
              {rule.body.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
            </div>
            {rule.important ? (
              <div className="mt-4 flex gap-3 border-l-2 border-amber-300/40 bg-amber-300/[0.04] px-4 py-3">
                <AlertTriangle className="mt-0.5 size-4.5 shrink-0 text-amber-200" />
                <p className="text-sm leading-6">{rule.important}</p>
              </div>
            ) : null}
          </section>

          {rule.allowed?.length || rule.prohibited?.length ? (
            <section aria-labelledby="rule-practical-meaning">
              <h2 id="rule-practical-meaning" className="text-lg font-bold">What this means</h2>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {rule.allowed?.length ? (
                  <div className="border-t border-emerald-300/30 pt-3">
                    <p className="flex items-center gap-2 text-sm font-semibold text-emerald-200">
                      <CheckCircle2 className="size-4" /> Allowed
                    </p>
                    <ul className="mt-2 space-y-2 text-sm leading-6 text-muted-foreground">
                      {rule.allowed.map((item) => <li key={item}>• {item}</li>)}
                    </ul>
                  </div>
                ) : null}
                {rule.prohibited?.length ? (
                  <div className="border-t border-rose-300/30 pt-3">
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
              <h2 id="rule-key-points" className="text-lg font-bold">Key points</h2>
              <ul className="mt-3 space-y-2">
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
              <h2 id="rule-examples" className="text-lg font-bold">Examples</h2>
              <div className="mt-3 divide-y divide-border/60 border-y border-border/60">
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

          <section className="border-t border-border/65 pt-5" aria-labelledby="rule-help">
            <h2 id="rule-help" className="text-lg font-bold">Need an official answer?</h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
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
        </main>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <div className="border-t border-border/65 pt-4">
            <p className="text-xs font-black uppercase tracking-[0.12em] text-muted-foreground">Rule context</p>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              {rule.chapterNumber ? `Chapter ${rule.chapterNumber} · ${rule.chapterTitle}` : "Official General Regulations"}
            </p>
          </div>

          {rule.relatedRules?.length ? (
            <div className="border-t border-border/65 pt-4">
              <p className="text-xs font-black uppercase tracking-[0.12em] text-muted-foreground">Related rules</p>
              <div className="mt-2 space-y-1">
                {rule.relatedRules.map((id) => {
                  const related = getRuleById(id);
                  if (!related) return null;
                  return (
                    <Link
                      key={id}
                      to="/rules/$ruleId"
                      params={{ ruleId: related.id }}
                      className="flex min-h-10 items-center justify-between gap-2 text-sm"
                    >
                      <span><span className="font-mono text-xs text-primary">{related.id}</span> · {related.title}</span>
                      <ChevronRight className="size-3.5 text-muted-foreground" />
                    </Link>
                  );
                })}
              </div>
            </div>
          ) : null}

          <div className="border-t border-border/65 pt-4">
            <p className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
              <Info className="size-3.5" />
              Explanations help people understand the rule. The official regulation above remains the governing text.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
