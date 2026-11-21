import { createFileRoute } from "@tanstack/react-router";
import { parsePublicDirectoryUrlSearch } from "@/lib/v3-directory-url-search";
import { Archive } from "lucide-react";

import { V3DirectoryFamilyIndex, type V3DirectoryGroup } from "@/components/v3/V3DirectoryFamilyIndex";

export const Route = createFileRoute("/archive/")({
  validateSearch: parsePublicDirectoryUrlSearch,
  head: () => ({
    meta: [
      { title: "Archive — Solaris Studio" },
      {
        name: "description",
        content: "Explore published Solaris history across editions, countries, shows, stories, reference material and archive games.",
      },
    ],
    links: [
      { rel: "canonical", href: "https://studio.solaris-song-contest.workers.dev/archive" },
    ],
  }),
  component: ArchiveRootPage,
});

// Navigation only: archive entities and publication remain with their canonical
// owners. A dedicated Songs/Artists catalogue must not be invented by duplicating
// Reference; broader credit search appears only after its own approved rollout.
const ARCHIVE_DESTINATIONS = [
  { title: "Editions", description: "Browse published contest editions in their original historical context.", to: "/editions", group: "contests", aliases: ["ssc", "contests", "years"] },
  { title: "Shows", description: "Find published semi-finals, finals and official broadcast history.", to: "/shows", group: "contests", aliases: ["broadcasts", "finals", "schedule"] },
  { title: "Countries", description: "Follow national participation, published entries and delegation history.", to: "/countries", group: "countries-stories", aliases: ["nations", "delegations", "entries"] },
  { title: "Stories", description: "Read edition stories and past moments that have been released publicly.", to: "/stories", group: "countries-stories", aliases: ["timeline", "moments", "history"] },
  { title: "Wiki & Reference", description: "Read published country articles. Broader contest Reference opens here when its rollout is enabled.", to: "/wiki", group: "reference-results", aliases: ["wiki", "encyclopedia", "country articles", "knowledge"] },
  { title: "Records", description: "Open official all-time records and historical results in Results.", to: "/records", group: "reference-results", aliases: ["results", "rankings", "winners"] },
  { title: "Archive Games", description: "Play retained historical experiences built from public contest history.", to: "/archive-games", group: "reference-results", aliases: ["games", "play", "history"] },
] as const;

const ARCHIVE_SECTIONS = [
  { id: "contests", label: "Contests and broadcasts", description: "Follow the published SSC timeline and the shows in each edition." },
  { id: "countries-stories", label: "Countries and stories", description: "Explore national participation and the moments recorded around it." },
  { id: "reference-results", label: "Reference and records", description: "Find public reference knowledge and official result history in their respective sections." },
] as const;

const GROUPS: V3DirectoryGroup[] = ARCHIVE_SECTIONS.map(({ id, label, description }) => ({
  id,
  label,
  description,
  items: ARCHIVE_DESTINATIONS.filter((item) => item.group === id).map((item) => ({
    id: item.to, title: item.title, description: item.description,
    to: item.to, aliases: item.aliases,
  })),
}));

function ArchiveRootPage() {
  const urlSearch = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <V3DirectoryFamilyIndex
      urlSearch={urlSearch}
      onUrlSearchChange={(next) => { void navigate({ search: next, replace: true }); }}
      variant="archive"
      title="Archive"
      eyebrow="HISTORICAL SOLARIS"
      intro="Read the contest by edition, country and subject. Only published history appears here."
      browserIntro="Browse published editions, national histories and official archive subjects."
      searchLabel="Search archive"
      searchPlaceholder="Search archive subjects…"
      scopeLabel="All topics"
      itemNoun="archive topics"
      emptyText="Try another historical topic or category."
      groups={GROUPS}
      context={<ArchiveContext />}
    />
  );
}

function ArchiveContext() {
  return (
    <section className="v3-archive-context mb-4 border-b border-border/65 pb-3"
      aria-labelledby="archive-context-heading">
      <div className="flex items-start gap-3">
        <Archive size={20} className="mt-0.5 shrink-0 text-primary" aria-hidden="true" />
        <div>
          <h2 id="archive-context-heading" className="text-sm font-bold">Historical context stays historical</h2>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Archive destinations show published records from their own edition and time context.
            Current participation responsibilities belong in Participate, not in historical browsing.
          </p>
        </div>
      </div>
    </section>
  );
}
