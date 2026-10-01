import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";

import { AppShell } from "@/components/AppShell";
import { RULE_CHAPTER_GROUPS } from "@/lib/governance-v5";
import { SSC_RULE_CHAPTERS } from "@/lib/ssc-rules-v4";

export const Route = createFileRoute("/rules/chapters/")({
  head: () => ({
    meta: [
      { title: "Rulebook Chapters — Solaris Song Contest" },
      { name: "description", content: "Browse all 21 chapters of the official SSC General Regulations." },
    ],
  }),
  component: RuleChaptersPage,
});

function RuleChaptersPage() {
  return (
    <AppShell>
      <div className="mx-auto max-w-4xl pb-20">
        <header className="border-b border-border/65 pb-5">
          <p className="text-xs font-black uppercase tracking-[0.12em] text-primary/80">Official rulebook</p>
          <h1 className="mt-2 text-3xl font-black tracking-[-0.04em]">21 chapters</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Browse by what the rules control. The official chapter numbering stays unchanged.
          </p>
        </header>

        <div className="mt-6 space-y-8">
          {RULE_CHAPTER_GROUPS.map((group) => (
            <section key={group.title}>
              <h2 className="text-xs font-black uppercase tracking-[0.12em] text-muted-foreground">{group.title}</h2>
              <div className="mt-2 divide-y divide-border/60 border-y border-border/60">
                {group.chapters.map((number) => {
                  const chapter = SSC_RULE_CHAPTERS.find((item) => item.number === number);
                  if (!chapter) return null;
                  return (
                    <Link
                      key={chapter.number}
                      to="/rules/chapters/$chapter"
                      params={{ chapter: chapter.slug }}
                      className="flex min-h-16 items-center gap-3 py-3"
                    >
                      <span className="w-10 shrink-0 font-mono text-sm font-black text-primary">
                        {String(chapter.number).padStart(2, "0")}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold">{chapter.title}</span>
                        <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{chapter.description}</span>
                      </span>
                      <span className="text-xs text-muted-foreground">{chapter.rules.length}</span>
                      <ArrowRight className="size-4 text-muted-foreground" />
                    </Link>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
