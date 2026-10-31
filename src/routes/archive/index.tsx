import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Archive,
  BookOpen,
  CalendarDays,
  Flag,
  Gamepad2,
  Newspaper,
  Tv2,
  type LucideIcon,
} from "lucide-react";

import { AppShell, PageHeader } from "@/components/AppShell";

export const Route = createFileRoute("/archive/")({
  head: () => ({
    meta: [
      { title: "Archive — Solaris Studio" },
      {
        name: "description",
        content:
          "Explore published Solaris history across editions, countries, shows, stories, reference material and archive games.",
      },
    ],
    links: [
      {
        rel: "canonical",
        href: "https://studio.solaris-song-contest.workers.dev/archive",
      },
    ],
  }),
  component: ArchiveRootPage,
});

type ArchiveDestination = {
  title: string;
  description: string;
  to: string;
  icon: LucideIcon;
};

const ARCHIVE_DESTINATIONS: readonly ArchiveDestination[] = [
  {
    title: "Editions",
    description: "Browse contest editions and their published historical context.",
    to: "/editions",
    icon: CalendarDays,
  },
  {
    title: "Countries",
    description: "Follow country identities, entries, results and participation history.",
    to: "/countries",
    icon: Flag,
  },
  {
    title: "Shows",
    description: "Open published semi-finals, finals and other historical show records.",
    to: "/shows",
    icon: Tv2,
  },
  {
    title: "Stories",
    description: "Read current and historical stories already released to the public.",
    to: "/stories",
    icon: Newspaper,
  },
  {
    title: "Reference",
    description: "Search publication-safe Solaris history across connected public entities.",
    to: "/encyclopedia",
    icon: BookOpen,
  },
  {
    title: "Archive Games",
    description: "Play retained historical games without changing official contest truth.",
    to: "/archive-games",
    icon: Gamepad2,
  },
] as const;

function ArchiveRootPage() {
  return (
    <AppShell>
      <PageHeader
        eyebrow="Explore Solaris"
        title="Archive"
        description="Published Solaris history, kept in its original contest context."
      />

      <section
        className="rounded-2xl border border-border bg-surface/55 p-4 sm:p-5"
        aria-labelledby="archive-context-heading"
      >
        <div className="flex items-start gap-3">
          <span
            className="mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"
            aria-hidden="true"
          >
            <Archive className="size-4" />
          </span>
          <div className="min-w-0">
            <h2 id="archive-context-heading" className="font-display text-lg font-bold">
              Historical context stays historical
            </h2>
            <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted-foreground">
              Archive destinations show published records from their own edition and time context.
              Current participation responsibilities belong in Participate, not in historical
              browsing.
            </p>
          </div>
        </div>
      </section>

      <section className="mt-6" aria-labelledby="archive-browse-heading">
        <div className="mb-3 border-b border-border/60 pb-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary">
            Historical Solaris
          </p>
          <h2 id="archive-browse-heading" className="mt-1 font-display text-xl font-bold sm:text-2xl">
            Browse the archive
          </h2>
        </div>

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {ARCHIVE_DESTINATIONS.map((destination) => {
            const Icon = destination.icon;
            return (
              <Link
                key={destination.title}
                to={destination.to as any}
                className="group flex min-h-32 items-start gap-3 rounded-2xl border border-border bg-surface p-4 transition hover:border-primary/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
              >
                <span
                  className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-background/70 text-primary"
                  aria-hidden="true"
                >
                  <Icon className="size-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">{destination.title}</span>
                  <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                    {destination.description}
                  </span>
                  <span className="mt-3 inline-block text-xs font-semibold text-primary transition-transform group-hover:translate-x-0.5">
                    Open →
                  </span>
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      <p className="mt-6 text-xs leading-relaxed text-muted-foreground">
        Archive surfaces only expose information their destination already treats as public.
        Missing or unpublished historical material remains unavailable rather than being inferred
        from current contest state.
      </p>
    </AppShell>
  );
}
