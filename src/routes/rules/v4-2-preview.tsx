import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, BookOpen, Search } from "lucide-react";

import { RulesRouteShell } from "@/components/rules/RulesRouteShell";
import {
  SolarisDepthEyebrow,
  SolarisDepthPage,
  SolarisDepthSafeZone,
  SolarisDepthSurface,
} from "@/components/SolarisDepth";
import { SSC_RULE_CHAPTERS } from "@/lib/ssc-rules/current";
import { withPlainLanguage } from "@/lib/ssc-rules/plain-language-v42";

/**
 * Public, read-only preview of the complete v4.2 proposal.
 * Deliberately separate from the authoritative runtime rulebook, release
 * history and Rules Manager publication RPC. It never applies a rule overlay.
 */
const PREVIEW_CHAPTERS = SSC_RULE_CHAPTERS.map((chapter) => ({
  number: chapter.number,
  title: chapter.title,
  rules: chapter.rules.map(withPlainLanguage),
}));
const TOTAL_RULES = PREVIEW_CHAPTERS.reduce((total, chapter) => total + chapter.rules.length, 0);

export const Route = createFileRoute("/rules/v4-2-preview")({
  head: () => ({
    meta: [
      { title: "DRAFT v4.2 Rulebook Preview — Solaris Song Contest" },
      {
        name: "description",
        content: "Read all 113 proposed plain-English SSC regulations. This is not the current official rulebook.",
      },
      { name: "robots", content: "noindex,follow" },
    ],
  }),
  component: RulesV42PreviewPage,
});

