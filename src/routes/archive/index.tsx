import { createFileRoute } from "@tanstack/react-router";
import { Archive } from "lucide-react";

import { V3DirectoryFamilyIndex, type V3DirectoryGroup } from "@/components/v3/V3DirectoryFamilyIndex";

export const Route = createFileRoute("/archive/")({
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

// A navigation catalogue, never a second archive projection or a public read
// of unpublished entry, voting, or Organizer records.
const ARCHIVE_DESTINATIONS = [
  { title: "Editions", description: "Browse contest editions and their published historical context.", to: "/editions", group: "history" },
  { title: "Countries", description: "Follow country identities, entries, results and participation history.", to: "/countries", group: "history" },
  { title: "Shows", description: "Open published semi-finals, finals and other historical show records.", to: "/shows", group: "history" },
  { title: "Stories", description: "Read current and historical stories already released to the public.", to: "/stories", group: "history" },
  { title: "Records", description: "Explore official all-time records and published contest outcomes in Results.", to: "/records", group: "history" },
  { title: "Reference", description: "Search publication-safe Solaris history across connected public entities.", to: "/encyclopedia", group: "reference" },
  { title: "Archive Games", description: "Play retained historical games without changing official contest truth.", to: "/archive-games", group: "reference" },
] as const;

const GROUPS: V3DirectoryGroup[] = [
  {
    id: "history", label: "Published history",
    items: ARCHIVE_DESTINATIONS.filter((item) => item.group === "history").map((item) => ({
      id: item.to, title: item.title, description: item.description, to: item.to,
    })),
  },
  {
    id: "reference", label: "Reference and games",
    items: ARCHIVE_DESTINATIONS.filter((item) => item.group === "reference").map((item) => ({
      id: item.to, title: item.title, description: item.description, to: item.to,
    })),
  },
];

function ArchiveRootPage() {
  return (
    <V3DirectoryFamilyIndex
      title="Archive"
      eyebrow="HISTORICAL SOLARIS"
      intro="Published Solaris history, kept in its original contest context."
      browserIntro="Explore published SSC history in its original edition and time context."
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
