import { createFileRoute } from "@tanstack/react-router";
import {
  BookOpen,
  CalendarDays,
  Flag,
  Gamepad2,
  History,
  RadioTower,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

import { AppShell } from "@/components/AppShell";
import { PublicDestinationGrid } from "@/components/public/PublicDestinationGrid";
import { PublicHubHero } from "@/components/public/PublicHubHero";
import { PublicPrimaryAction } from "@/components/public/PublicPrimaryAction";
import { PublicSecondaryLinks } from "@/components/public/PublicSecondaryLinks";

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
    to: "/countries",
    title: "Countries",
    description: "Open delegation histories, entries, records and country pages.",
    eyebrow: "Delegations",
    icon: Flag,
  },
  {
    to: "/editions",
    title: "Editions",
    description: "Browse every SSC edition, host city and contest cycle.",
    eyebrow: "Contest archive",
    icon: CalendarDays,
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
      <PublicHubHero
        eyebrow="Explore"
        title="Explore Solaris"
        description="Countries, editions, shows and stories from across SSC. Start broad, then follow the contest history wherever it gets interesting."
      />

      <section aria-labelledby="explore-primary-title">
        <div className="public-hub-section-heading">
          <p className="public-hub-eyebrow">Start here</p>
          <h2 id="explore-primary-title">What do you want to explore?</h2>
        </div>

        <PublicDestinationGrid columns={2}>
          {PRIMARY_DESTINATIONS.map((destination) => (
            <PublicPrimaryAction key={destination.to} {...destination} />
          ))}
        </PublicDestinationGrid>
      </section>

      <PublicSecondaryLinks
        eyebrow="More from Solaris"
        title="Go deeper"
        items={SECONDARY_DESTINATIONS}
      />
    </AppShell>
  );
}
