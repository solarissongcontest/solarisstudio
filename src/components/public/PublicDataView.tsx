import type { ReactNode } from "react";

export type PublicDataGuideItem = {
  title: string;
  description: string;
};

export function PublicDataGuide({
  title = "How to read this",
  description,
  items,
}: {
  title?: string;
  description?: string;
  items: readonly PublicDataGuideItem[];
}) {
  return (
    <>
      <details className="mb-4 overflow-hidden rounded-2xl border border-border/70 bg-surface/45 sm:hidden">
        <summary className="cursor-pointer list-none px-4 py-3 [&::-webkit-details-marker]:hidden">
          <span className="block text-sm font-semibold">{title}</span>
          {description ? (
            <span className="mt-1 block text-xs leading-5 text-muted-foreground">
              {description}
            </span>
          ) : null}
        </summary>
        <div className="space-y-2 border-t border-border/60 p-3">
          {items.map((item, index) => (
            <GuideItem key={item.title} number={index + 1} {...item} />
          ))}
        </div>
      </details>

      <section className="mb-5 hidden rounded-2xl border border-border/70 bg-surface/45 p-4 sm:block">
        <div className="mb-3">
          <h2 className="text-sm font-semibold">{title}</h2>
          {description ? (
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
          ) : null}
        </div>
        <div className="grid gap-2 md:grid-cols-3">
          {items.map((item, index) => (
            <GuideItem key={item.title} number={index + 1} {...item} />
          ))}
        </div>
      </section>
    </>
  );
}

export function PublicInsightRail({ children }: { children: ReactNode }) {
  return (
    <div className="-mx-3 mb-5 overflow-x-auto px-3 pb-1 sm:mx-0 sm:overflow-visible sm:px-0">
      <div className="flex min-w-max snap-x snap-mandatory gap-2 sm:grid sm:min-w-0 sm:grid-cols-3">
        {children}
      </div>
    </div>
  );
}

export function PublicInsightCard({
  eyebrow,
  value,
  description,
}: {
  eyebrow: string;
  value: string;
  description: string;
}) {
  return (
    <article className="w-[min(82vw,20rem)] shrink-0 snap-start rounded-2xl border border-border/70 bg-surface/55 p-4 sm:w-auto">
      <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-primary">{eyebrow}</p>
      <p className="mt-2 break-words font-display text-lg font-bold leading-tight">{value}</p>
      <p className="mt-2 text-[10px] leading-5 text-muted-foreground">{description}</p>
    </article>
  );
}

function GuideItem({
  number,
  title,
  description,
}: PublicDataGuideItem & { number: number }) {
  return (
    <div className="rounded-xl border border-border/60 bg-background/25 p-3">
      <p className="text-[9px] font-black uppercase tracking-[0.14em] text-primary">
        {String(number).padStart(2, "0")}
      </p>
      <p className="mt-1 text-xs font-semibold">{title}</p>
      <p className="mt-1 text-[10px] leading-5 text-muted-foreground">{description}</p>
    </div>
  );
}
