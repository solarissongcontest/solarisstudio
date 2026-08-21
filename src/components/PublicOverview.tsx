import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { AppShell, PageHeader, Panel, StatTile } from "@/components/AppShell";

export type PublicOverviewHighlight = {
  label: string;
  value: ReactNode;
  hint?: string;
};

export type PublicOverviewLink = {
  title: string;
  description: string;
  href: string;
  eyebrow?: string;
};

export function PublicOverview({
  eyebrow,
  title,
  description,
  highlights,
  discover,
  deepDive,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  highlights: PublicOverviewHighlight[];
  discover: PublicOverviewLink[];
  deepDive: PublicOverviewLink[];
  children?: ReactNode;
}) {
  return (
    <AppShell>
      <PageHeader eyebrow={eyebrow} title={title} description={description} />

      <nav
        aria-label={`${title} depth`}
        className="mb-5 grid overflow-hidden rounded-2xl border border-border/70 bg-surface/55 sm:grid-cols-3"
      >
        <DepthStep number="01" label="Overview" description="The useful summary" active />
        <DepthStep number="02" label="Discover" description="Browse and explore" />
        <DepthStep number="03" label="Deep dive" description="Full tools and detail" />
      </nav>

      {highlights.length > 0 && (
        <Panel
          className="mb-5"
          title="At a glance"
          description="The important part first. The detailed tools are still there when you actually need them."
        >
          <div className="grid grid-cols-2 gap-x-5 gap-y-5 sm:grid-cols-4">
            {highlights.map((highlight) => (
              <StatTile
                key={highlight.label}
                label={highlight.label}
                value={highlight.value}
                hint={highlight.hint}
              />
            ))}
          </div>
        </Panel>
      )}

      {children}

      <section className="mb-5">
        <OverviewSectionHeading
          eyebrow="Discover"
          title="Explore without opening the full control room"
          description="These are the useful next places for normal browsing."
        />
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {discover.map((item) => (
            <OverviewLinkCard key={`${item.title}-${item.href}`} item={item} />
          ))}
        </div>
      </section>

      <section>
        <OverviewSectionHeading
          eyebrow="Deep dive"
          title="Go further when you want the detail"
          description="Full tables, filters, comparisons and specialist tools live here instead of crowding the overview."
        />
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {deepDive.map((item) => (
            <OverviewLinkCard key={`${item.title}-${item.href}`} item={item} />
          ))}
        </div>
      </section>
    </AppShell>
  );
}

function DepthStep({
  number,
  label,
  description,
  active = false,
}: {
  number: string;
  label: string;
  description: string;
  active?: boolean;
}) {
  return (
    <div
      className={`relative min-w-0 border-b border-border/60 px-4 py-3 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0 ${
        active ? "bg-primary/[0.075]" : ""
      }`}
    >
      <div className="flex items-start gap-3">
        <span className={`numeric text-[10px] font-black ${active ? "text-primary" : "text-muted-foreground"}`}>
          {number}
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold">{label}</span>
          <span className="mt-0.5 block text-[10px] text-muted-foreground">{description}</span>
        </span>
      </div>
    </div>
  );
}

function OverviewSectionHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="mb-3 border-b border-border/60 pb-3">
      <p className="text-[9px] font-black uppercase tracking-[0.2em] text-primary">{eyebrow}</p>
      <h2 className="mt-1 font-display text-xl font-bold tracking-[-0.03em] sm:text-2xl">{title}</h2>
      <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground">{description}</p>
    </div>
  );
}

function OverviewLinkCard({ item }: { item: PublicOverviewLink }) {
  const content = (
    <>
      <p className="text-[9px] font-black uppercase tracking-[0.16em] text-primary">
        {item.eyebrow ?? "Open"}
      </p>
      <h3 className="mt-1.5 text-sm font-semibold">{item.title}</h3>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{item.description}</p>
      <span className="mt-3 inline-block text-[10px] font-bold text-primary">Continue →</span>
    </>
  );

  if (item.href.includes("?")) {
    return (
      <a
        href={item.href}
        className="min-w-0 rounded-2xl border border-border/70 bg-surface/70 p-4 transition hover:border-primary/30 hover:bg-surface-strong"
      >
        {content}
      </a>
    );
  }

  return (
    <Link
      to={item.href as any}
      className="min-w-0 rounded-2xl border border-border/70 bg-surface/70 p-4 transition hover:border-primary/30 hover:bg-surface-strong"
    >
      {content}
    </Link>
  );
}
