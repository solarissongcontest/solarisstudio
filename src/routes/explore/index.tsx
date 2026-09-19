import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  Flag,
  Gamepad2,
  History,
  RadioTower,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

import { AppShell, PageHeader } from "@/components/AppShell";

export const Route = createFileRoute("/explore/")({
  head: () => ({
    meta: [
      { title: "Explore — Solaris Studio" },
      {
        name: "description",
        content: "Browse Solaris Song Contest editions, countries, shows, stories and archive history.",
      },
    ],
  }),
  component: ExplorePage,
});

const PRIMARY_DESTINATIONS: Array<{
  to: string;
  title: string;
  description: string;
  eyebrow: string;
  icon: LucideIcon;
}> = [
  {
    to: "/editions",
    title: "Editions",
    description: "Browse every SSC edition, host city and contest cycle.",
    eyebrow: "Contest archive",
    icon: CalendarDays,
  },
  {
    to: "/countries",
    title: "Countries",
    description: "Open delegation histories, entries, records and country pages.",
    eyebrow: "Delegations",
    icon: Flag,
  },
  {
    to: "/shows",
    title: "Shows",
    description: "Find semi-finals, finals, running orders and broadcast details.",
    eyebrow: "Broadcast archive",
    icon: RadioTower,
  },
  {
    to: "/stories",
    title: "Stories",
    description: "Revisit published edition stories and memorable archive moments.",
    eyebrow: "Editorial history",
    icon: Sparkles,
  },
];

const SECONDARY_DESTINATIONS = [
  {
    to: "/wiki",
    title: "Wiki",
    description: "Detailed country and contest articles.",
    icon: BookOpen,
  },
  {
    to: "/anniversary",
    title: "Anniversary",
    description: "Champions, milestones and Solaris history.",
    icon: History,
  },
  {
    to: "/archive-games",
    title: "Archive Games",
    description: "Play with published Solaris history and results.",
    icon: Gamepad2,
  },
];

function ExplorePage() {
  return (
    <AppShell>
      <PageHeader
        eyebrow="Explore"
        title="Explore Solaris"
        description="Start with countries, editions, shows or stories. More specialist archive experiences stay nearby without competing for the first click."
      />

      <section aria-labelledby="explore-primary-title">
        <div className="mb-3 border-b border-border/60 pb-3">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-primary">
            Start here
          </p>
          <h2 id="explore-primary-title" className="mt-1 font-display text-2xl font-bold">
            What do you want to explore?
          </h2>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {PRIMARY_DESTINATIONS.map((destination) => (
            <ExploreCard key={destination.to} {...destination} />
          ))}
        </div>
      </section>

      <section className="mt-8" aria-labelledby="explore-more-title">
        <div className="mb-3 border-b border-border/60 pb-3">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
            More from Solaris
          </p>
          <h2 id="explore-more-title" className="mt-1 font-display text-xl font-bold">
            Go deeper
          </h2>
        </div>

        <div className="grid gap-2 sm:grid-cols-3">
          {SECONDARY_DESTINATIONS.map(({ to, title, description, icon: Icon }) => (
            <Link
              key={to}
              to={to as any}
              className="group flex min-h-28 min-w-0 items-start gap-3 rounded-xl border border-border/70 bg-surface/45 p-4 transition-colors hover:border-primary/30 hover:bg-surface/75"
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-primary/15 bg-primary/[0.07] text-primary">
                <Icon className="size-4" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-foreground">{title}</span>
                <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                  {description}
                </span>
              </span>
              <ArrowRight className="mt-1 size-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </Link>
          ))}
        </div>
      </section>
    </AppShell>
  );
}

function ExploreCard({
  to,
  title,
  description,
  eyebrow,
  icon: Icon,
}: (typeof PRIMARY_DESTINATIONS)[number]) {
  return (
    <Link
      to={to as any}
      className="solaris-family-card group relative block min-w-0 overflow-hidden rounded-[1.35rem] border p-5 transition-[border-color,background-color,transform] duration-150 ease-out active:scale-[0.985] motion-reduce:active:scale-100 sm:p-6"
    >
      <div className="solaris-family-card-overlay pointer-events-none absolute inset-0" />
      <div className="relative z-10 flex min-h-44 flex-col">
        <div className="flex items-start justify-between gap-4">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-primary/20 bg-primary/[0.08] text-primary">
            <Icon className="size-4.5" aria-hidden="true" />
          </span>
          <ArrowRight className="size-4 text-primary transition-transform group-hover:translate-x-0.5" />
        </div>

        <div className="mt-auto pt-7">
          <p className="text-[11px] font-black uppercase tracking-[0.16em] text-primary">{eyebrow}</p>
          <h3 className="display-headline mt-1 text-3xl leading-[0.95] text-white">{title}</h3>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{description}</p>
        </div>
      </div>
    </Link>
  );
}
