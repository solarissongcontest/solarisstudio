import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowRight, BookOpen, CheckCircle2, Map, Sparkles } from "lucide-react";

import { RoleplayWorldbuildingVisual } from "@/components/rules/RoleplayWorldbuildingVisual";
import { RulesRouteShell } from "@/components/rules/RulesRouteShell";
import {
  GovernanceStatusStrip,
  SolarisDepthEyebrow,
  SolarisDepthPage,
  SolarisDepthSafeZone,
  SolarisDepthSurface,
} from "@/components/SolarisDepth";
import { getChapterBySlug } from "@/lib/ssc-rules/search";
import type { RuleTone } from "@/lib/ssc-rules/types";

export const Route = createFileRoute("/rules/chapters/$chapter")({
  head: ({ params }) => {
    const chapter = getChapterBySlug(params.chapter);
    return {
      meta: [
        { title: chapter ? `Chapter ${chapter.number}: ${chapter.title} — SSC Rules` : "Rulebook chapter — SSC Rules" },
        { name: "description", content: chapter?.description ?? "Read the official SSC rulebook." },
      ],
    };
  },
  component: RuleChapterPage,
});

const TONE_DOT: Record<RuleTone, string> = {
  allowed: "bg-emerald-300",
  prohibited: "bg-rose-300",
  conditional: "bg-amber-300",
  integrity: "bg-violet-300",
  administrative: "bg-sky-300",
  information: "bg-cyan-300",
};

function RuleChapterPage() {
  const { chapter: slug } = Route.useParams();
  const chapter = getChapterBySlug(slug);
  if (!chapter) throw notFound();
  const isRoleplay = chapter.number === 22;

  return (
    <RulesRouteShell resolvingTitle={`Opening Chapter ${chapter.number}`}>
      <SolarisDepthPage tone="rules">
        <SolarisDepthSafeZone>
          <SolarisDepthSurface
            variant="action"
            className={
              isRoleplay
                ? "overflow-hidden border-indigo-300/15 bg-[radial-gradient(circle_at_88%_0%,rgba(129,140,248,.15),transparent_34%)]"
                : "overflow-hidden"
            }
          >
            <div className="relative grid gap-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <SolarisDepthEyebrow tone="primary">
                    Chapter {String(chapter.number).padStart(2, "0")}
                  </SolarisDepthEyebrow>
                  {isRoleplay ? (
                    <span className="inline-flex min-h-6 items-center gap-1.5 rounded-full border border-indigo-300/15 bg-indigo-300/[0.07] px-2 text-[10px] font-black uppercase tracking-[0.1em] text-indigo-100">
                      <Map className="size-3" aria-hidden="true" /> Worldbuilding
                    </span>
                  ) : null}
                </div>
                <h1 className="mt-2 max-w-3xl text-2xl font-bold tracking-[-0.03em] sm:text-3xl">
                  {chapter.title}
                </h1>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                  {chapter.description}
                </p>
                <GovernanceStatusStrip context="rules" className="mt-3" />
              </div>

              <div className="flex gap-2 sm:flex-col sm:items-end">
                <ChapterMetric icon={BookOpen} value={chapter.rules.length} label="rules" />
                <ChapterMetric icon={Sparkles} value={chapter.atAGlance.length} label="key ideas" />
              </div>
            </div>
          </SolarisDepthSurface>
        </SolarisDepthSafeZone>

        {isRoleplay ? (
          <SolarisDepthSafeZone className="mt-5">
            <SolarisDepthSurface variant="reading">
              <RoleplayWorldbuildingVisual />
            </SolarisDepthSurface>
          </SolarisDepthSafeZone>
        ) : null}

        <SolarisDepthSafeZone className="mt-5">
          <section aria-labelledby="chapter-at-a-glance">
            <SolarisDepthEyebrow>At a glance</SolarisDepthEyebrow>
            <div id="chapter-at-a-glance" className="mt-2 grid gap-2 sm:grid-cols-2">
              {chapter.atAGlance.map((item, index) => (
                <article
                  key={item}
                  className="flex gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.025] p-3.5"
                >
                  <span className="grid size-8 shrink-0 place-items-center rounded-xl border border-primary/15 bg-primary/[0.07] font-mono text-[10px] font-black text-primary">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <p className="pt-1 text-sm leading-6 text-foreground/90">{item}</p>
                </article>
              ))}
            </div>
          </section>
        </SolarisDepthSafeZone>

        <SolarisDepthSafeZone className="mt-6">
          <div className="mb-2 flex items-end justify-between gap-3">
            <div>
              <SolarisDepthEyebrow>Official rules</SolarisDepthEyebrow>
              <h2 className="mt-1 text-lg font-bold">Read the chapter rule by rule</h2>
            </div>
            <span className="text-xs text-muted-foreground">{chapter.rules.length} total</span>
          </div>

          <SolarisDepthSurface variant="reading" className="!py-1">
            {chapter.rules.map((rule) => (
              <Link
                key={rule.id}
                to="/rules/$ruleId"
                params={{ ruleId: rule.id }}
                className="solaris-depth-row group rounded-xl px-1 transition hover:bg-white/[0.035] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45"
              >
                <span className="relative grid size-10 shrink-0 place-items-center rounded-xl border border-white/[0.07] bg-black/10 font-mono text-[11px] font-black text-primary">
                  {rule.id}
                  <span className={`absolute -right-1 -top-1 size-2.5 rounded-full border-2 border-[#07162d] ${TONE_DOT[rule.tone]}`} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold group-hover:text-white">{rule.title}</span>
                  <span className="mt-0.5 block line-clamp-2 text-xs leading-5 text-muted-foreground">
                    {rule.summary}
                  </span>
                </span>
                <ArrowRight className="size-3.5 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary" />
              </Link>
            ))}
          </SolarisDepthSurface>
        </SolarisDepthSafeZone>

        <SolarisDepthSafeZone className="mt-5">
          <div className="flex items-start gap-3 rounded-2xl border border-white/[0.07] bg-black/10 p-4 text-xs leading-5 text-muted-foreground">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
            <p>
              The short summaries and visuals help explain the chapter. Open an individual rule for the governing text, practical meaning, examples, related rules and official clarifications.
            </p>
          </div>
        </SolarisDepthSafeZone>
      </SolarisDepthPage>
    </RulesRouteShell>
  );
}

function ChapterMetric({
  icon: Icon,
  value,
  label,
}: {
  icon: typeof BookOpen;
  value: number;
  label: string;
}) {
  return (
    <div className="inline-flex min-h-9 items-center gap-2 rounded-xl border border-white/[0.08] bg-black/10 px-3 text-xs">
      <Icon className="size-3.5 text-primary" aria-hidden="true" />
      <span className="font-black text-foreground">{value}</span>
      <span className="text-muted-foreground">{label}</span>
    </div>
  );
}
