import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Search } from "lucide-react";

import { AppShell } from "@/components/AppShell";
import {
  GovernanceStatusStrip,
  SolarisDepthEyebrow,
  SolarisDepthPage,
  SolarisDepthSafeZone,
  SolarisDepthSurface,
} from "@/components/SolarisDepth";
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
      <SolarisDepthPage tone="rules">
        <SolarisDepthSafeZone>
          <header>
            <SolarisDepthEyebrow tone="primary">Official rulebook</SolarisDepthEyebrow>
            <div className="mt-2 flex flex-wrap items-baseline gap-2">
              <h1 className="text-2xl font-bold tracking-[-0.025em]">21 chapters</h1>
              <span className="text-xs text-muted-foreground">General Regulations · current edition</span>
            </div>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              Browse by what the rules control. Official chapter numbering stays unchanged.
            </p>
            <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
              <Search className="size-3.5 text-primary" />
              <Link to="/rules/search" search={{ q: "" }} className="font-semibold text-primary">
                Search chapters or rules
              </Link>
            </div>
            <GovernanceStatusStrip context="rules" className="mt-3" />
          </header>
        </SolarisDepthSafeZone>

        <SolarisDepthSafeZone className="mt-5">
          <SolarisDepthSurface variant="reading">
            <div className="solaris-depth-rule-index">
              {RULE_CHAPTER_GROUPS.map((group) => (
                <section key={group.title} className="solaris-depth-rule-index-group">
                  <SolarisDepthEyebrow>{group.title}</SolarisDepthEyebrow>
                  <div className="mt-2">
                    {group.chapters.map((number) => {
                      const chapter = SSC_RULE_CHAPTERS.find((item) => item.number === number);
                      if (!chapter) return null;
                      return (
                        <Link
                          key={chapter.number}
                          to="/rules/chapters/$chapter"
                          params={{ chapter: chapter.slug }}
                          className="solaris-depth-row"
                        >
                          <span className="w-9 shrink-0 font-mono text-xs font-black text-primary">
                            {String(chapter.number).padStart(2, "0")}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-semibold">{chapter.title}</span>
                            <span className="mt-0.5 block line-clamp-2 text-xs leading-5 text-muted-foreground">
                              {chapter.description}
                            </span>
                          </span>
                          <span className="text-[11px] text-muted-foreground">{chapter.rules.length}</span>
                          <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" />
                        </Link>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          </SolarisDepthSurface>
        </SolarisDepthSafeZone>
      </SolarisDepthPage>
    </AppShell>
  );
}
