import { createFileRoute } from "@tanstack/react-router";
import { Archive } from "lucide-react";
import "@/styles/v3-archive-editorial.css";

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
  { title: "Editions", description: "Past contests and hosts.", to: "/editions", group: "history" },
  { title: "Countries", description: "Entries, results and participation.", to: "/countries", group: "history" },
  { title: "Songs & artists", description: "Published songs and artists.", to: "/encyclopedia", group: "history" },
  { title: "Shows", description: "Semi-finals, finals and special shows.", to: "/shows", group: "history" },
  { title: "Stories", description: "Published stories and historical moments.", to: "/stories", group: "history" },
  { title: "Records", description: "Records and all-time rankings.", to: "/records", group: "history" },
  { title: "Reference", description: "Search published Solaris records.", to: "/encyclopedia", group: "reference" },
  { title: "Archive Games", description: "Historical games.", to: "/archive-games", group: "reference" },
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
      visualClassName="v3-editorial-archive"
      eyebrow="HISTORICAL SOLARIS"
      intro="Published contests, shows and records."
      browserIntro="Published contests, shows and records."
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
            Published history from its original editions.
            Current participation responsibilities belong in Participate.
          </p>
        </div>
      </div>
    </section>
  );
}
