import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  TERRA_GOVERNANCE_DOCUMENT_ARCHIVE_OWNERSHIP,
  TERRA_GOVERNANCE_DOCUMENT_EVENT_CONSUMERS,
  TERRA_GOVERNANCE_DOCUMENT_SEARCH_OWNERSHIP,
} from "./terra-governance-document-event-registry";
import {
  TERRA_GOVERNANCE_TG4_EVENT_TYPES,
  TERRA_GOVERNANCE_TG4_MIGRATIONS,
} from "./terra-governance-domain-registry";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const migration = source(`supabase/migrations/${TERRA_GOVERNANCE_TG4_MIGRATIONS[2]}`);

describe("Terra Solaris Governance TG4 document Archive/search projections", () => {
  it("keeps existing V3 Archive as derived history instead of creating world_archive", () => {
    expect(TERRA_GOVERNANCE_DOCUMENT_ARCHIVE_OWNERSHIP).toEqual({
      canonicalState: "public.world_document_versions",
      semanticEvents: "private.v3_domain_events",
      deliveryReceipts: "private.v3_domain_event_consumer_receipts",
      mode: "derived-no-copy",
    });
    expect(migration).not.toMatch(/create table public\.world_archive/i);
    expect(migration).toContain("'derived-archive-no-copy'");
  });

  it("registers consumers for every canonical TG4 document event", () => {
    expect(Object.keys(TERRA_GOVERNANCE_DOCUMENT_EVENT_CONSUMERS)).toEqual(
      TERRA_GOVERNANCE_TG4_EVENT_TYPES,
    );
    expect(TERRA_GOVERNANCE_DOCUMENT_EVENT_CONSUMERS["world.document.version_published"]).toEqual([
      "world.documents.archive",
      "world.documents.search",
      "world.documents.projection",
    ]);
  });

  it("reconciles through the existing V3 DomainEvent consumer receipt contract", () => {
    expect(migration).toContain("public.world_reconcile_document_event_v1");
    expect(migration).toContain("private.v3_domain_events%rowtype");
    expect(migration).toContain("public.studio2_complete_domain_event_delivery(");
    expect(migration).toContain("private.studio2_request_is_service_role()");
    expect(migration).not.toMatch(/insert into public\.world_archive/i);
  });

  it("provides bounded document index and reader projections", () => {
    expect(migration).toContain("public.world_get_document_index_v1");
    expect(migration).toContain("public.world_get_document_v1");
    expect(migration).toContain("public.world_get_document_archive_v1");
    expect(migration).toContain("'provisions', v_provisions");
    expect(migration).toContain("'history', v_history");
    expect(migration).toContain("'allowedActions', v_actions");
  });

  it("keeps draft revisions manager-only in the reader and Archive projections", () => {
    expect(migration).toContain("v_version.publication_state = 'draft'");
    expect(migration).toContain("and not v_can_manage");
    expect(migration).toContain("or (v_can_manage and history_row.publication_state = 'draft')");
    expect(migration).toContain("or (v_can_manage and version_row.publication_state = 'draft')");
  });

  it("does not expose source provenance to ordinary public/member readers", () => {
    expect(migration).toContain(
      "'sourceProvenance', case when v_can_manage then version_row.source_provenance else null end",
    );
    expect(migration).toContain(
      "'sourceDescription', case when v_can_manage then version_row.source_description else null end",
    );
  });

  it("implements permission-aware live search over current published content only", () => {
    expect(TERRA_GOVERNANCE_DOCUMENT_SEARCH_OWNERSHIP.mode).toBe("live-permission-aware");
    expect(migration).toContain("private.world_document_can_read_v1(document_row.id)");
    expect(migration).toContain("version_row.publication_state = 'published'");
    expect(migration).toContain("plainto_tsquery('simple', v_query)");
    expect(migration).not.toMatch(/publication_state = 'draft'[\s\S]{0,400}plainto_tsquery/);
  });

  it("keeps anonymous projection execution bounded and mutation-free", () => {
    expect(migration).toContain(
      "grant execute on function public.world_get_document_index_v1(text,text,integer)\n  to anon, authenticated, service_role",
    );
    expect(migration).toContain(
      "grant execute on function public.world_get_document_v1(text,text,integer)\n  to anon, authenticated, service_role",
    );
    expect(migration).not.toMatch(/grant execute on function public\.world_reconcile_document_event_v1[^;]+to anon/i);
  });

  it("registers Archive/projection migration adoption immediately", () => {
    expect(migration).toContain("'v3.tg4.world-document-archive-projection'");
    expect(migration).toContain("public.v3_register_migration_contract");
  });
});