function RulesV42PreviewPage() {
  const [query, setQuery] = useState("");
  const search = query.trim().toLocaleLowerCase();
  const chapters = PREVIEW_CHAPTERS.map((chapter) => ({
    ...chapter,
    rules: chapter.rules.filter((rule) =>
      !search ||
      [rule.id, rule.title, rule.summary, ...rule.body, ...(rule.tags ?? [])]
        .join(" ")
        .toLocaleLowerCase()
        .includes(search),
    ),
  })).filter((chapter) => chapter.rules.length > 0);
  const matching = chapters.reduce((total, chapter) => total + chapter.rules.length, 0);

  return (
    <RulesRouteShell resolvingTitle="Opening proposed v4.2 rules">
      <SolarisDepthPage tone="rules" className="pb-[calc(2rem+env(safe-area-inset-bottom))]">
        <SolarisDepthSafeZone>
          <Link to="/rules" className="inline-flex min-h-11 items-center gap-2 text-xs font-bold text-primary">
            <ArrowLeft className="size-4" aria-hidden="true" /> Current official rules
          </Link>
          <SolarisDepthSurface variant="action">
            <header>
              <SolarisDepthEyebrow tone="primary">Proposal for review · Not in effect</SolarisDepthEyebrow>
              <h1 className="mt-2 text-2xl font-bold tracking-[-0.03em] sm:text-3xl">
                SSC General Regulations v4.2
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                Browse the complete plain-English draft of 113 rules across 22 chapters.
                This page is a public preview, not a published or legally effective
                SSC regulation. The current official rules remain available separately.
              </p>
              <div
                role="status"
                className="mt-4 rounded-xl border border-amber-200/25 bg-amber-200/[0.06] p-3 text-sm leading-6 text-amber-50"
              >
                <strong>DRAFT · NOT OFFICIAL.</strong> TSBC approval and the governed
                Rules Manager publication are still required. In particular, the
                proposals about YouTube video priority, bonus-point penalties and
                negative scores have not been ratified.
              </div>
              <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span>{TOTAL_RULES} proposed rules</span>
                <span>{PREVIEW_CHAPTERS.length} chapters</span>
                <span>View-only · No account required</span>
              </div>
              <label className="mt-4 flex min-h-12 items-center gap-3 rounded-xl border border-white/[0.09] bg-black/10 px-3 focus-within:border-primary/40">
                <Search className="size-4 shrink-0 text-primary" aria-hidden="true" />
                <span className="sr-only">Search draft rules</span>
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search the proposed wording…"
                  className="min-h-10 min-w-0 flex-1 bg-transparent text-sm outline-none"
                />
              </label>
            </header>
          </SolarisDepthSurface>
        </SolarisDepthSafeZone>

        <SolarisDepthSafeZone className="mt-6">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-lg font-bold">Proposed regulations</h2>
            <span className="text-xs text-muted-foreground">{matching} of {TOTAL_RULES} rules</span>
          </div>
          {chapters.length ? (
            <div className="space-y-6">
              {chapters.map((chapter) => (
                <section key={chapter.number} aria-labelledby={"draft-chapter-" + chapter.number}>
                  <h3 id={"draft-chapter-" + chapter.number} className="mb-3 flex items-center gap-2 text-base font-bold">
                    <BookOpen className="size-4 text-primary" aria-hidden="true" />
                    Chapter {chapter.number} · {chapter.title}
                  </h3>
                  <div className="space-y-2">
                    {chapter.rules.map((rule) => (
                      <details key={rule.id} className="group rounded-xl border border-white/[0.08] bg-white/[0.025]">
                        <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 p-3 marker:hidden">
                          <span className="shrink-0 font-mono text-xs font-black text-primary">{rule.id}</span>
                          <span className="min-w-0 flex-1 text-sm font-semibold">{rule.title}</span>
                          <span className="text-[10px] text-muted-foreground group-open:hidden">Read</span>
                          <span className="hidden text-[10px] text-muted-foreground group-open:inline">Close</span>
                        </summary>
                        <div className="space-y-3 border-t border-white/[0.07] px-3 pb-4 pt-3 text-sm leading-6">
                          <p className="font-semibold text-primary">{rule.summary}</p>
                          {rule.body.map((paragraph, index) => (
                            <p key={index} className="text-foreground/90">{paragraph}</p>
                          ))}
                          {rule.bullets?.length ? (
                            <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                              {rule.bullets.map((item, index) => <li key={index}>{item}</li>)}
                            </ul>
                          ) : null}
                          {rule.allowed?.length ? (
                            <div>
                              <h4 className="font-semibold">Allowed</h4>
                              <ul className="list-disc pl-5 text-muted-foreground">
                                {rule.allowed.map((item, index) => <li key={index}>{item}</li>)}
                              </ul>
                            </div>
                          ) : null}
                          {rule.prohibited?.length ? (
                            <div>
                              <h4 className="font-semibold">Not allowed</h4>
                              <ul className="list-disc pl-5 text-muted-foreground">
                                {rule.prohibited.map((item, index) => <li key={index}>{item}</li>)}
                              </ul>
                            </div>
                          ) : null}
                          {rule.important ? (
                            <p className="rounded-lg border border-primary/15 bg-primary/[0.05] p-3">
                              <strong>Important:</strong> {rule.important}
                            </p>
                          ) : null}
                          {rule.examples?.length ? (
                            <div className="space-y-2">
                              <h4 className="font-semibold">Examples</h4>
                              {rule.examples.map((example, index) => (
                                <p key={index} className="text-muted-foreground">
                                  <strong className="text-foreground">{example.title}:</strong> {example.detail}
                                </p>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      </details>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <SolarisDepthSurface variant="quiet">
              <p className="text-sm text-muted-foreground">No proposed rules match that search.</p>
            </SolarisDepthSurface>
          )}
        </SolarisDepthSafeZone>

        <SolarisDepthSafeZone className="mt-8">
          <p className="text-xs leading-5 text-muted-foreground">
            This preview never replaces the published rulebook, changes eligibility
            or scoring, or publishes a version to the official release history.
            Always consult the <Link to="/rules" className="font-bold text-primary underline">current official rules</Link> for binding regulations.
          </p>
        </SolarisDepthSafeZone>
      </SolarisDepthPage>
    </RulesRouteShell>
  );
}
