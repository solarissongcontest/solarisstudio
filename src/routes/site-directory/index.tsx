import { createFileRoute } from "@tanstack/react-router";

import { V3DirectoryFamilyIndex, type V3DirectoryGroup } from "@/components/v3/V3DirectoryFamilyIndex";
import { publicSearchText } from "@/lib/public-navigation";
import {
  siteDirectoryDestinations,
  SITE_DIRECTORY_AREA_LABELS,
  SITE_DIRECTORY_AREA_ORDER,
} from "@/lib/v3-site-directory";

export const Route = createFileRoute("/site-directory/")({
  head: () => ({
    meta: [
      { title: "All Solaris pages — Solaris Studio" },
      { name: "description", content: "Search and browse every public Solaris Studio destination." },
    ],
  }),
  component: SiteDirectoryPage,
});

const ALL_PAGES = siteDirectoryDestinations();
const GROUPS: V3DirectoryGroup[] = SITE_DIRECTORY_AREA_ORDER.map((area) => ({
  id: area,
  label: SITE_DIRECTORY_AREA_LABELS[area],
  items: ALL_PAGES.filter((item) => item.area === area).map((item) => ({
    id: item.id,
    title: item.label,
    description: item.description,
    to: item.to,
    searchText: publicSearchText(item),
    eyebrow: item.visibility === "advanced" ? "Advanced" : undefined,
    aliases: item.aliases,
  })),
}));

function SiteDirectoryPage() {
  return (
    <V3DirectoryFamilyIndex
      variant="sitemap"
      title="All Solaris pages"
      eyebrow="FIND YOUR WAY"
      intro="Find public pages, tools and destinations by topic."
      browserIntro="Browse Solaris by topic or search for a page, tool or feature."
      searchLabel="Search Solaris Studio pages"
      searchPlaceholder="Search pages, tools or old feature names…"
      scopeLabel="All areas"
      itemNoun="pages"
      emptyText="Try a different page, feature or area."
      groups={GROUPS}
    />
  );
}
