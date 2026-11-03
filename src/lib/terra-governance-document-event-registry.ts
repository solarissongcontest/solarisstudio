export const TERRA_GOVERNANCE_DOCUMENT_EVENT_CONSUMERS = {
  "world.document.created": ["world.documents.projection"],
  "world.document.version_created": ["world.documents.projection"],
  "world.document.version_published": [
    "world.documents.archive",
    "world.documents.search",
    "world.documents.projection",
  ],
  "world.document.version_superseded": [
    "world.documents.archive",
    "world.documents.search",
    "world.documents.projection",
  ],
} as const;

export type TerraGovernanceDocumentEventType = keyof typeof TERRA_GOVERNANCE_DOCUMENT_EVENT_CONSUMERS;

export const TERRA_GOVERNANCE_DOCUMENT_ARCHIVE_OWNERSHIP = {
  canonicalState: "public.world_document_versions",
  semanticEvents: "private.v3_domain_events",
  deliveryReceipts: "private.v3_domain_event_consumer_receipts",
  mode: "derived-no-copy",
} as const;

export const TERRA_GOVERNANCE_DOCUMENT_SEARCH_OWNERSHIP = {
  projection: "public.world_get_document_index_v1",
  canonicalState: ["public.world_documents", "public.world_document_versions", "public.world_document_version_provisions"],
  mode: "live-permission-aware",
} as const;
