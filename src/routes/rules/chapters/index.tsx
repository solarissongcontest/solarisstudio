import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, BookOpen, Map, Search } from "lucide-react";

import { RulesRouteShell } from "@/components/rules/RulesRouteShell";
import {
  GovernanceStatusStrip,
  SolarisDepthEyebrow,
  SolarisDepthPage,
  SolarisDepthSafeZone,
  SolarisDepthSurface,
} from "@/components/SolarisDepth";
import { RULE_CHAPTER_GROUPS } from "@/lib/governance-v5";
import { SSC_RULE_CHAPTERS } from "@/lib/ssc-rules-v4";

const CHAPTER_GROUPS = [
  ...RULE_CHAPTER_GROUPS,
  { title: "Worldbuilding", chapters: [22] },
];

export const Route = createFileRoute("/rules/chapters/")({
  head: () => ({
    meta: [
      { title: "Rulebook Chapters — Solaris Song Contest" },
      { name: "description", content: "Browse all 22 chapters of the official SSC General Regulations." },
    ],
  }),
  component: RuleChaptersPage,
});

function RuleChaptersPage() {
  return (
    <RulesRouteShell resolvingTitle="Opening Rulebook chapters">
      <SolarisDepthPage tone="rules">
        <SolarisDepthSafeZone>
          <SolarisDepthSurface variant="action">
            <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
              <header>
                <SolarisDepthEyebrow tone="primary">Official rulebook</SolarisDepthEyebrow>
                <div className="mt-2 flex flex-wrap items-baseline gap-2">
                  <h1 className="text-2xl font-bold tracking-[-0.03em] sm:text-3xl">22 chapters</h1>
                  <span className="text-xs text-muted-foreground">General Regulations · current edition</span>
                </div>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                  Browse by what the rules control. The visual grouping helps navigation while official chapter numbering stays unchanged.
                </p>
                <GovernanceStatusStrip context="rules" className="mt-3" />
              </header>

              <Link
                to="/rules/search"
                search={{ q: "" }}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-primary/15 bg-primary/[0.07] px-4 text-xs font-bold text-primary transition hover:bg-primary/[0.11]"
              >
                <Search className="size-4" aria-hidden="true" /> Search rules
              </Link>
            </div>
          </SolarisDepthSurface>
        </SolarisDepthSafeZone>

        <SolarisDepthSafeZone className="mt-5">
          <div className="grid gap-5 lg:grid-cols-2">
            {CHAPTER_GROUPS.map((group) => {
              const isWorldbuilding = group.title === "Worldbuilding";
              return (
                <section
                  key={group.title}
                  className={
                    isWorldbuilding
                      ? "overflow-hidden rounded-[1.35rem] border border-indigo-300/15 bg-[radial-gradient(circle_at_90%_0%,rgba(129,140,248,.14),transparent_35%),rgba(7,18,42,.74)] p-4 sm:p-5"
                      : "rounded-[1.35rem] border border-white/[0.08] bg-[rgba(7,18,42,.72)] p-4 sm:p-5"
                  }
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="grid size-9 place-items-center rounded-xl border border-white/[0.07] bg-black/10 text-primary">
                        {isWorldbuilding ? <Map className="size-4" /> : <BookOpen className="size-4" />}
                      </span>
                      <div>
                        <SolarisDepthEyebrow>{group.title}</SolarisDepthEyebrow>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          {group.chapters.length} chapter{group.chapters.length === 1 ? "" : "s"}
                        </p>
                      </div>
                    </div>
                    {isWorldbuilding ? (
                      <span className="rounded-full border border-indigo-300/15 bg-indigo-300/[0.07] px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-indigo-100">
                        New
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-3">
                    {group.chapters.map((number) => {
                      const chapter = SSC_RULE_CHAPTERS.find((item) => item.number === number);
                      if (!chapter) return null;
                      return (
                        <Link
                          key={chapter.number}
                          to="/rules/chapters/$chapter"
                          params={{ chapter: chapter.slug }}
                          className="group flex min-h-20 items-center gap-3 border-t border-white/[0.07] py-3 first:border-t-0"
                        >
                          <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-white/[0.07] bg-black/10 font-mono text-[11px] font-black text-primary">
                            {String(chapter.number).padStart(2, "0")}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-semibold transition group-hover:text-white">{chapter.title}</span>
                            <span className="mt-0.5 block line-clamp-2 text-xs leading-5 text-muted-foreground">
                              {chapter.description}
                            </span>
                          </span>
                          <span className="hidden rounded-full border border-white/[0.07] bg-black/10 px-2 py-1 text-[10px] font-bold text-muted-foreground sm:inline-flex">
                            {chapter.rules.length} rules
                          </span>
                          <ArrowRight className="size-3.5 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary" />
                        </Link>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        </SolarisDepthSafeZone>
      </SolarisDepthPage>
    </RulesRouteShell>
  );
}
