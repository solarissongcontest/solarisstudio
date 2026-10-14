import { SOLARIS_V6_DOMAINS } from "./solaris-v6-domain-registry";
import {
  V3_SYSTEM_PHYSICAL_AUDIT_SOURCE,
  V3_VERIFIED_DOMAIN_TABLES,
} from "./v3-system-physical-audit";

export type V3RetentionClass =
  | "ephemeral"
  | "operational"
  | "contest-record"
  | "account-record"
  | "audit-record";

export type V3SensitivityClass =
  | "public"
  | "internal"
  | "personal"
  | "restricted";

export type SystemDomainOwner = {
  domain: string;
  canonicalStore: string;
  authoritativeService: string;
  primaryTables: readonly string[];
  mutationCommands: readonly string[];
  projections: readonly string[];
  eventTypes: readonly string[];
  publicConsumers: readonly string[];
  organizerConsumers: readonly string[];
  backgroundConsumers: readonly string[];
  retentionClass: V3RetentionClass;
  sensitivityClass: V3SensitivityClass;
  physicalAuditStatus: "verified" | "pending";
  ownershipEvidence: readonly string[];
};

const VERIFIED_TABLES: Readonly<Record<string, readonly string[]>> = {
  edition: ["editions"],
  "live-show": ["shows"],
};

function retentionFor(domain: string): V3RetentionClass {
  if (["identity", "account", "session", "membership", "permissions", "personal-preference"].includes(domain)) {
    return "account-record";
  }
  if (["audit", "receipt", "integrity", "acknowledgement"].includes(domain)) return "audit-record";
  if (["notification", "activity", "public-ux", "system-job"].includes(domain)) return "operational";
  return "contest-record";
}

function sensitivityFor(domain: string): V3SensitivityClass {
  if (["identity", "account", "session", "membership", "permissions", "integrity", "audit"].includes(domain)) {
    return "restricted";
  }
  if (["personal-preference", "activity", "notification", "acknowledgement", "receipt"].includes(domain)) {
    return "personal";
  }
  if (["country-identity", "country-profile", "results", "rules", "publication", "story"].includes(domain)) {
    return "public";
  }
  return "internal";
}

const V6_DOMAIN_OWNERS: readonly SystemDomainOwner[] = SOLARIS_V6_DOMAINS.map((domain) => {
  const primaryTables = VERIFIED_TABLES[domain.id] ?? [];
  return {
    domain: domain.id,
    canonicalStore: domain.canonicalWriteModel,
    authoritativeService: `Existing server-authoritative ${domain.id} domain service/RPC layer`,
    primaryTables,
    mutationCommands: domain.commands,
    projections: [
      domain.canonicalReadProjection,
      domain.publicProjection,
      domain.participantProjection,
      domain.organizerProjection,
    ].filter((value): value is string => Boolean(value)),
    eventTypes: domain.events,
    publicConsumers: domain.publicProjection ? [domain.publicProjection] : [],
    organizerConsumers: domain.organizerProjection ? [domain.organizerProjection] : [],
    backgroundConsumers: domain.tasks.map((task) => `task:${task}`),
    retentionClass: retentionFor(domain.id),
    sensitivityClass: sensitivityFor(domain.id),
    physicalAuditStatus: primaryTables.length ? "verified" : "pending",
    ownershipEvidence: ["src/lib/solaris-v6-domain-registry.ts"],
  };
});

