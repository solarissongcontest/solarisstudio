export type V3S7PublicationAuthorizationEvidence = {
  command: "publication.schedule" | "publication.publish" | "publication.hide";
  requiredCapability: "publishing.publish" | "publishing.manage";
  scope: "show";
  objectResolution: "show -> edition";
  serverBoundary: "public.studio2_apply_show_publication_change";
  targetStates: readonly ("scheduled" | "public" | "hidden")[];
  negativePaths: readonly string[];
  evidence: readonly string[];
};

/**
 * S7 evidence for the target-sensitive Publication operation boundary.
 *
 * This is intentionally separate from the canonical authorization requirement
 * registry until its queued base branch lands. The command mapping is static:
 * schedule/publish require release authority, while hiding requires management
 * authority. The shared RPC derives edition scope from the show and chooses the
 * capability from the requested target state before mutation.
 */
export const V3_S7_PUBLICATION_AUTHORIZATION_EVIDENCE: readonly V3S7PublicationAuthorizationEvidence[] = [
  {
    command: "publication.schedule",
    requiredCapability: "publishing.publish",
    scope: "show",
    objectResolution: "show -> edition",
    serverBoundary: "public.studio2_apply_show_publication_change",
    targetStates: ["scheduled"],
    negativePaths: [
      "unknown show",
      "missing publishing.publish for show edition",
      "invalid publication transition",
      "scheduled time is missing or too close",
      "stale publication-control version",
    ],
    evidence: [
      "supabase/migrations/20261003203000_organisation_os_v5_show_publication_lifecycle.sql",
    ],
  },
  {
    command: "publication.publish",
    requiredCapability: "publishing.publish",
    scope: "show",
    objectResolution: "show -> edition",
    serverBoundary: "public.studio2_apply_show_publication_change",
    targetStates: ["public"],
    negativePaths: [
      "unknown show",
      "missing publishing.publish for show edition",
      "invalid publication transition",
      "no visible publication layer",
      "stale publication-control version",
    ],
    evidence: [
      "supabase/migrations/20261003203000_organisation_os_v5_show_publication_lifecycle.sql",
    ],
  },
  {
    command: "publication.hide",
    requiredCapability: "publishing.manage",
    scope: "show",
    objectResolution: "show -> edition",
    serverBoundary: "public.studio2_apply_show_publication_change",
    targetStates: ["hidden"],
    negativePaths: [
      "unknown show",
      "missing publishing.manage for show edition",
      "invalid publication transition",
      "stale publication-control version",
    ],
    evidence: [
      "supabase/migrations/20261003203000_organisation_os_v5_show_publication_lifecycle.sql",
    ],
  },
] as const;
