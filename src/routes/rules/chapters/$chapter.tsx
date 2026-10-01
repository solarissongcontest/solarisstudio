import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowRight, CheckCircle2 } from "lucide-react";

import { AppShell } from "@/components/AppShell";
import {
  GovernanceStatusStrip,
  SolarisDepthEyebrow,
  SolarisDepthPage,
  SolarisDepthSafeZone,
  SolarisDepthSurface,
} from "@/components/SolarisDepth";
import { getChapterBySlug } from "@/lib/ssc-rules/search";

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

function RuleChapterPage() {
  const { chapter: slug } = Route.useParams();
  const chapter = getChapterBySlug(slug);
  if (!chapter) throw notFound();

  return (
    <AppShell>
      <SolarisDepthPage tone="rules">
        <SolarisDepthSafeZone>
          <header>
            <SolarisDepthEyebrow tone="primary">
              Chapter {String(chapter.number).padStart(2, "0")}
            </SolarisDepthEyebrow>
            <h1 className="mt-2 text-2xl font-bold tracking-[-0.025em] sm:text-3xl">{chapter.title}</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{chapter.description}</p>
            <GovernanceStatusStrip context="rules" className="mt-3" />
          </header>
        </SolarisDepthSafeZone>

        <SolarisDepthSafeZone className="mt-5">
          <SolarisDepthSurface variant="reading">
            <section aria-labelledby="chapter-at-a-glance">
              <SolarisDepthEyebrow>At a glance</SolarisDepthEyebrow>
              <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                {chapter.atAGlance.map((item) => (
                  <li key={item} className="flex gap-2.5 text-sm leading-6">
                    <CheckCircle2 className="mt-1 size-3.5 shrink-0 text-primary" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="mt-6" aria-labelledby="chapter-rules">
              <SolarisDepthEyebrow>Rules</SolarisDepthEyebrow>
              <div className="mt-2">
                {chapter.rules.map((rule) => (
                  <Link
                    key={rule.id}
                    to="/rules/$ruleId"
                    params={{ ruleId: rule.id }}
                    className="solaris-depth-row"
                  >
                    <span className="w-11 shrink-0 font-mono text-xs font-black text-primary">{rule.id}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold">{rule.title}</span>
                      <span className="mt-0.5 block line-clamp-2 text-xs leading-5 text-muted-foreground">{rule.summary}</span>
                    </span>
                    <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" />
                  </Link>
                ))}
              </div>
            </section>
          </SolarisDepthSurface>
        </SolarisDepthSafeZone>
      </SolarisDepthPage>
    </AppShell>
  );
}