const CROSS_CUTTING_OWNERS: readonly SystemDomainOwner[] = [
  {
    domain: "identity",
    canonicalStore: "Supabase Auth identity",
    authoritativeService: "Supabase Auth plus authenticated server identity helpers",
    primaryTables: ["auth.users"],
    mutationCommands: ["identity.sign_in", "identity.sign_out", "identity.refresh"],
    projections: ["authenticated user identity"],
    eventTypes: ["identity.authenticated", "identity.signed_out"],
    publicConsumers: ["authentication surfaces"],
    organizerConsumers: ["Organizer access gate"],
    backgroundConsumers: [],
    retentionClass: "account-record",
    sensitivityClass: "restricted",
    physicalAuditStatus: "verified",
    ownershipEvidence: ["Supabase Auth", "src/routes/_authenticated/route.tsx"],
  },
  {
    domain: "account",
    canonicalStore: "Solaris account/profile state",
    authoritativeService: "authenticated account and profile service layer",
    primaryTables: [],
    mutationCommands: ["account.update"],
    projections: ["account settings projection"],
    eventTypes: ["account.changed"],
    publicConsumers: ["Me / account settings"],
    organizerConsumers: ["country-account support"],
    backgroundConsumers: [],
    retentionClass: "account-record",
    sensitivityClass: "personal",
    physicalAuditStatus: "pending",
    ownershipEvidence: ["src/lib/solaris-v6-surface-registry.ts"],
  },
  {
    domain: "session",
    canonicalStore: "Supabase Auth session state",
    authoritativeService: "Supabase Auth session lifecycle",
    primaryTables: ["auth.sessions", "auth.refresh_tokens"],
    mutationCommands: ["session.refresh", "session.revoke"],
    projections: ["current session", "device/session list"],
    eventTypes: ["session.changed", "session.revoked"],
    publicConsumers: ["authentication", "Me / security"],
    organizerConsumers: ["access enforcement"],
    backgroundConsumers: [],
    retentionClass: "account-record",
    sensitivityClass: "restricted",
    physicalAuditStatus: "verified",
    ownershipEvidence: ["Supabase Auth"],
  },
  {
    domain: "membership",
    canonicalStore: "edition/delegation membership and scoped role assignments",
    authoritativeService: "Permission Engine V2 membership/capability resolution",
    primaryTables: [],
    mutationCommands: ["membership.assign", "membership.revoke"],
    projections: ["effective membership projection"],
    eventTypes: ["membership.changed"],
    publicConsumers: ["participant availability"],
    organizerConsumers: ["People & Access"],
    backgroundConsumers: [],
    retentionClass: "account-record",
    sensitivityClass: "restricted",
    physicalAuditStatus: "pending",
    ownershipEvidence: ["src/lib/permissions-v2.ts", "src/lib/role-presets.ts"],
  },
  {
    domain: "voting-configuration",
    canonicalStore: "show/edition voting configuration consumed by Jury and Televote domains",
    authoritativeService: "server-authoritative voting configuration service/RPCs",
    primaryTables: [],
    mutationCommands: ["voting.configure"],
    projections: ["effective voting configuration"],
    eventTypes: ["voting.configuration_changed"],
    publicConsumers: ["voting eligibility and published voting rules"],
    organizerConsumers: ["Organizer Voting"],
    backgroundConsumers: ["jury", "televote", "results"],
    retentionClass: "contest-record",
    sensitivityClass: "internal",
    physicalAuditStatus: "pending",
    ownershipEvidence: ["src/lib/solaris-v6-domain-registry.ts"],
  },
  {
    domain: "receipt",
    canonicalStore: "immutable operation/submission receipt records",
    authoritativeService: "existing operation receipt and domain-ledger RPCs",
    primaryTables: ["studio2_operation_receipts"],
    mutationCommands: ["receipt.record", "receipt.reconcile"],
    projections: ["user receipt", "Organizer operation receipt"],
    eventTypes: ["receipt.recorded", "receipt.reconciled"],
    publicConsumers: ["confirmation/entry/jury/televote receipts"],
    organizerConsumers: ["operation receipt surfaces"],
    backgroundConsumers: ["reconciliation jobs"],
    retentionClass: "audit-record",
    sensitivityClass: "personal",
    physicalAuditStatus: "verified",
    ownershipEvidence: ["live Supabase inventory", "existing V3 flow ledgers"],
  },
  {
    domain: "audit",
    canonicalStore: "append-only Organizer and domain audit evidence",
    authoritativeService: "audit writers attached to canonical commands/RPCs",
    primaryTables: ["admin_audit_log"],
    mutationCommands: ["audit.append"],
    projections: ["recent Organizer changes", "audit history"],
    eventTypes: ["audit.recorded"],
    publicConsumers: [],
    organizerConsumers: ["Organizer recent changes", "specialist audit tools"],
    backgroundConsumers: ["security and integrity review"],
    retentionClass: "audit-record",
    sensitivityClass: "restricted",
    physicalAuditStatus: "verified",
    ownershipEvidence: ["src/lib/organizer-projection-data.server.ts"],
  },
  {
    domain: "feature-rollout",
    canonicalStore: "persistent feature-flag and scoped rollout state",
    authoritativeService: "server rollout probe and Organizer rollout controls",
    primaryTables: [],
    mutationCommands: ["rollout.change"],
    projections: ["effective feature rollout"],
    eventTypes: ["rollout.changed"],
    publicConsumers: ["feature boundaries"],
    organizerConsumers: ["Feature rollout"],
    backgroundConsumers: [],
    retentionClass: "operational",
    sensitivityClass: "restricted",
    physicalAuditStatus: "pending",
    ownershipEvidence: ["src/lib/feature-flags.ts", "src/integrations/v3/rollout-probe.server.ts"],
  },
  {
    domain: "system-job",
    canonicalStore: "bounded background execution and retry state",
    authoritativeService: "domain-owned workers and scheduled jobs",
    primaryTables: [],
    mutationCommands: ["job.claim", "job.complete", "job.fail", "job.retry"],
    projections: ["job health", "delivery/retry diagnostics"],
    eventTypes: ["job.started", "job.completed", "job.failed"],
    publicConsumers: [],
    organizerConsumers: ["Delivery & jobs", "System health"],
    backgroundConsumers: ["notification", "publication", "media", "reconciliation"],
    retentionClass: "operational",
    sensitivityClass: "internal",
    physicalAuditStatus: "pending",
    ownershipEvidence: ["existing domain workers; physical inventory pending"],
  },
  {
    domain: "story",
    canonicalStore: "edition story/editorial publication state",
    authoritativeService: "storytelling server/RPC layer",
    primaryTables: [],
    mutationCommands: ["story.publish", "story.update", "story.hide"],
    projections: ["published story/archive projection"],
    eventTypes: ["story.changed", "story.published"],
    publicConsumers: ["stories", "archive", "anniversary"],
    organizerConsumers: ["Organizer Storytelling"],
    backgroundConsumers: ["publication"],
    retentionClass: "contest-record",
    sensitivityClass: "public",
    physicalAuditStatus: "pending",
    ownershipEvidence: ["Organizer Storytelling surfaces"],
  },
];

