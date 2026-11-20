import { usePublicLaunchAvailability } from "@/lib/public-launch-context";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Archive,
  ArrowRight,
  BookOpen,
  CalendarDays,
  Flag,
  Gamepad2,
  History,
  RadioTower,
  Sparkles,
  ChevronRight,
  Search,
  type LucideIcon,
} from "lucide-react";

import { AppShell } from "@/components/AppShell";
import { WorldExploreEntry } from "@/components/world/WorldExploreEntry";
import { AppExplorePersonalized } from "@/components/app/AppExplorePersonalized";
import { useSolarisApp } from "@/components/app/AppRuntime";
import { PublicCommandPalette } from "@/components/public/PublicCommandPalette";
import { V3ExploreRouteGate } from "@/components/v3/V3ExploreRouteGate";
import "@/styles/explore-web-editorial.css";

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

type ExploreWebDestination = {
  to: string;
  title: string;
  description: string;
  icon: LucideIcon;
  eyebrow?: string;
};

const WEB_ARCHIVE_DESTINATIONS: ExploreWebDestination[] = [
  { to: "/archive", title: "Complete archive", description: "Explore the published contest timeline and historical collections.", icon: Archive },
  { to: "/wiki", title: "Wiki & reference", description: "Read published country and contest reference articles.", icon: BookOpen },
];

const WEB_MORE_DESTINATIONS: ExploreWebDestination[] = [
  { to: "/rules", title: "Rules", description: "Official contest rules and voting instructions.", icon: BookOpen },
  { to: "/tools", title: "Tools", description: "Public discovery and comparison tools.", icon: Search },
  { to: "/site-directory", title: "All destinations", description: "Find every available Solaris page by area.", icon: Archive },
  ...SECONDARY_DESTINATIONS.filter((item) => item.to !== "/wiki"),
];

function ExploreWebRow({ destination }: { destination: ExploreWebDestination }) {
  const Icon = destination.icon;
  return (
    <Link to={destination.to as any} className="explore-web-editorial__row">
      <span className="explore-web-editorial__row-icon" aria-hidden="true"><Icon className="size-5" /></span>
      <span className="explore-web-editorial__row-copy">
        <span className="explore-web-editorial__row-title">{destination.title}</span>
        <span className="explore-web-editorial__row-description">{destination.description}</span>
      </span>
      <ChevronRight className="size-4 shrink-0" aria-hidden="true" />
    </Link>
  );
}

/** Website composition only. Installed PWA keeps its independent app layout. */
function ExploreWebEditorial() {
  const { allowsReleased } = usePublicLaunchAvailability();
  const discover = PRIMARY_DESTINATIONS.filter(
    (item) => item.to !== "/editions" && allowsReleased(item.to),
  );
  const archive = WEB_ARCHIVE_DESTINATIONS.filter((item) => allowsReleased(item.to));
  const more = WEB_MORE_DESTINATIONS.filter((item) => allowsReleased(item.to));
  const editionsAvailable = allowsReleased("/editions");

  return (
    <div className="explore-web-editorial" data-explore-web-experience="website">
      <header className="explore-web-editorial__masthead">
        <p className="explore-web-editorial__eyebrow">Solaris Studio / Explore</p>
        <h1>Explore Solaris</h1>
        <p className="explore-web-editorial__intro">Discover countries, editions, shows and stories from across the contest.</p>
        <div className="explore-web-editorial__search" role="search">
          <Search className="size-5 shrink-0" aria-hidden="true" />
          <span className="explore-web-editorial__search-copy">
            <strong>Search Solaris</strong>
            <span>Find public countries, editions, entries and stories</span>
          </span>
          <PublicCommandPalette keyboardShortcut={false} />
        </div>
      </header>

      {editionsAvailable ? (
        <section className="explore-web-editorial__feature" aria-labelledby="explore-web-contest-title">
          <div>
            <p className="explore-web-editorial__feature-kicker">The contest</p>
            <h2 id="explore-web-contest-title">Editions and their stories</h2>
            <p>Browse the current contest and published editions from previous years.</p>
          </div>
          <Link to="/editions" className="explore-web-editorial__feature-link">
            Browse editions <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </section>
      ) : null}

      <div className="explore-web-editorial__columns">
        {discover.length ? (
          <section className="explore-web-editorial__collection" aria-labelledby="explore-web-discover-title">
            <div className="explore-web-editorial__section-heading">
              <p className="explore-web-editorial__eyebrow">Browse</p>
              <h2 id="explore-web-discover-title">Discover</h2>
            </div>
            <div className="explore-web-editorial__list">
              {discover.map((destination) => <ExploreWebRow key={destination.to} destination={destination} />)}
            </div>
          </section>
        ) : null}
        {archive.length ? (
          <section className="explore-web-editorial__collection" aria-labelledby="explore-web-archive-title">
            <div className="explore-web-editorial__section-heading">
              <p className="explore-web-editorial__eyebrow">History</p>
              <h2 id="explore-web-archive-title">Archive & reference</h2>
            </div>
            <div className="explore-web-editorial__list">
              {archive.map((destination) => <ExploreWebRow key={destination.to} destination={destination} />)}
            </div>
          </section>
        ) : null}
      </div>

      <WorldExploreEntry />

      {more.length ? (
        <section className="explore-web-editorial__collection explore-web-editorial__more" aria-labelledby="explore-web-more-title">
          <div className="explore-web-editorial__section-heading">
            <p className="explore-web-editorial__eyebrow">More</p>
            <h2 id="explore-web-more-title">More from Solaris</h2>
          </div>
          <div className="explore-web-editorial__list">
            {more.map((destination) => <ExploreWebRow key={destination.to} destination={destination} />)}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function ExplorePage() {
  const { allowsReleased } = usePublicLaunchAvailability();
  const { isAppMode } = useSolarisApp();

  const legacy = (
    <AppShell>
      {isAppMode ? (
        <>
          <AppExplorePersonalized />
          <section aria-labelledby="explore-primary-title">
            <div className="solaris-app-section-heading">
              <p>Browse Solaris</p>
              <h2 id="explore-primary-title">Explore</h2>
            </div>
            <div className="solaris-app-grouped-list">
              {[...PRIMARY_DESTINATIONS, ...SECONDARY_DESTINATIONS]
                .filter((item) => allowsReleased(item.to))
                .map((destination) => {
                  const Icon = destination.icon;
                  return (
                    <Link key={destination.to} to={destination.to as any} className="solaris-app-list-row">
                      <span className="solaris-app-list-icon"><Icon className="size-4" aria-hidden="true" /></span>
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold">{destination.title}</span>
                        <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{destination.description}</span>
                      </span>
                      <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    </Link>
                  );
                })}
            </div>
          </section>
        </>
      ) : <ExploreWebEditorial />}
    </AppShell>
  );

  return <V3ExploreRouteGate legacy={legacy} />;
}
