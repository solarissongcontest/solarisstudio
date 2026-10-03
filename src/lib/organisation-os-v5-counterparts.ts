export type OrganisationCounterpartKind =
  | "inspect"
  | "operate"
  | "moderate"
  | "diagnose"
  | "none";

export type OrganisationCounterpart = {
  id: string;
  participantSurface: string;
  organizerSurface: string | null;
  kind: OrganisationCounterpartKind;
  rationale: string;
};

/**
 * Organisation OS V5 participant/public counterpart audit.
 *
 * Every participant-facing workflow that can reasonably create support,
 * moderation, publication or delivery work must have one explicit outcome:
 *
 * - a concrete Organizer counterpart, or
 * - `kind: "none"` with a deliberate privacy/ownership reason.
 *
 * An omitted row is therefore a parity defect, not an implicit "none".
 */
export const ORGANISATION_OS_V5_COUNTERPARTS: readonly OrganisationCounterpart[] = [
  {
    id: "mysolaris.home",
    participantSurface: "/my-solaris",
    organizerSurface: "/admin/countries/:countryId?tab=participant-view",
    kind: "inspect",
    rationale:
      "Support needs a read-only projection of current delegation state without impersonating the country account.",
  },
  {
    id: "mysolaris.tasks",
    participantSurface: "/my-solaris/tasks",
    organizerSurface: "/admin/countries/:countryId?tab=participant-view",
    kind: "inspect",
    rationale:
      "Organizer support must see the same canonical participation-task projection and why each task is actionable.",
  },
  {
    id: "mysolaris.entry",
    participantSurface: "/my-solaris/entry",
    organizerSurface: "/admin/entries/:editionSlug",
    kind: "operate",
    rationale:
      "Entry readiness, media, eligibility and review state require an explicit edition-level Organizer workspace.",
  },
  {
    id: "mysolaris.voting",
    participantSurface: "/my-solaris/voting",
    organizerSurface: "/televoting/admin",
    kind: "operate",
    rationale:
      "Jury and public-vote lifecycle state must be inspectable and operable without exposing another user's ballot.",
  },
  {
    id: "mysolaris.notices",
    participantSurface: "/my-solaris/notices",
    organizerSurface: "/admin/communications",
    kind: "operate",
    rationale:
      "Official communication drafting, audience, acknowledgement requirements and delivery lifecycle are Organizer-owned.",
  },
  {
    id: "mysolaris.country",
    participantSurface: "/my-solaris/country",
    organizerSurface: "/admin/countries/:countryId?tab=public-profile",
    kind: "operate",
    rationale:
      "Country identity and delegation settings need an explicit support path with participant-view parity.",
  },
  {
    id: "mysolaris.page-media",
    participantSurface: "/my-solaris/page-builder",
    organizerSurface: "/admin/countries/:countryId?tab=appearance",
    kind: "operate",
    rationale:
      "Published country page media and appearance need preview, validation and safe Organizer override controls.",
  },
  {
    id: "mysolaris.history",
    participantSurface: "/my-solaris/history",
    organizerSurface: "/admin/hod-history",
    kind: "inspect",
    rationale:
      "Delegation and participation history is canonical archive state and requires Organizer inspection rather than participant impersonation.",
  },
  {
    id: "mysolaris.activity",
    participantSurface: "/my-solaris/activity",
    organizerSurface: null,
    kind: "none",
    rationale:
      "The personal activity feed is a derived recipient view; Organizer tooling owns the source events, not a second copy of the user's feed.",
  },
  {
    id: "mysolaris.predictions",
    participantSurface: "/my-solaris/predictions",
    organizerSurface: "/admin/predictions",
    kind: "operate",
    rationale:
      "Prediction rounds and scoring lifecycle need Organizer configuration while individual prediction choices remain participant-owned.",
  },
  {
    id: "mysolaris.saved",
    participantSurface: "/my-solaris/saved",
    organizerSurface: null,
    kind: "none",
    rationale:
      "Saved and followed entities are private user preferences and deliberately have no Organizer read or mutation surface.",
  },
  {
    id: "mysolaris.account",
    participantSurface: "/my-solaris/account",
    organizerSurface: "/admin/country-accounts",
    kind: "operate",
    rationale:
      "Organizer account support may manage delegation account state and access but must never expose passwords or impersonate sessions.",
  },
  {
    id: "participation.confirmations",
    participantSurface: "/confirmations",
    organizerSurface: "/confirmations/admin",
    kind: "operate",
    rationale:
      "Confirmation requirements, rounds, responses, recovery and sync all require an Organizer control plane.",
  },
  {
    id: "participation.jury",
    participantSurface: "/jury-voting",
    organizerSurface: "/admin/jury/:editionSlug",
    kind: "operate",
    rationale:
      "Jury roster and ballot completion require Organizer lifecycle controls while individual ballot secrecy remains protected.",
  },
  {
    id: "participation.televoting",
    participantSurface: "/televoting",
    organizerSurface: "/televoting/admin",
    kind: "operate",
    rationale:
      "Voting rounds, eligibility, integrity review, calculation and publication require explicit Organizer controls.",
  },
  {
    id: "participation.next-in-line",
    participantSurface: "/next-in-line",
    organizerSurface: "/admin/next-in-line",
    kind: "operate",
    rationale:
      "The side competition is independent of the official confirmation requirement and needs its own Organizer lifecycle.",
  },
  {
    id: "participation.integrity-report",
    participantSurface: "/integrity/report",
    organizerSurface: "/admin/integrity-investigations",
    kind: "moderate",
    rationale:
      "Reports require protected case triage and investigation without exposing confidential or sealed reporter identity.",
  },
  {
    id: "public.rules",
    participantSurface: "/rules",
    organizerSurface: "/admin/rules-manager",
    kind: "operate",
    rationale:
      "The public rulebook is a governed publication whose draft, validation and release lifecycle belongs to Organizer tooling.",
  },
  {
    id: "public.results",
    participantSurface: "/results",
    organizerSurface: "/admin/results",
    kind: "operate",
    rationale:
      "Public results are projections of the canonical result lifecycle, which requires review, lock, reveal and publication controls.",
  },
  {
    id: "public.show-mode",
    participantSurface: "/show-mode",
    organizerSurface: "/admin/broadcast-rundown",
    kind: "operate",
    rationale:
      "The public live presentation depends on an Organizer-owned rundown, cue sequence and broadcast control surface.",
  },
  {
    id: "engagement.fantasy",
    participantSurface: "/fantasy",
    organizerSurface: "/admin/fantasy",
    kind: "operate",
    rationale:
      "Fantasy roster costs, lock windows, scoring and result lifecycle require an Organizer control plane.",
  },
  {
    id: "engagement.fan-public-identity",
    participantSurface: "/predictions",
    organizerSurface: "/admin/community-moderation",
    kind: "moderate",
    rationale:
      "Public fan display identity can be hidden or restored without changing competitive predictions or scores.",
  },
  {
    id: "delivery.push",
    participantSurface: "/settings",
    organizerSurface: "/admin/system-operations",
    kind: "diagnose",
    rationale:
      "Push delivery failures need privacy-safe diagnostics without exposing endpoint keys, secrets or device impersonation.",
  },
  {
    id: "diagnostics.public-ux",
    participantSurface: "/",
    organizerSurface: "/admin/public-ux",
    kind: "diagnose",
    rationale:
      "Public navigation, search and task-completion telemetry require aggregate operational visibility rather than user impersonation.",
  },
] as const;

export function organisationCounterpart(id: string) {
  return ORGANISATION_OS_V5_COUNTERPARTS.find((item) => item.id === id) ?? null;
}
