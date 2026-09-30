import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowRight, CheckCircle2 } from "lucide-react";

import { AppShell } from "@/components/AppShell";
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
      <div className="mx-auto max-w-5xl pb-20">
        <header className="border-b border-border/65 pb-5">
          <p className="font-mono text-xs font-black text-primary">CHAPTER {String(chapter.number).padStart(2, "0")}</p>
          <h1 className="mt-2 text-3xl font-black tracking-[-0.04em] sm:text-4xl">{chapter.title}</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{chapter.description}</p>
        </header>

        <section className="mt-6" aria-labelledby="chapter-at-a-glance">
          <h2 id="chapter-at-a-glance" className="text-lg font-bold">At a glance</h2>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {chapter.atAGlance.map((item) => (
              <li key={item} className="flex gap-2.5 text-sm leading-6">
                <CheckCircle2 className="mt-1 size-3.5 shrink-0 text-primary" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-7" aria-labelledby="chapter-rules">
          <div className="border-b border-border/65 pb-3">
            <h2 id="chapter-rules" className="text-lg font-bold">Rules</h2>
          </div>
          <div className="divide-y divide-border/60">
            {chapter.rules.map((rule) => (
              <Link
                key={rule.id}
                to="/rules/$ruleId"
                params={{ ruleId: rule.id }}
                className="flex min-h-20 items-center gap-3 py-4"
              >
                <span className="w-12 shrink-0 font-mono text-xs font-black text-primary">{rule.id}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">{rule.title}</span>
                  <span className="mt-1 block text-xs leading-5 text-muted-foreground">{rule.summary}</span>
                </span>
                <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
              </Link>
            ))}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