const LOGICAL_SYSTEM_DOMAIN_REGISTRY: readonly SystemDomainOwner[] = [
  ...V6_DOMAIN_OWNERS,
  ...CROSS_CUTTING_OWNERS,
];

const physicalEvidence = `${V3_SYSTEM_PHYSICAL_AUDIT_SOURCE.method} · ${V3_SYSTEM_PHYSICAL_AUDIT_SOURCE.projectId} · ${V3_SYSTEM_PHYSICAL_AUDIT_SOURCE.inspectedAt}`;

/**
 * Canonical exported ownership registry. Logical domain ownership is defined
 * above; verified physical tables are overlaid from the read-only Supabase
 * inventory so schema evidence cannot drift into a separate forgotten report.
 */
export const V3_SYSTEM_DOMAIN_REGISTRY: readonly SystemDomainOwner[] =
  LOGICAL_SYSTEM_DOMAIN_REGISTRY.map((domain) => {
    const verifiedTables = V3_VERIFIED_DOMAIN_TABLES[domain.domain];
    if (!verifiedTables?.length) return domain;
    return {
      ...domain,
      primaryTables: verifiedTables,
      physicalAuditStatus: "verified",
      ownershipEvidence: [...domain.ownershipEvidence, physicalEvidence],
    };
  });

export const V3_REQUIRED_SYSTEM_CONCEPTS = [
  "identity",
  "accounts",
  "sessions",
  "memberships",
  "capabilities",
  "countries",
  "country-historical-identity",
  "editions",
  "shows",
  "show-runtime-state",
  "running-order",
  "confirmation-rounds",
  "confirmation-requirements",
  "confirmation-responses",
  "entries",
  "entry-revisions",
  "entry-review-decisions",
  "media-assets",
  "media-revisions",
  "media-validation",
  "jury-rounds",
  "jury-drafts",
  "jury-ballots",
  "jury-declarations",
  "televote-rounds",
  "televote-ballots",
  "televote-aggregate-totals",
  "vote-validation",
  "voting-configuration",
  "voting-integrity-cases",
  "results",
  "result-versions",
  "result-publication",
  "publications",
  "notifications",
  "notification-deliveries",
  "stories",
  "rules",
  "rule-versions",
  "interpretations",
  "following",
  "saved-items",
  "fantasy",
  "predictions",
  "tasks-actions",
  "receipts",
  "audit",
  "incidents",
  "feature-rollout",
  "system-jobs",
] as const;

export type V3SystemConcept = (typeof V3_REQUIRED_SYSTEM_CONCEPTS)[number];

/**
 * Fine-grained concepts from the System V3 specification mapped onto exactly
 * one canonical domain owner. Several concepts intentionally share an owner;
 * that is preferable to inventing competing stores for revisions, delivery
 * projections or aggregate views.
 */
export const V3_SYSTEM_CONCEPT_OWNER: Readonly<Record<V3SystemConcept, string>> = {
  identity: "identity",
  accounts: "account",
  sessions: "session",
  memberships: "membership",
  capabilities: "permissions",
  countries: "country-identity",
  "country-historical-identity": "country-identity",
  editions: "edition",
  shows: "live-show",
  "show-runtime-state": "live-show",
  "running-order": "live-show",
  "confirmation-rounds": "confirmation",
  "confirmation-requirements": "confirmation",
  "confirmation-responses": "confirmation",
  entries: "entry",
  "entry-revisions": "entry",
  "entry-review-decisions": "entry",
  "media-assets": "media",
  "media-revisions": "media",
  "media-validation": "media",
  "jury-rounds": "jury",
  "jury-drafts": "jury",
  "jury-ballots": "jury",
  "jury-declarations": "jury",
  "televote-rounds": "televote",
  "televote-ballots": "televote",
  "televote-aggregate-totals": "televote",
  "vote-validation": "integrity",
  "voting-configuration": "voting-configuration",
  "voting-integrity-cases": "integrity",
  results: "results",
  "result-versions": "results",
  "result-publication": "publication",
  publications: "publication",
  notifications: "notification",
  "notification-deliveries": "notification",
  stories: "story",
  rules: "rules",
  "rule-versions": "rules",
  interpretations: "rules",
  following: "personal-preference",
  "saved-items": "personal-preference",
  fantasy: "fantasy",
  predictions: "prediction",
  "tasks-actions": "task",
  receipts: "receipt",
  audit: "audit",
  incidents: "incident",
  "feature-rollout": "feature-rollout",
  "system-jobs": "system-job",
};

export function v3SystemDomain(domain: string) {
  return V3_SYSTEM_DOMAIN_REGISTRY.find((item) => item.domain === domain) ?? null;
}
