export type OrganisationCounterpartKind =
  | "inspect"
  | "operate"
  | "moderate"
  | "diagnose";

export type OrganisationCounterpart = {
  id: string;
  participantSurface: string;
  organizerSurface: string;
  kind: OrganisationCounterpartKind;
  rationale: string;
};

/**
 * Organisation OS V5 participant/public feature counterpart registry.
 *
 * Keep this list focused on participant-facing features whose state, identity,
 * publication or delivery can require organizer support. A counterpart does not
 * mean organizers may impersonate participants or rewrite private user data.
 */
export const ORGANISATION_OS_V5_COUNTERPARTS: readonly OrganisationCounterpart[] = [
  {
    id: "delegation-tasks",
    participantSurface: "/my-solaris/tasks",
    organizerSurface: "/admin/countries/:countryId?tab=participant-view",
    kind: "inspect",
    rationale: "Support must be able to see the same task projection without impersonation.",
  },
  {
    id: "country-profile",
    participantSurface: "/my-solaris/country",
    organizerSurface: "/admin/countries/:countryId?tab=public-profile",
    kind: "operate",
    rationale: "Country identity and public profile state need an explicit organizer support path.",
  },
  {
    id: "country-appearance",
    participantSurface: "/my-solaris/theme",
    organizerSurface: "/admin/countries/:countryId?tab=appearance",
    kind: "operate",
    rationale: "Published country appearance needs a preview and safe organizer override path.",
  },
  {
    id: "next-in-line",
    participantSurface: "/next-in-line",
    organizerSurface: "/admin/next-in-line",
    kind: "operate",
    rationale: "The side competition is independent of the official confirmation requirement.",
  },
  {
    id: "prediction-league",
    participantSurface: "/predictions",
    organizerSurface: "/admin/predictions",
    kind: "operate",
    rationale: "Prediction rounds and scoring lifecycle are organizer-owned competitive configuration.",
  },
  {
    id: "fan-public-identity",
    participantSurface: "/predictions",
    organizerSurface: "/admin/community-moderation",
    kind: "moderate",
    rationale: "Public fan display identity can be moderated without changing scores or predictions.",
  },
  {
    id: "fantasy-ssc",
    participantSurface: "/fantasy",
    organizerSurface: "/admin/fantasy",
    kind: "operate",
    rationale: "Fantasy roster costs, locks and scoring require an organizer control plane.",
  },
  {
    id: "push-delivery",
    participantSurface: "/settings",
    organizerSurface: "/admin/system-operations",
    kind: "diagnose",
    rationale: "Push delivery failures need privacy-safe diagnostics without exposing device secrets.",
  },
  {
    id: "public-ux",
    participantSurface: "/",
    organizerSurface: "/admin/public-ux",
    kind: "diagnose",
    rationale: "Public navigation and task completion need operational visibility.",
  },
] as const;

export function organisationCounterpart(id: string) {
  return ORGANISATION_OS_V5_COUNTERPARTS.find((item) => item.id === id) ?? null;
}
