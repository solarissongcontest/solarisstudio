import { SOLARIS_V6_DOMAINS } from "../../src/lib/solaris-v6-domain-registry";

export type SystemDomainOwner = {
  domain: string;
  canonicalStore: string;
  authoritativeService: string;
  primaryTables: string[];
  mutationCommands: string[];
  projections: string[];
  eventTypes: string[];
  publicConsumers: string[];
  organizerConsumers: string[];
  backgroundConsumers: string[];
  retentionClass: string;
  sensitivityClass: string;
};

export type SystemDomainRegistryRow = SystemDomainOwner & {
  /** Existing V6 product-domain owner reused by this System V3 row when applicable. */
  sourceDomainId?: string;
  auditStatus: "owner-locked" | "tables-verified" | "certified";
  notes?: string;
};

type V6Metadata = {
  canonicalStore: string;
  primaryTables: string[];
  backgroundConsumers?: string[];
  retentionClass: string;
  sensitivityClass: string;
  auditStatus?: SystemDomainRegistryRow["auditStatus"];
  notes?: string;
};

function sourceDomain(id: string) {
  const source = SOLARIS_V6_DOMAINS.find((domain) => domain.id === id);
  if (!source) throw new Error(`Missing canonical V6 source domain: ${id}`);
  return source;
}

function fromV6(
  sourceId: string,
  domain: string,
  metadata: V6Metadata,
): SystemDomainRegistryRow {
  const source = sourceDomain(sourceId);
  return {
    domain,
    sourceDomainId: sourceId,
    canonicalStore: metadata.canonicalStore,
    authoritativeService: source.canonicalWriteModel,
    primaryTables: metadata.primaryTables,
    mutationCommands: [...source.commands],
    projections: [
      source.canonicalReadProjection,
      source.publicProjection,
      source.participantProjection,
      source.organizerProjection,
    ].filter((value): value is string => Boolean(value)),
    eventTypes: [...source.events],
    publicConsumers: [source.publicProjection, source.participantProjection].filter(
      (value): value is string => Boolean(value),
    ),
    organizerConsumers: [source.organizerProjection].filter(
      (value): value is string => Boolean(value),
    ),
    backgroundConsumers: metadata.backgroundConsumers ?? [...source.tasks],
    retentionClass: metadata.retentionClass,
    sensitivityClass: metadata.sensitivityClass,
    auditStatus: metadata.auditStatus ?? "owner-locked",
    notes: metadata.notes,
  };
}

function standalone(row: SystemDomainRegistryRow): SystemDomainRegistryRow {
  return row;
}

/**
 * Canonical System V3 ownership inventory.
 *
 * This intentionally reuses the established Solaris V6 domain registry for
 * command/event/projection vocabulary. System V3 may split one product domain
 * into several storage/security concerns, but it must never create a competing
 * business authority. `owner-locked` means the authority is decided while the
 * exhaustive physical-table/security audit is still in progress.
 */
