import { Link } from "@tanstack/react-router";
import { BookOpen, MessageCircleQuestion } from "lucide-react";

import type { SscRule } from "@/lib/ssc-rules/types";

export function RulePlainSummary({ rule }: { rule: SscRule }) {
  return (
    <section className="mx-auto mb-5 max-w-5xl rounded-2xl border border-sky-200/12 bg-sky-200/[0.035] p-5 sm:p-6">
      <div className="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-start">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[.13em] text-sky-200/70">
            In simple terms
          </p>
          <h2 className="mt-1 font-display text-xl font-bold">{rule.title}</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{rule.summary}</p>

          <details className="mt-4 rounded-xl border border-border/65 bg-background/25 px-4 py-3">
            <summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-semibold text-foreground [&::-webkit-details-marker]:hidden">
              <BookOpen className="size-3.5 text-primary" aria-hidden="true" />
              Official wording
            </summary>
            <div className="mt-3 space-y-2 text-sm leading-6 text-muted-foreground">
              {rule.body.map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}
            </div>
          </details>
        </div>

        <Link
          to="/integrity/preclearance"
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-sky-200/15 bg-sky-200/[0.05] px-4 text-xs font-bold text-sky-100 transition-colors hover:bg-sky-200/[0.09]"
        >
          <MessageCircleQuestion className="size-4" aria-hidden="true" />
          Ask before acting
        </Link>
      </div>
    </section>
  );
}
