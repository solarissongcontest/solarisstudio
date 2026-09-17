import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  Flag,
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

const destinations: Array<{
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
    to: "/wiki",
    title: "Wiki",
    description: "Read detailed articles about countries, editions and Solaris history.",
    eyebrow: "Reference",
    icon: BookOpen,
  },
  {
    to: "/stories",
    title: "Stories",
    description: "Revisit published edition stories and memorable archive moments.",
    eyebrow: "Editorial archive",
    icon: Sparkles,
  },
  {
    to: "/anniversary",
    title: "Anniversary",
    description: "Explore champions, milestones and the history of Solaris Song Contest.",
    eyebrow: "Solaris history",
    icon: History,
  },
];

function ExplorePage() {
  return (
    <AppShell>
      <PageHeader
        eyebrow="Explore"
        title="Discover Solaris"
        description="Start with the part of Solaris Song Contest you want to explore. Results remain one tap away in the main navigation."
      />

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {destinations.map((destination) => (
          <ExploreCard key={destination.to} {...destination} />
        ))}
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
}: (typeof destinations)[number]) {
  return (
    <Link
      to={to as any}
      className="solaris-family-card group relative block min-w-0 overflow-hidden rounded-[1.35rem] border p-5 transition-[border-color,background-color,transform] duration-150 ease-out active:scale-[0.985] motion-reduce:active:scale-100 sm:p-6"
    >
      <div className="solaris-family-card-overlay pointer-events-none absolute inset-0" />
      <div className="relative z-10 flex h-full min-h-48 flex-col">
        <div className="flex items-start justify-between gap-4">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-primary/20 bg-primary/[0.08] text-primary">
            <Icon className="size-4.5" />
          </span>
          <span className="grid size-9 shrink-0 place-items-center rounded-full border border-white/10 bg-white/[0.035] text-primary transition-transform duration-150 ease-out group-hover:translate-x-0.5 motion-reduce:transform-none">
            <ArrowRight className="size-4" />
          </span>
        </div>

        <div className="mt-auto pt-7">
          <p className="text-[11px] font-black uppercase tracking-[0.16em] text-primary">{eyebrow}</p>
          <h2 className="display-headline mt-1 text-3xl leading-[0.95] text-white">{title}</h2>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{description}</p>
        </div>
      </div>
    </Link>
  );
}