export const SYSTEM_V3_DOMAINS: readonly SystemDomainRegistryRow[] = [
  standalone({
    domain: "identity",
    canonicalStore: "Supabase Auth identity",
    authoritativeService: "Supabase Auth + Solaris authenticated server identity adapter",
    primaryTables: ["auth.users"],
    mutationCommands: ["auth.sign_in", "auth.sign_out", "auth.recover"],
    projections: ["ViewerContext", "authenticated user identity"],
    eventTypes: ["identity.authenticated", "identity.signed_out"],
    publicConsumers: ["ViewerContext", "MySolaris"],
    organizerConsumers: ["Organizer authorization gate"],
    backgroundConsumers: [],
    retentionClass: "account-lifecycle",
    sensitivityClass: "restricted-personal",
    auditStatus: "owner-locked",
  }),
  standalone({
    domain: "accounts",
    canonicalStore: "Solaris account/profile state keyed by auth user",
    authoritativeService: "authenticated account server contracts",
    primaryTables: ["profiles"],
    mutationCommands: ["account.update_profile"],
    projections: ["MySolaris account projection"],
    eventTypes: ["account.changed"],
    publicConsumers: ["MySolaris"],
    organizerConsumers: [],
    backgroundConsumers: [],
    retentionClass: "account-lifecycle",
    sensitivityClass: "private-personal",
    auditStatus: "owner-locked",
  }),
  standalone({
    domain: "sessions",
    canonicalStore: "Supabase Auth session state",
    authoritativeService: "Supabase Auth session lifecycle",
    primaryTables: ["auth.sessions"],
    mutationCommands: ["session.refresh", "session.revoke"],
    projections: ["ViewerContext authenticationState", "account device/session view"],
    eventTypes: ["session.changed", "session.revoked"],
    publicConsumers: ["V3 shell", "MySolaris account"],
    organizerConsumers: ["Organizer access gate"],
    backgroundConsumers: [],
    retentionClass: "security-session",
    sensitivityClass: "restricted-security",
    auditStatus: "owner-locked",
  }),
  standalone({
    domain: "memberships",
    canonicalStore: "edition/delegation membership assignments",
    authoritativeService: "Solaris membership and country-account authority",
    primaryTables: ["country_accounts", "studio2_role_assignments"],
    mutationCommands: ["membership.assign", "membership.revoke"],
    projections: ["ViewerContext memberships", "Organizer people/access projection"],
    eventTypes: ["membership.changed"],
    publicConsumers: ["ViewerContext", "MySolaris"],
    organizerConsumers: ["People & Access"],
    backgroundConsumers: ["task audience evaluation"],
    retentionClass: "audit-history",
    sensitivityClass: "restricted-authorization",
    auditStatus: "owner-locked",
  }),
  fromV6("permissions", "capabilities", {
    canonicalStore: "Permission Engine v2 capability grants",
    primaryTables: ["studio2_role_assignments"],
    retentionClass: "audit-history",
    sensitivityClass: "restricted-authorization",
    notes: "Capability evaluation, not client role literals, is the canonical authorization source.",
  }),
  fromV6("country-identity", "countries", {
    canonicalStore: "canonical country identity",
    primaryTables: ["countries"],
    retentionClass: "permanent-reference",
    sensitivityClass: "public",
  }),
  fromV6("country-identity", "country-historical-identity", {
    canonicalStore: "edition-scoped historical country identity",
    primaryTables: ["countries"],
    retentionClass: "permanent-history",
    sensitivityClass: "public",
    notes: "Physical historical-identity tables/columns remain part of the table-level audit; product ownership is already locked to country-identity.",
  }),
  fromV6("edition", "editions", {
    canonicalStore: "edition lifecycle",
    primaryTables: ["editions"],
    retentionClass: "permanent-contest",
    sensitivityClass: "public-with-private-draft",
  }),
  fromV6("live-show", "shows", {
    canonicalStore: "show identity/configuration",
    primaryTables: ["shows"],
    retentionClass: "permanent-contest",
    sensitivityClass: "public-with-private-draft",
  }),
  fromV6("live-show", "show-runtime-state", {
    canonicalStore: "persisted live show operation state",
    primaryTables: ["shows"],
    retentionClass: "audit-history",
    sensitivityClass: "restricted-operational",
    notes: "Realtime is invalidation/transport only; persisted state remains authoritative.",
  }),
  fromV6("live-show", "running-order", {
    canonicalStore: "show/rundown canonical operation state",
    primaryTables: ["shows", "participants"],
    retentionClass: "permanent-contest",
    sensitivityClass: "public-with-private-draft",
  }),
  fromV6("delegation", "delegations", {
    canonicalStore: "delegation/country-account ownership",
    primaryTables: ["country_accounts", "studio2_role_assignments"],
    retentionClass: "audit-history",
    sensitivityClass: "restricted-personal",
  }),
  fromV6("participation", "participation-requirements", {
    canonicalStore: "edition + delegation participation requirement",
    primaryTables: [],
    retentionClass: "contest-lifecycle",
    sensitivityClass: "private-operational",
    notes: "Derived-domain ownership is locked; exhaustive physical-table mapping remains in the table audit.",
  }),
  fromV6("confirmation", "confirmation-rounds", {
    canonicalStore: "versioned confirmation submission windows",
    primaryTables: ["submission_rounds"],
    retentionClass: "audit-history",
    sensitivityClass: "private-operational",
  }),
  fromV6("confirmation", "confirmation-requirements", {
    canonicalStore: "effective edition-level confirmation requirement",
    primaryTables: [],
    retentionClass: "audit-history",
    sensitivityClass: "private-operational",
    notes: "Requirement ownership is canonical Confirmation; table-level uniqueness/invariant audit is still pending.",
  }),
  fromV6("confirmation", "confirmation-responses", {
    canonicalStore: "canonical confirmation response and revision state",
    primaryTables: [],
    retentionClass: "audit-history",
    sensitivityClass: "private-submission",
  }),
  fromV6("entry", "entries", {
    canonicalStore: "entry aggregate + current version pointer",
    primaryTables: ["participants"],
    retentionClass: "permanent-contest",
    sensitivityClass: "private-until-published",
  }),
  fromV6("entry", "entry-revisions", {
    canonicalStore: "immutable versioned entry submissions",
    primaryTables: [],
    retentionClass: "permanent-audit",
    sensitivityClass: "private-until-published",
    notes: "Immutable revision ownership is proven in V3 Entry; exact physical table names stay in the next table audit rather than being guessed here.",
  }),
  fromV6("entry", "entry-review-decisions", {
    canonicalStore: "review decision bound to exact immutable entry version",
    primaryTables: [],
    retentionClass: "permanent-audit",
    sensitivityClass: "restricted-operational",
  }),
  fromV6("media", "media-assets", {
    canonicalStore: "authorized quarantine + verified media asset lifecycle",
    primaryTables: [],
    retentionClass: "asset-lifecycle",
    sensitivityClass: "private-until-approved",
  }),
  fromV6("media", "media-revisions", {
    canonicalStore: "versioned media revision history",
    primaryTables: [],
    retentionClass: "asset-audit",
    sensitivityClass: "private-until-approved",
  }),
  fromV6("media", "media-validation", {
    canonicalStore: "shared media verification/review outcome",
    primaryTables: [],
    retentionClass: "asset-audit",
    sensitivityClass: "restricted-operational",
  }),
  fromV6("jury", "jury-rounds", {
    canonicalStore: "jury window lifecycle",
    primaryTables: ["jury_voting_windows"],
    retentionClass: "permanent-vote-audit",
    sensitivityClass: "restricted-voting",
  }),
  fromV6("jury", "jury-drafts", {
    canonicalStore: "revision-safe server jury drafts",
    primaryTables: [],
    retentionClass: "vote-draft-lifecycle",
    sensitivityClass: "highly-restricted-voting",
  }),
  fromV6("jury", "jury-ballots", {
    canonicalStore: "canonical finalized jury ballot evidence",
    primaryTables: [],
    retentionClass: "permanent-vote-audit",
    sensitivityClass: "highly-restricted-voting",
  }),
  fromV6("jury", "jury-declarations", {
    canonicalStore: "signed jury/integrity declaration evidence",
    primaryTables: [],
    retentionClass: "permanent-vote-audit",
    sensitivityClass: "highly-restricted-voting",
  }),
  fromV6("televote", "televote-rounds", {
    canonicalStore: "televote round state machine",
    primaryTables: ["televoting.rounds", "televoting_round_bindings"],
    retentionClass: "permanent-vote-audit",
    sensitivityClass: "restricted-voting",
  }),
  fromV6("televote", "televote-ballots", {
    canonicalStore: "idempotent canonical televote ballot operations",
    primaryTables: [],
    retentionClass: "permanent-vote-audit",
    sensitivityClass: "highly-restricted-voting",
  }),
  fromV6("televote", "televote-aggregate-totals", {
    canonicalStore: "derived totals from canonical accepted ballots",
    primaryTables: [],
    retentionClass: "permanent-result-evidence",
    sensitivityClass: "restricted-until-published",
    notes: "Aggregate totals are derived evidence, never a competing ballot authority.",
  }),
  fromV6("results", "results", {
    canonicalStore: "versioned official result lifecycle",
    primaryTables: ["results"],
    retentionClass: "permanent-contest",
    sensitivityClass: "restricted-until-published",
  }),
  fromV6("publication", "publication", {
    canonicalStore: "version-bound publication lifecycle",
    primaryTables: [],
    retentionClass: "permanent-audit",
    sensitivityClass: "restricted-operational",
  }),
  fromV6("notice", "official-notices", {
    canonicalStore: "versioned official communication",
    primaryTables: ["studio2_official_notices"],
    retentionClass: "permanent-communication",
    sensitivityClass: "audience-scoped",
  }),
  fromV6("acknowledgement", "acknowledgements", {
    canonicalStore: "notice-version + recipient acknowledgement receipt",
    primaryTables: [],
    retentionClass: "permanent-audit",
    sensitivityClass: "private-personal",
  }),
  fromV6("task", "tasks", {
    canonicalStore: "domain-derived participant and Organizer Task Engine",
    primaryTables: ["studio2_organizer_tasks"],
    retentionClass: "operational-history",
    sensitivityClass: "audience-scoped",
  }),
  fromV6("rules", "rules", {
    canonicalStore: "versioned rule release + interpretation domain",
    primaryTables: [],
    retentionClass: "permanent-governance",
    sensitivityClass: "public-with-private-draft",
  }),
  fromV6("integrity", "integrity-cases", {
    canonicalStore: "governed cases/evidence/appeal domain",
    primaryTables: [],
    retentionClass: "permanent-governance",
    sensitivityClass: "highly-restricted-integrity",
  }),
  fromV6("incident", "incidents", {
    canonicalStore: "incident lifecycle",
    primaryTables: [],
    retentionClass: "operational-audit",
    sensitivityClass: "restricted-operational",
  }),
  fromV6("next-in-line", "next-in-line", {
    canonicalStore: "Next in Line competition + versioned submission lifecycle",
    primaryTables: [],
    retentionClass: "permanent-contest",
    sensitivityClass: "private-until-published",
  }),
  fromV6("prediction", "predictions", {
    canonicalStore: "prediction round/submission/scoring lifecycle",
    primaryTables: ["prediction_rounds", "prediction_entries"],
    retentionClass: "permanent-engagement",
    sensitivityClass: "private-until-locked",
  }),
  fromV6("fantasy", "fantasy", {
    canonicalStore: "Fantasy configuration + roster/scoring lifecycle",
    primaryTables: [],
    retentionClass: "permanent-engagement",
    sensitivityClass: "private-until-locked",
  }),
  fromV6("community-profile", "community-profiles", {
    canonicalStore: "moderated public community identity",
    primaryTables: [],
    retentionClass: "account-lifecycle",
    sensitivityClass: "public-with-private-moderation",
  }),
  fromV6("personal-preference", "following-and-saved", {
    canonicalStore: "authenticated user-owned preference state",
    primaryTables: [],
    retentionClass: "account-lifecycle",
    sensitivityClass: "private-personal",
  }),
  fromV6("activity", "activity", {
    canonicalStore: "derived participant activity projection from canonical domain events",
    primaryTables: ["content_events"],
    retentionClass: "derived-history",
    sensitivityClass: "audience-scoped",
  }),
  fromV6("notification", "notifications", {
    canonicalStore: "domain-event notification candidate + delivery lifecycle",
    primaryTables: [],
    retentionClass: "delivery-history",
    sensitivityClass: "private-personal",
  }),
  fromV6("public-ux", "public-ux-telemetry", {
    canonicalStore: "privacy-bounded public UX telemetry",
    primaryTables: [],
    retentionClass: "bounded-telemetry",
    sensitivityClass: "privacy-bounded-aggregate",
  }),
] as const;

export const SYSTEM_V3_DOMAIN_NAMES = new Set(SYSTEM_V3_DOMAINS.map((domain) => domain.domain));

export function systemV3Domain(domain: string): SystemDomainRegistryRow | null {
  return SYSTEM_V3_DOMAINS.find((candidate) => candidate.domain === domain) ?? null;
}
