/**
 * A manual Organizer notice template, not the canonical Entry correction command.
 * No recipient identity or issue details are inferred from a country name or URL.
 * A human must select an actual country ID and write the issue before a draft
 * can be saved or published through the existing authoritative notice pipeline.
 */
export function newOrganizerEntryFollowupTemplate() {
  return {
    noticeType: "official_notice" as const,
    title: "Entry correction requested",
    body: "",
    severity: "action_required" as const,
    displaySurfaces: ["delegation_inbox"] as const,
    audience: "specific_countries" as const,
    audienceGroup: null,
    countryIds: [] as string[],
    acknowledgementRequired: true,
    scheduledAt: "",
  };
}
