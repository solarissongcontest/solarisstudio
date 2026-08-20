import type { ReactNode } from "react";

type GuideQuestion = {
  question: string;
  answer: ReactNode;
};

type GuideSection = {
  title: string;
  description?: string;
  questions: GuideQuestion[];
};

export function GuideFAQ({ sections }: { sections: GuideSection[] }) {
  return (
    <div className="space-y-5">
      {sections.map((section) => (
        <section key={section.title} className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
          <div className="mb-4">
            <h2 className="font-display text-xl font-semibold text-foreground">{section.title}</h2>
            {section.description ? (
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{section.description}</p>
            ) : null}
          </div>

          <div className="space-y-2">
            {section.questions.map((item) => (
              <details key={item.question} className="group rounded-xl border border-border/75 bg-background/35 open:bg-background/55">
                <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-3.5 py-3 text-sm font-semibold text-foreground [&::-webkit-details-marker]:hidden">
                  <span>{item.question}</span>
                  <span aria-hidden="true" className="text-lg leading-none text-muted-foreground transition-transform group-open:rotate-45">+</span>
                </summary>
                <div className="border-t border-border/70 px-3.5 py-3 text-sm leading-relaxed text-muted-foreground">
                  {item.answer}
                </div>
              </details>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
