export type OrganizerAnniversaryPreview = {
  id: string;
  href: string;
  title: string;
  description: string;
  requiredForLaunch: boolean;
};

export const ORGANIZER_ANNIVERSARY_PREVIEWS = [
  {
    id: "home-active",
    href: "/?anniversary=active",
    title: "Anniversary Day",
    description: "Full 17 September takeover with particles, archive facts and homepage anniversary editorial.",
    requiredForLaunch: true,
  },
  {
    id: "home-countdown",
    href: "/?anniversary=countdown",
    title: "Countdown",
    description: "Pre-anniversary state without the full particle takeover.",
    requiredForLaunch: false,
  },
  {
    id: "anniversary-hub",
    href: "/anniversary?anniversary=active",
    title: "Anniversary hub",
    description: "Open the permanent anniversary archive with resolved historical results only.",
    requiredForLaunch: true,
  },
  {
    id: "my-solaris-story",
    href: "/my-solaris?anniversary=active",
    title: "MySolaris story",
    description: "Preview the route-native personalized country anniversary recap and share text.",
    requiredForLaunch: true,
  },
  {
    id: "countries-archive",
    href: "/countries?anniversary=active",
    title: "Countries archive",
    description: "Preview the country directory with anniversary context and canonical delegation statistics.",
    requiredForLaunch: true,
  },
  {
    id: "records-archive",
    href: "/records?anniversary=active",
    title: "Records archive",
    description: "Preview the record book with anniversary styling and historical context.",
    requiredForLaunch: true,
  },
  {
    id: "archive-games",
    href: "/archive-games?anniversary=active",
    title: "Archive Games",
    description: "Preview the retained archive games and interactive historical tools in Anniversary Day context.",
    requiredForLaunch: true,
  },
] as const satisfies readonly OrganizerAnniversaryPreview[];

export const ORGANIZER_ANNIVERSARY_REQUIRED_PREVIEW_HREFS = [
  "/?anniversary=active",
  "/anniversary?anniversary=active",
  "/countries?anniversary=active",
  "/records?anniversary=active",
  "/my-solaris?anniversary=active",
  "/archive-games?anniversary=active",
] as const;

export function organizerAnniversaryRequiredPreviews() {
  return ORGANIZER_ANNIVERSARY_PREVIEWS.filter((preview) => preview.requiredForLaunch);
}
